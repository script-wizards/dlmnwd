import { expect, test } from "bun:test";
import { parseCatalog, parseEncumbrance } from "../src/parse/gear.ts";

// Place text at fixed column offsets to mimic pdftotext -layout output.
function at(cols: [number, string][]): string {
  let line = "";
  for (const [x, text] of cols) {
    if (line.length < x) line += " ".repeat(x - line.length);
    line += text;
  }
  return line;
}

// Invented equipment page: two tables side by side, the right one followed by a
// second table whose header shares a line with the left table's data, then a
// table interleaved with left-column prose (blank rows in its region).
const gearPage = [
  at([
    [20, "CONTAINERS"],
    [80, "LAMPS"],
  ]),
  at([
    [0, "Item"],
    [22, "Capacity"],
    [36, "Cost (gp)"],
    [50, "Weight"],
    [64, "Item"],
    [92, "Cost (gp)"],
    [106, "Weight"],
  ]),
  at([
    [0, "Knapsack"],
    [23, "300 coins"],
    [41, "3"],
    [54, "40"],
    [64, "Glowjar"],
    [99, "4"],
    [110, "15"],
  ]),
  at([
    [0, "Strongbox (oak, big) 900 coins"],
    [41, "8"],
    [53, "250"],
    [64, "Wick bundle (6)"],
    [99, "1"],
    [107, "12 (2 each)"],
  ]),
  at([
    [0, "Hip purse"],
    [23, "40 coins"],
    [41, "1"],
    [54, "10"],
  ]),
  at([
    [0, "Gourd"],
    [23, "3 pints"],
    [41, "1"],
    [52, "40 (full)"],
    [80, "TOOLS"],
  ]),
  at([
    [0, "Hand cart"],
    [23, "2,000 coins"],
    [40, "25"],
    [53, "300"],
    [64, "Item"],
    [92, "Cost (gp)"],
    [106, "Weight"],
  ]),
  at([
    [64, "Pry rod"],
    [99, "6"],
    [110, "45"],
  ]),
  at([
    [0, "Footnote: made-up gear is made up."],
    [64, "Tally sticks (bag of 30)"],
    [99, "1"],
    [107, "30 (1 each)"],
  ]),
  at([
    [64, "Scribe's feather"],
    [99, "1"],
    [111, "–"],
  ]),
  "",
  at([[80, "CLOTHING"]]),
  at([
    [0, "Prose on the left runs past the table."],
    [64, "Item"],
    [92, "Cost (gp)"],
    [106, "Weight"],
  ]),
  at([
    [64, "Garb, plain"],
    [99, "1"],
    [110, "25"],
  ]),
  at([[0, "More prose, on a line of its own."]]),
  at([
    [64, "Garb, grand"],
    [98, "60"],
    [110, "45"],
  ]),
  "",
  "",
].join("\n");

const armsPage = [
  at([
    [25, "PLATING"],
    [80, "AMMUNITION"],
  ]),
  at([
    [0, "Armour"],
    [15, "Cost (gp)"],
    [30, "AC"],
    [38, "Weight"],
    [48, "Bulk"],
    [60, "Ammunition"],
    [92, "Cost (gp)"],
    [104, "Weight"],
  ]),
  at([
    [0, "Hide"],
    [18, "15"],
    [30, "11"],
    [40, "150"],
    [48, "Light"],
    [60, "Darts (sheaf of 12)"],
    [96, "4"],
    [108, "12"],
  ]),
  at([
    [0, "Scalework"],
    [18, "45"],
    [30, "14"],
    [40, "450"],
    [48, "Medium"],
    [60, "Pebbles"],
    [94, "Free"],
    [104, "1 each"],
  ]),
  at([
    [0, "Bulwark"],
    [18, "12"],
    [30, "+1"],
    [40, "120"],
    [48, "None"],
  ]),
  "",
  at([[50, "ARMS"]]),
  "Weapon                Cost (gp) Damage Weight                   Size   Qualities",
  at([
    [0, "Cleaver"],
    [28, "6"],
    [40, "1d6"],
    [54, "40"],
    [62, "Medium"],
    [71, "Melee"],
  ]),
  at([
    [0, "Greatmaul"],
    [27, "18"],
    [39, "1d10"],
    [53, "150"],
    [62, "Large"],
    [71, "Melee, Two-handed"],
  ]),
  at([
    [0, "Hornbow"],
    [27, "35"],
    [40, "1d6"],
    [54, "30"],
    [62, "Large"],
    [71, "Missile (60′ / 120′ / 180′), Two-handed"],
  ]),
  "",
].join("\n");

