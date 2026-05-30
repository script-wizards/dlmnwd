import { expect, test } from "bun:test";
import { rollKindredClass } from "../src/rules.ts";

// Invented, non-canon kindreds. Only the Mortal/Fairy split matters here: the
// two devotional classes are restricted to mortals.
const KINDREDS = [
  { id: "bristlekin", kindredType: "Mortal" },
  { id: "plainfolk", kindredType: "Mortal" },
  { id: "wispkin", kindredType: "Fairy" },
  { id: "gloamkin", kindredType: "Fairy" },
  { id: "thornling", kindredType: "Fairy" },
];

const CLASSES = [
  { id: "cleric" },
  { id: "enchanter" },
  { id: "fighter" },
  { id: "friar" },
  { id: "hunter" },
  { id: "knight" },
  { id: "magician" },
  { id: "thief" },
];

// High enough that a legal-but-rare draw (a cleric needs a mortal kindred) is
// effectively certain to appear.
const ROLLS = 500;
const rolls = (opts: Parameters<typeof rollKindredClass>[2]) =>
  Array.from({ length: ROLLS }, () => rollKindredClass(KINDREDS, CLASSES, opts)!);

test("both chosen: a legal pair passes through, an illegal one is null", () => {
  const legal = rollKindredClass(KINDREDS, CLASSES, { kindred: KINDREDS[1], klass: CLASSES[0] });
  expect(legal).toEqual({ kindred: KINDREDS[1], klass: CLASSES[0] });

  const illegal = rollKindredClass(KINDREDS, CLASSES, { kindred: KINDREDS[2], klass: CLASSES[0] });
  expect(illegal).toBeNull(); // a fairy kindred cannot be a cleric
});

test("a random class for a non-mortal is never a cleric or friar", () => {
  for (const r of rolls({ kindred: KINDREDS[2] })) {
    expect(r.kindred.id).toBe("wispkin");
    expect(["cleric", "friar"]).not.toContain(r.klass.id);
  }
});

test("a random kindred for a cleric is always mortal", () => {
  for (const r of rolls({ klass: CLASSES[0] })) {
    expect(r.klass.id).toBe("cleric");
    expect(r.kindred.kindredType).toBe("Mortal");
  }
});

test("a fully random pair is always a legal combination", () => {
  const seenClasses = new Set<string>();
  const seenKindreds = new Set<string>();
  for (const r of rolls({})) {
    if (r.kindred.kindredType !== "Mortal") expect(["cleric", "friar"]).not.toContain(r.klass.id);
    seenClasses.add(r.klass.id);
    seenKindreds.add(r.kindred.id);
  }
  expect(seenKindreds.size).toBe(KINDREDS.length);
  expect(seenClasses.size).toBe(CLASSES.length);
});

test("a Chaotic alignment excludes clerics and friars from the roll", () => {
  for (const r of rolls({ alignment: "Chaotic" })) {
    expect(["cleric", "friar"]).not.toContain(r.klass.id);
  }
  const seen = new Set(rolls({ alignment: "Lawful" }).map((r) => r.klass.id));
  expect(seen).toContain("cleric");
});

test("no legal pair yields null", () => {
  expect(
    rollKindredClass(KINDREDS, CLASSES, { klass: CLASSES[0], alignment: "Chaotic" }),
  ).toBeNull();
  expect(rollKindredClass([KINDREDS[2]], [CLASSES[0], CLASSES[3]])).toBeNull();
  expect(rollKindredClass([], CLASSES)).toBeNull();
  expect(rollKindredClass(KINDREDS, [])).toBeNull();
});
