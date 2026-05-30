import type { Database } from "bun:sqlite";
import { isFresh, markBuilt } from "./db.ts";
import { parseAdventuringItems } from "./parse/equipment.ts";
import { parseClasses } from "./parse/class.ts";
import { parseHexes, withBookmarks } from "./parse/hex.ts";
import { parseKindreds } from "./parse/kindred.ts";
import { parseMonsters } from "./parse/monster.ts";
import { parseSpells } from "./parse/spell.ts";
import { type Book, pdfPath } from "./pdf/config.ts";
import { extractPages } from "./pdf/extract.ts";
import { hexBookmarks } from "./pdf/outline.ts";

const ALL_BOOKS: Book[] = ["players", "monsters", "campaign"];

export interface BuildResult {
  pages: number;
  spells: number;
  kindreds: number;
  classes: number;
  monsters: number; // primary entries (excludes secondary stat blocks)
  subCreatures: number;
  hexes: number;
}

/** Books that the user has actually configured a PDF path for. */
export function configuredBooks(): { book: Book; path: string }[] {
  const found: { book: Book; path: string }[] = [];
  for (const book of ALL_BOOKS) {
    try {
      found.push({ book, path: pdfPath(book) });
    } catch {
      // not configured, skip
    }
  }
  return found;
}

/** Parse a PDF into the database (pages + FTS + structured tables). */
export function build(db: Database, book: Book, path: string): BuildResult {
  const pages = extractPages(path);
  const spells = book === "players" ? parseSpells(pages) : [];
  const kindreds = book === "players" ? parseKindreds(pages) : [];
  const classes = book === "players" ? parseClasses(pages) : [];
  const monsters = book === "monsters" ? parseMonsters(pages) : [];
  const hexes =
    book === "campaign" ? withBookmarks(hexBookmarks(path), parseHexes(pages), pages) : [];
  const adventuringItems = book === "players" ? parseAdventuringItems(pages) : [];

  db.transaction(() => {
    db.query("DELETE FROM pages WHERE book = ?").run(book);
    db.query("DELETE FROM pages_fts WHERE book = ?").run(book);
    db.query("DELETE FROM spells WHERE book = ?").run(book);
    db.query("DELETE FROM kindreds WHERE book = ?").run(book);
    db.query("DELETE FROM classes WHERE book = ?").run(book);
    db.query("DELETE FROM monsters WHERE book = ?").run(book);
    db.query("DELETE FROM hexes WHERE book = ?").run(book);
    db.query("DELETE FROM lookup_tables WHERE book = ?").run(book);

    const insPage = db.query("INSERT INTO pages (book, page, text) VALUES (?, ?, ?)");
    const insFts = db.query("INSERT INTO pages_fts (text, book, page) VALUES (?, ?, ?)");
    pages.forEach((text, idx) => {
      const page = idx + 1;
      insPage.run(book, page, text);
      insFts.run(text, book, page);
    });

    const insSpell = db.query(
      `INSERT INTO spells (book, name, tradition, rank, prayerName, duration, "range", body, page)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const s of spells) {
      insSpell.run(
        book,
        s.name,
        s.tradition ?? null,
        s.rank ?? null,
        s.prayerName ?? null,
        s.duration ?? null,
        s.range ?? null,
        s.body,
        s.source.page,
      );
    }

    const insKindred = db.query("INSERT INTO kindreds (book, id, name, data) VALUES (?, ?, ?, ?)");
    for (const k of kindreds) insKindred.run(book, k.id, k.name, JSON.stringify(k));

    const insClass = db.query("INSERT INTO classes (book, id, name, data) VALUES (?, ?, ?, ?)");
    for (const c of classes) insClass.run(book, c.id, c.name, JSON.stringify(c));

    const insMonster = db.query("INSERT INTO monsters (book, id, name, data) VALUES (?, ?, ?, ?)");
    for (const m of monsters) insMonster.run(book, m.id, m.name, JSON.stringify(m));

    const insHex = db.query("INSERT INTO hexes (book, id, name, data) VALUES (?, ?, ?, ?)");
    for (const h of hexes) insHex.run(book, h.id, h.name ?? "", JSON.stringify(h));

    if (adventuringItems.length > 0) {
      db.query("INSERT OR REPLACE INTO lookup_tables (book, name, data) VALUES (?, ?, ?)").run(
        book,
        "adventuring_items",
        JSON.stringify(adventuringItems),
      );
    }

    markBuilt(db, book, path);
  })();

  return {
    pages: pages.length,
    spells: spells.length,
    kindreds: kindreds.length,
    classes: classes.length,
    monsters: monsters.filter((m) => !m.parent).length,
    subCreatures: monsters.filter((m) => m.parent).length,
    hexes: hexes.length,
  };
}

/** Build a book's index if the PDF has changed since it was last indexed. */
export function ensureBuilt(db: Database, book: Book, path: string): void {
  if (!isFresh(db, book, path)) {
    process.stderr.write(`dw: building ${book} index…\n`);
    build(db, book, path);
  }
}

export function ensureAllConfigured(db: Database): void {
  for (const { book, path } of configuredBooks()) ensureBuilt(db, book, path);
}