const encPage = [
  at([
    [0, "Basic Weight Encumbrance (Optional Rule)"],
    [70, "BASIC ENCUMBRANCE"],
  ]),
  at([
    [0, "Some prose about loads."],
    [70, "None                       40                30"],
  ]),
  at([[70, "Light                      30                20"]]),
  at([
    [0, "more prose"],
    [70, "Medium or Heavy            20                10"],
  ]),
  "",
  at([[70, "TREASURE WEIGHT"]]),
  at([
    [10, "WEIGHT ENCUMBRANCE"],
    [70, "Item"],
    [108, "Weight"],
  ]),
  "Total Weight                              Speed",
  at([
    [70, "Trinket box"],
    [111, "7"],
  ]),
  "Up to 300 coins                             40",
  at([
    [70, "Bauble"],
    [111, "1"],
  ]),
  "Up to 500 coins                             30",
  "Up to 900 coins                             20",
  "Up to 1,200 coins                           10",
  "",
  "Stowed Items: 8 Slots / Container",
  "Bags and satchels each have 8 slots for stowed items, that is items packed",
  "Encumbrance: Small trinkets weigh 5 coins.",
  "",
  at([
    [0, "Determining Speed"],
    [75, "ITEM GEAR SLOTS"],
  ]),
  at([
    [0, "left column text"],
    [76, "Adventuring Gear                                   Slots"],
  ]),
  at([[76, "General item                                         1"]]),
  at([
    [0, "more left text"],
    [76, "Tiny item: e.g. thimble, twig / leaf, signet       0"],
  ]),
  at([[76, "ring, feather"]]),
  at([[76, "Container: e.g. bag, satchel                0 when in use"]]),
  at([[76, "Bulky item: e.g. crate, ladder (12′ long)          2"]]),
  at([[76, "Coins or gems (up to 50)                             1"]]),
  at([[76, "Weapons                                            Slots"]]),
  at([[76, "Melee weapon, two-handed                             2"]]),
  at([[76, "Armour                                             Slots"]]),
  at([[76, "Shield                                               1"]]),
  "",
  at([[15, "SLOT ENCUMBRANCE"]]),
  at([
    [10, "Equipped         Stowed                         Speed"],
    [76, "Melee weapon, one-handed   1"],
  ]),
  at([
    [8, "0–2                    0–6                     40"],
    [76, "Missile weapon   1"],
  ]),
  at([[8, "3–5                    7–9                     30"]]),
  at([[8, "6–8                    10–12                   10"]]),
  "",
].join("\n");

test("reads side-by-side equipment tables, including a header beside data rows", () => {
  const items = parseCatalog([gearPage]);
  const by = (n: string) => items.find((i) => i.name === n);
  expect(by("Knapsack")).toMatchObject({ kind: "container", weight: 40, cost: "3" });
  // A name that runs into the capacity column is cut at the column.
  expect(by("Strongbox (oak, big)")?.weight).toBe(250);
  expect(by("Gourd")?.weight).toBe(40);
  expect(by("Hand cart")?.weight).toBe(300);
  expect(by("Glowjar")).toMatchObject({ kind: "gear", weight: 15, section: "LAMPS" });
  expect(by("Wick bundle (6)")).toMatchObject({ weight: 12, each: 2 });
  // The right block's second table, whose header sat on a left data row.
  expect(by("Pry rod")).toMatchObject({ weight: 45, section: "TOOLS" });
  expect(by("Tally sticks (bag of 30)")).toMatchObject({ weight: 30, each: 1 });
  expect(by("Scribe's feather")?.weight).toBe(0);
  // The footnote isn't an item.
  expect(items.some((i) => i.name.startsWith("Footnote"))).toBe(false);
});

test("reads a table interleaved with prose (blank rows in its region)", () => {
  const items = parseCatalog([gearPage]);
  expect(items.find((i) => i.name === "Garb, plain")).toMatchObject({
    kind: "clothing",
    weight: 25,
  });
  expect(items.find((i) => i.name === "Garb, grand")?.weight).toBe(45);
});

test("reads armour, ammunition, and weapon columns by header", () => {
  const items = parseCatalog([armsPage]);
  const by = (n: string) => items.find((i) => i.name === n);
  expect(by("Hide")).toMatchObject({ kind: "armour", ac: "11", bulk: "Light", weight: 150 });
  expect(by("Bulwark")).toMatchObject({ kind: "armour", ac: "+1", bulk: "None", weight: 120 });
  expect(by("Darts (sheaf of 12)")).toMatchObject({ kind: "ammo", weight: 12 });
  expect(by("Pebbles")).toMatchObject({ kind: "ammo", weight: 1, each: 1 });
  expect(by("Greatmaul")).toMatchObject({
    kind: "weapon",
    damage: "1d10",
    weight: 150,
    size: "Large",
    qualities: "Melee, Two-handed",
  });
  expect(by("Hornbow")?.qualities).toContain("Two-handed");
});

test("first listing of a name wins", () => {
  const dup = [gearPage, gearPage.replace("Knapsack", "Knapsack").replace("40", "99")];
  expect(parseCatalog(dup).filter((i) => i.name === "Knapsack")).toHaveLength(1);
});

test("finds a table whose header starts mid-line (beside a heading)", () => {
  const items = parseCatalog([encPage]);
  expect(items.find((i) => i.name === "Trinket box")).toMatchObject({
    kind: "treasure",
    weight: 7,
  });
  expect(items.find((i) => i.name === "Bauble")?.weight).toBe(1);
});

test("parses the weight, slot, and basic encumbrance tables and slot rules", () => {
  const enc = parseEncumbrance([encPage]);
  expect(enc.weight).toEqual([
    { max: 300, speed: 40 },
    { max: 500, speed: 30 },
    { max: 900, speed: 20 },
    { max: 1200, speed: 10 },
  ]);
  expect(enc.slots).toEqual([
    { equipped: 2, stowed: 6, speed: 40 },
    { equipped: 5, stowed: 9, speed: 30 },
    { equipped: 8, stowed: 12, speed: 10 },
  ]);
  expect(enc.basic).toEqual({ none: [40, 30], light: [30, 20], medium: [20, 10], heavy: [20, 10] });
  expect(enc.slotsPerContainer).toBe(8);
  expect(enc.stowContainers).toEqual(["bag", "satchel"]);
  expect(enc.trinketWeight).toBe(5);
  expect(enc.coinsPerSlot).toBe(50);
  expect(enc.zeroSlot).toEqual([
    "thimble",
    "twig",
    "leaf",
    "signet ring",
    "feather",
    "bag",
    "satchel",
  ]);
  expect(enc.bulky).toEqual(["crate", "ladder"]);
});
