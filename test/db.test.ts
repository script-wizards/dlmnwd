import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import {
  findSpellRow,
  hexList,
  migrate,
  monsterNames,
  searchPages,
  spellNames,
} from "../src/db.ts";

function seed(): Database {
  const db = new Database(":memory:");
  migrate(db);
  const page = db.query("INSERT INTO pages (book, page, text) VALUES (?, ?, ?)");
  const fts = db.query("INSERT INTO pages_fts (text, book, page) VALUES (?, ?, ?)");
  const rows: [string, number, string][] = [
    ["players", 80, "Charm Person makes a humanoid target regard the caster as a friend."],
    ["players", 81, "Emberburst blooms in a gout of sparks, dealing burn damage."],
  ];
  for (const [book, p, text] of rows) {
    page.run(book, p, text);
    fts.run(text, book, p);
  }
  db.query(
    `INSERT INTO spells (book, name, tradition, rank, duration, "range", body, page)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("players", "Emberburst", "Arcane", 3, "Instant", "120'", "A burst of flame.", 81);
  return db;
}

test("fts5 is available and finds the right page", () => {
  const hits = searchPages(seed(), "charm", 5);
  expect(hits.length).toBe(1);
  expect(hits[0].page).toBe(80);
  expect(hits[0].book).toBe("players");
  expect(hits[0].snippet).toContain("«");
});

test("multi-word and punctuated queries do not throw", () => {
  const db = seed();
  expect(() => searchPages(db, "burn damage", 5)).not.toThrow();
  expect(() => searchPages(db, 'sparks: "gout"', 5)).not.toThrow();
  expect(searchPages(db, "sparks", 5).some((h) => h.page === 81)).toBe(true);
});

test("list helpers return sorted names/ids for the picker", () => {
  const db = seed();
  db.query("INSERT INTO monsters (book, id, name, data) VALUES (?, ?, ?, ?)").run(
    "monsters",
    "bog-ghast",
    "Bog-Ghast",
    "{}",
  );
  db.query("INSERT INTO hexes (book, id, name, data) VALUES (?, ?, ?, ?)").run(
    "campaign",
    "0908",
    "The Sample Lair",
    "{}",
  );
  expect(spellNames(db)).toEqual(["Emberburst"]);
  expect(monsterNames(db)).toEqual(["Bog-Ghast"]);
  expect(hexList(db)).toEqual(["0908  The Sample Lair"]);
});

test("spell lookup: exact wins, then substring, else null", () => {
  const db = seed();
  expect(findSpellRow(db, "emberburst")?.name).toBe("Emberburst");
  expect(findSpellRow(db, "ember")?.name).toBe("Emberburst");
  expect(findSpellRow(db, "no such spell")).toBeNull();
});
