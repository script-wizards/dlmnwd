import { expect, test } from "bun:test";
import { parseAdventuringItems } from "../src/parse/equipment.ts";

// Invented fixture: a page whose body prose mentions "Adventuring Items" the way
// the real step-8 text does, followed further down by the actual 4-up d20 table.
// The parser must find the table, not the body prose. Every sentence, item, and
// page reference below is made up; only the table's shape is real.
const page = [
  "8. ROLL KIT                                                         10. NOTE PACE",
  "Kit is settled with a handful of dice. Every character leaves        Pace follows from how much a character hauls around",
  "home carrying the following.                                         (see Load, p400).",
  "Standard kit: Boots that fit. A satchel holding one day of          Unburdened pace: An unburdened character moves at",
  "bread, a flask, and a fire-striker. A purse of 2d6 shillings.       Pace 40, covers 100' a Turn indoors, and banks 8 Road",
  "Trade kit: Tools, guard, and oddments listed under a                Points a day in open country (see Roads,",
  "character's Trade.                                                  p410).",
  "Adventuring items: Pick or roll as many as 4 entries on the         11. PICK A LEANING",
  "Adventuring Items table.                                            Settle on Steady, Middling, or Wayward (see Leanings,",
  "",
  "",
  "                                               ADVENTURING ITEMS",
  "d20 Item          d20 Item             d20 Item              d20 Item",
  "  1   Bell         6   Fishhooks       11  Lodestone        16  Signal mirror",
  "  2   Birdlime      7   Glue pot        12  Mirepitch        17  Snare wire",
  "  3   Cage          8   Grease and rag  13  Netting (20')    18  Splint",
  "  4   Caltrops      9   Handbarrow      14  Pry bar          19  Whetstones",
  "  5   Drift-chalk   10  Kettle hook     15  Salt block       20  Wormwood",
  "",
  "                                                                19",
].join("\n");

test("parses all 20 adventuring items in order", () => {
  const items = parseAdventuringItems([page]);
  expect(items.length).toBe(20);
  expect(items[0]).toBe("Bell");
  expect(items[5]).toBe("Fishhooks");
  expect(items[10]).toBe("Lodestone");
  expect(items[15]).toBe("Signal mirror");
  expect(items[19]).toBe("Wormwood");
});

test("does not pick up body prose from the same page", () => {
  const items = parseAdventuringItems([page]);
  // These are body-prose fragments that must NOT appear as items.
  expect(items).not.toContain("bread, a flask, and a fire-striker. A purse of 2d6 shillings.");
  expect(items).not.toContain("Kit is settled with a handful of dice.");
  expect(items).not.toContain("bread");
  expect(items).not.toContain("p410).");
});

test("returns empty when the table is not found", () => {
  expect(parseAdventuringItems(["nothing here"])).toEqual([]);
});

test("returns empty when fewer than 10 entries are found", () => {
  const partial = ["ADVENTURING ITEMS", "d20 Item", "1 Bell", "2 Birdlime", ""].join("\n");
  expect(parseAdventuringItems([partial])).toEqual([]);
});

test("handles items with multi-word names", () => {
  const items = parseAdventuringItems([page]);
  expect(items[7]).toBe("Grease and rag");
  expect(items[12]).toBe("Netting (20')");
  expect(items[10]).toBe("Lodestone");
});
