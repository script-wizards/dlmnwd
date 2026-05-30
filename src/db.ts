import { Database } from "bun:sqlite";
import { mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ParsedClass } from "./parse/class.ts";
import type { ParsedKindred } from "./parse/kindred.ts";
import type { Hex, Monster } from "./schema.ts";

// The database is a machine-local cache derived from the user's own PDFs,
// the same status as any extraction cache. It is never committed or shipped.
const CACHE_DIR = join(homedir(), ".cache", "dw");
const DB_PATH = join(CACHE_DIR, "dw.db");

export interface SearchHit {
  book: string;
  page: number;
  snippet: string;
}

export interface SpellRow {
  book: string;
  name: string;
  tradition: string | null;
  rank: number | null;
  prayerName: string | null;
  duration: string | null;
  range: string | null;
  body: string;
  page: number;
}

export function openDb(): Database {
  mkdirSync(CACHE_DIR, { recursive: true });
  const db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

export function migrate(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS sources (
    book TEXT PRIMARY KEY, path TEXT NOT NULL, size INTEGER, mtime REAL, built_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS pages (
    book TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL,
    PRIMARY KEY (book, page)
  )`);
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
    text, book UNINDEXED, page UNINDEXED, tokenize = 'porter unicode61'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS spells (
    book TEXT NOT NULL, name TEXT NOT NULL, tradition TEXT, rank INTEGER,
    prayerName TEXT, duration TEXT, "range" TEXT, body TEXT, page INTEGER
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_spells_name ON spells (name)`);
  db.run(`CREATE TABLE IF NOT EXISTS kindreds (
    book TEXT NOT NULL, id TEXT NOT NULL, name TEXT, data TEXT,
    PRIMARY KEY (book, id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS classes (
    book TEXT NOT NULL, id TEXT NOT NULL, name TEXT, data TEXT,
    PRIMARY KEY (book, id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS monsters (
    book TEXT NOT NULL, id TEXT NOT NULL, name TEXT, data TEXT,
    PRIMARY KEY (book, id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hexes (
    book TEXT NOT NULL, id TEXT NOT NULL, name TEXT, data TEXT,
    PRIMARY KEY (book, id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS lookup_tables (
    book TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (book, name)
  )`);
}

/** True when the stored index matches the PDF currently on disk. */
export function isFresh(db: Database, book: string, path: string): boolean {
  const st = statSync(path);
  const row = db.query("SELECT size, mtime FROM sources WHERE book = ?").get(book) as {
    size: number;
    mtime: number;
  } | null;
  return row !== null && row.size === st.size && row.mtime === st.mtimeMs;
}

export function markBuilt(db: Database, book: string, path: string): void {
  const st = statSync(path);
  db.query(
    `INSERT OR REPLACE INTO sources (book, path, size, mtime, built_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(book, path, st.size, st.mtimeMs, new Date().toISOString());
}

/** Full-text search across all indexed pages. */
export function searchPages(db: Database, query: string, limit = 8): SearchHit[] {
  // Quote each term so punctuation in the query can't break FTS5 MATCH syntax.
  const match = query
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" ");
  if (!match) return [];
  return db
    .query(
      `SELECT book, page, snippet(pages_fts, 0, '«', '»', ' … ', 12) AS snippet
       FROM pages_fts WHERE pages_fts MATCH ? ORDER BY rank LIMIT ?`,
    )
    .all(match, limit) as SearchHit[];
}

/** Look up a spell by name: exact match first, then shortest substring match. */
export function findSpellRow(db: Database, query: string): SpellRow | null {
  const q = query.trim().toLowerCase();
  const exact = db
    .query(`SELECT * FROM spells WHERE lower(name) = ? LIMIT 1`)
    .get(q) as SpellRow | null;
  if (exact) return exact;
  return db
    .query(`SELECT * FROM spells WHERE lower(name) LIKE ? ORDER BY length(name) LIMIT 1`)
    .get(`%${q}%`) as SpellRow | null;
}

export function findKindred(db: Database, id: string): ParsedKindred | null {
  const row = db.query("SELECT data FROM kindreds WHERE id = ?").get(id.toLowerCase()) as {
    data: string;
  } | null;
  return row ? (JSON.parse(row.data) as ParsedKindred) : null;
}

export function allKindredIds(db: Database): string[] {
  return (db.query("SELECT id FROM kindreds ORDER BY id").all() as { id: string }[]).map(
    (r) => r.id,
  );
}

export function allKindreds(db: Database): ParsedKindred[] {
  return (db.query("SELECT data FROM kindreds ORDER BY id").all() as { data: string }[]).map(
    (r) => JSON.parse(r.data) as ParsedKindred,
  );
}

export function findClass(db: Database, id: string): ParsedClass | null {
  const row = db.query("SELECT data FROM classes WHERE id = ?").get(id.toLowerCase()) as {
    data: string;
  } | null;
  return row ? (JSON.parse(row.data) as ParsedClass) : null;
}

export function allClassIds(db: Database): string[] {
  return (db.query("SELECT id FROM classes ORDER BY id").all() as { id: string }[]).map(
    (r) => r.id,
  );
}

export function allClasses(db: Database): ParsedClass[] {
  return (db.query("SELECT data FROM classes ORDER BY id").all() as { data: string }[]).map(
    (r) => JSON.parse(r.data) as ParsedClass,
  );
}

/** Find monsters by fuzzy name/id match (exact first, then substring by name length). */
export function findMonsters(db: Database, query: string): Monster[] {
  const q = query.trim().toLowerCase();
  const rows = db
    .query(
      `SELECT data FROM monsters WHERE lower(name) = ? OR id = ?
       OR lower(name) LIKE ? OR id LIKE ?
       ORDER BY length(name) LIMIT 10`,
    )
    .all(q, q, `%${q}%`, `%${q}%`) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as Monster);
}

// Primary entries only — secondary stat blocks (those with a parent) are
// excluded from the browse count, the same as the picker list.
export function monsterCount(db: Database): number {
  return (
    db
      .query("SELECT count(*) AS n FROM monsters WHERE json_extract(data, '$.parent') IS NULL")
      .get() as { n: number }
  ).n;
}

/** The secondary stat blocks (mounts, spawn, variants) belonging to a primary entry. */
export function childrenOf(db: Database, parentName: string): Monster[] {
  return (
    db
      .query("SELECT data FROM monsters WHERE json_extract(data, '$.parent') = ? ORDER BY name")
      .all(parentName) as { data: string }[]
  ).map((r) => JSON.parse(r.data) as Monster);
}

export function findHex(db: Database, id: string): Hex | null {
  const row = db.query("SELECT data FROM hexes WHERE id = ?").get(id.trim()) as {
    data: string;
  } | null;
  return row ? (JSON.parse(row.data) as Hex) : null;
}

export function hexCount(db: Database): number {
  return (db.query("SELECT count(*) AS n FROM hexes").get() as { n: number }).n;
}

// Primary entries only; secondary stat blocks stay out of the picker/list.
export function monsterNames(db: Database): string[] {
  return (
    db
      .query("SELECT name FROM monsters WHERE json_extract(data, '$.parent') IS NULL ORDER BY name")
      .all() as { name: string }[]
  ).map((r) => r.name);
}

/**
 * Rows for the fzf picker: every primary name, annotated with its sub-creatures
 * so a sub-creature's name surfaces its parent without it becoming a top-level
 * entry. Tab-separated, so the name is field 1 for the preview and selection.
 */
export function monsterPickerRows(db: Database): string[] {
  const byParent = new Map<string, string[]>();
  for (const k of db
    .query(
      "SELECT json_extract(data, '$.parent') AS parent, name FROM monsters WHERE json_extract(data, '$.parent') IS NOT NULL ORDER BY name",
    )
    .all() as { parent: string; name: string }[]) {
    byParent.set(k.parent, [...(byParent.get(k.parent) ?? []), k.name]);
  }
  return monsterNames(db).map((name) => {
    const kids = byParent.get(name);
    return kids ? `${name}\t↳ ${kids.join(", ")}` : name;
  });
}

export function spellNames(db: Database): string[] {
  return (db.query("SELECT name FROM spells ORDER BY name").all() as { name: string }[]).map(
    (r) => r.name,
  );
}

/** "<id>  <name>" per hex, so a picker can take the id from the first field. */
export function hexList(db: Database): string[] {
  return (
    db.query("SELECT id, name FROM hexes ORDER BY id").all() as { id: string; name: string }[]
  ).map((r) => `${r.id}  ${r.name}`);
}

/** Retrieve a named lookup table (e.g. adventuring items) from the index. */
export function getLookupTable(db: Database, book: string, name: string): string[] {
  const row = db
    .query("SELECT data FROM lookup_tables WHERE book = ? AND name = ?")
    .get(book, name) as {
    data: string;
  } | null;
  return row ? (JSON.parse(row.data) as string[]) : [];
}
