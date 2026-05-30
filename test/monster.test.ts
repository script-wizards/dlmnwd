import { expect, test } from "bun:test";
import { parseMonsters } from "../src/parse/monster.ts";

// Invented, non-canon stat block in the Monster Book layout.
const page = [
  "                    Test Beast",
  " A made-up creature for testing.",
  "",
  "Large Monstrosity—Animal Intelligence—Neutral",
  "Level 4 AC 15 HP 4d8 (21) Saves D7 R6 H8 B5 S9",
  "Attacks 2 claws (+3, 1d10)",
  "Speed 30 Swim 40 Morale 8 XP 137",
  "",
  "Encounters 1d3 (40% in lair)",
  "Behaviour Dull-witted",
  "Possessions None",
  "Hoard C3 + R3",
  "",
  "Amphibious: Can breathe air and water.",
  "Eye glow: Bedazzles those who see it.",
  "",
  "TRAITS",
  "1   Glowing eyes.",
].join("\n");

test("parses a mid-line Hoard and strips a bled type line from a special", () => {
  const oozePage = [
    "                    Test Ooze",
    "An invented gelatinous test creature.",
    "",
    "Large Monstrosity—Animal Intelligence—Neutral",
    "Level 5 AC 13 HP 5d8 (26) Saves D6 R4 H7 B9 S8",
    "Attacks Slam (+4, 2d6)",
    "Speed 20 Morale 8 XP 168",
    "",
    "Possessions None Hoard C1 + R2 + M3",
    "",
    "Cling: Slides up sheer walls and across ceilings.   Small Bug—Animal Intelligence—Neutral",
  ].join("\n");
  const m = parseMonsters([oozePage])[0];
  // Hoard sits mid-line after Possessions, not at the start of the line.
  expect(m.treasure).toBe("C1 + R2 + M3");
  // The neighbouring entry's type line bled across the gutter and is removed.
  expect(m.special).toEqual(["Cling: Slides up sheer walls and across ceilings."]);
});

test("parses a monster stat block", () => {
  const monsters = parseMonsters([page]);
  expect(monsters.length).toBe(1);
  const m = monsters[0];

  expect(m.id).toBe("test-beast");
  expect(m.name).toBe("Test Beast");
  expect(m.description).toBe("A made-up creature for testing.");
  expect(m.level).toBe(4);
  expect(m.category).toBe("Large Monstrosity");
  expect(m.intelligence).toBe("Animal Intelligence");
  expect(m.alignment).toBe("Neutral");
  expect(m.ac).toBe(15);
  expect(m.hd).toBe("4d8 (21)");
  expect(m.saves).toBe("D7 R6 H8 B5 S9");
  expect(m.attacks).toBe("2 claws (+3, 1d10)");
  expect(m.movement).toBe("30 Swim 40");
  expect(m.morale).toBe(8);
  expect(m.xp).toBe(137);
  expect(m.numberAppearing).toBe("1d3 (40% in lair)");
  expect(m.treasure).toBe("C3 + R3");
  // Special abilities stop before the TRAITS sidebar.
  expect(m.special).toEqual([
    "Amphibious: Can breathe air and water.",
    "Eye glow: Bedazzles those who see it.",
  ]);
});

// A page with a main entry (carrying a multi-line flavour subtitle) followed by
// a secondary stat block whose name sits directly above its type line. The
// subtitle belongs to the main entry; the sub-block legitimately has none.
const subtitlePage = [
  "                    Test Drake",
  "A made-up winged serpent that coils through the test caverns",
  "and broods over hoards of invented gold.",
  "",
  "Large Monstrosity—Semi-Intelligent—Chaotic",
  "Level 6 AC 17 HP 6d8 (31) Saves D6 R4 H7 B9 S8",
  "Attacks Bite (+5, 2d6)",
  "Speed 40 Fly 90 Morale 9 XP 545",
  "",
  "Elder Drake",
  "Large Monstrosity—Semi-Intelligent—Chaotic",
  "Level 8 AC 18 HP 8d8 (41) Saves D4 R8 H6 B3 S7",
  "Attacks Bite (+7, 2d8)",
  "Speed 40 Fly 90 Morale 10 XP 1575",
].join("\n");

test("captures the flavour subtitle, joining multiple lines; none for a sub-block", () => {
  const monsters = parseMonsters([subtitlePage]);
  expect(monsters.map((m) => m.id)).toEqual(["test-drake", "elder-drake"]);

  expect(monsters[0].description).toBe(
    "A made-up winged serpent that coils through the test caverns and broods over hoards of invented gold.",
  );
  expect(monsters[0].parent).toBeUndefined();
  // The sub-block sits below a described entry on the same page, so it has no
  // subtitle of its own and is demoted to that entry's child.
  expect(monsters[1].description).toBeUndefined();
  expect(monsters[1].parent).toBe("Test Drake");
});

// Compact animal-appendix layout: the special precedes the Hoard detail, two
// creatures share a column, and the next name carries a comma.
const appendixPage = [
  "TESTANT, GIANT",
  "Giant invented ants for testing.",
  "Medium Bug—Animal Intelligence—Neutral",
  "Level 4 AC 16 HP 4d8 (21) Saves D7 R6 H8 B5 S9",
  "Att Bite (+3, 2d6) Speed 55 Morale 7 (11 in melee)",
  "XP 85 Enc 3d4 Hoard Gold or crystals (see below)",
  "Morale: Frenzied attackers. Will not be cowed.",
  "Hoard: 30% chance of gold nuggets",
  "or grit, dug from the warren.",
  "",
  "TESTBAT, GIANT",
  "Black-furred invented bats.",
  "Small Animal—Animal Intelligence—Neutral",
  "Level 2 AC 13 HP 2d8 (11) Saves D3 R2 H4 B6 S5",
  "Att Bite (+1, 1d4) Speed 15 Fly 55 Morale 8 XP 25 Enc 1d10",
].join("\n");

test("appendix entry: special before Hoard, no bleed into the next creature", () => {
  const monsters = parseMonsters([appendixPage]);
  expect(monsters.map((m) => m.id)).toEqual(["testant-giant", "testbat-giant"]);

  const ant = monsters[0];
  expect(ant.name).toBe("Testant, Giant");
  expect(ant.attacks).toBe("Bite (+3, 2d6)");
  expect(ant.numberAppearing).toBe("3d4");
  // Only the real ability — not the Hoard continuation, not the next entry.
  expect(ant.special).toEqual(["Morale: Frenzied attackers. Will not be cowed."]);
});

// Side-by-side two-column appendix: two creatures share every physical line,
// separated by the central gutter. parseMonsters column-splits at that single
// gutter (splitTwoColumns) so each creature's lines stay contiguous and both
// are recovered whole.
const C = (left: string, right: string) => (left.padEnd(60) + right).replace(/\s+$/, "");
const twoColumnPage = [
  C("TESTDOG", "TESTWOLF"),
  C(
    "Invented pack hounds that roam the moor in test.",
    "Invented wild wolves that haunt the test woods.",
  ),
  C("Small Animal—Animal Intelligence—Neutral", "Medium Beast—Animal Intelligence—Neutral"),
  C(
    "Level 1 AC 12 HP 1d8 (6) Saves D3 R2 H4 B6 S5",
    "Level 2 AC 12 HP 2d8 (11) Saves D3 R2 H4 B6 S5",
  ),
  C(
    "Att Bite (+0, 1d4) Speed 50 Morale 7 XP 15 Enc 2d6",
    "Att Bite (+1, 1d6) Speed 65 Morale 4 XP 25 Enc 3d6",
  ),
  C(
    "Pack: Fight better when fighting in numbers.",
    "Pack: Morale rises to 8 when in larger packs.",
  ),
].join("\n");

test("appendix: both creatures in a side-by-side two-column row are recovered", () => {
  const monsters = parseMonsters([twoColumnPage]);
  expect(monsters.map((m) => m.id)).toEqual(["testdog", "testwolf"]);

  const [dog, wolf] = monsters;
  expect(dog.level).toBe(1);
  expect(dog.attacks).toBe("Bite (+0, 1d4)");
  expect(dog.numberAppearing).toBe("2d6");
  expect(dog.special).toEqual(["Pack: Fight better when fighting in numbers."]);

  expect(wolf.level).toBe(2);
  expect(wolf.attacks).toBe("Bite (+1, 1d6)");
  expect(wolf.numberAppearing).toBe("3d6");
  expect(wolf.special).toEqual(["Pack: Morale rises to 8 when in larger packs."]);
});

test("recovers an entry whose stat line was bled into by the left column", () => {
  const bleedPage = [
    "TESTGRIFF",
    "Invented winged cat for testing.",
    "Large Animal—Semi-Intelligent—Neutral",
    "e   Level 7 AC 14 HP 7d8 (35) Saves D4 R8 H6 B3 S7",
    "Att 2 claws (+6, 1d4) and bite (+6, 2d10) Speed 45 Fly 110",
    "Morale 8 XP 455 Enc 2d8 Hoard C5 + R2 + M8",
    "Taming: If caught very young.",
  ].join("\n");
  const monsters = parseMonsters([bleedPage]);
  expect(monsters.length).toBe(1);
  expect(monsters[0].id).toBe("testgriff");
  expect(monsters[0].level).toBe(7);
  expect(monsters[0].special).toEqual(["Taming: If caught very young."]);
});

// Main-bestiary layout where the abilities share lines with a right-hand
// TRAITS table and are followed by an ENCOUNTERS sidebar; pdftotext interleaves
// the columns. Left text is padded to column 66 where the sidebar begins.
const L = (left: string, right: string) => (right ? left.padEnd(66) + right : left);
const sidebarPage = (() => {
  return [
    "                         Test Wraith",
    "An invented undead for testing.",
    "",
    "Medium Undead—Semi-Intelligent—Chaotic",
    "Level 4 AC 19 HP 4d8 (21) Saves D7 R6 H8 B5 S9",
    "Attacks Clawed grasp (+3, 1d12 + life drain)",
    "Speed 40 Morale 9 XP 185",
    "",
    "Hoard C5 + R2",
    L("Life drain: The touch drains 1d3 Constitution.", "TRAITS"),
    L("Dormant by day: Manifests as cold mist around the", "1   Wields a scythe."),
    L("stones it guards, coalescing fully if disturbed.", "2   Skull in blue flame."),
    L("", "3   Gore drips from the neck."),
    "",
    "                    ENCOUNTERS",
    L(" 1 Dragging a victim through the undergrowth.", "1   A black obelisk."),
  ].join("\n");
})();

test("clips the right-hand sidebar table out of the special abilities", () => {
  const monsters = parseMonsters([sidebarPage]);
  expect(monsters.length).toBe(1);
  expect(monsters[0].name).toBe("Test Wraith");
  // No TRAITS rows, no ENCOUNTERS content — and the multi-line ability joins.
  expect(monsters[0].special).toEqual([
    "Life drain: The touch drains 1d3 Constitution.",
    "Dormant by day: Manifests as cold mist around the stones it guards, coalescing fully if disturbed.",
  ]);
});

test("labels, comma-lists, prose colons, Names, and page folios", () => {
  const edgePage = [
    "                    Edge Beast",
    "An invented creature.",
    "",
    "Large Undead—Semi-Intelligent—Neutral",
    "Level 3 AC 13 HP 3d8 (16) Saves D5 R7 H3 B8 S4",
    "Attacks Bite (+2, 1d6)",
    "Speed 30 Morale 8 XP 85",
    "",
    "Disease: 1-in-20 bites infect. Save Versus",
    "Doom or feel unwell for 1d10 days: Speed halved.",
    "Cursed, ghostly, keen-eyed: Per edge beast—see above.",
    "Names: See another entry.",
    "16",
  ].join("\n");
  const m = parseMonsters([edgePage])[0];
  expect(m.special).toEqual([
    // The long colon line is prose, not a new label, so the first ability stays
    // whole; the comma-list keyword is one label; the Names pointer and the
    // folio number are dropped.
    "Disease: 1-in-20 bites infect. Save Versus Doom or feel unwell for 1d10 days: Speed halved.",
    "Cursed, ghostly, keen-eyed: Per edge beast—see above.",
  ]);
});

test("names a block from a Title-Case heading, not the page subtitle", () => {
  const npcPage = [
    "                 Common Townsfolk",
    "                       An invented wrapping subtitle for the test",
    "",
    " Common Townsperson",
    " Small/Medium Mortal—Sentient—Any Alignment",
    " Level 1 AC 10 HP 1d4 (3) Saves D3 R2 H4 B6 S5",
    " Att Weapon (–1) Speed 40 Morale 6 XP 15",
    " Weapons: Cudgel (d4), sling (d4), or hatchet (d6).",
  ].join("\n");
  const monsters = parseMonsters([npcPage]);
  expect(monsters.length).toBe(1);
  expect(monsters[0].name).toBe("Common Townsperson");
  expect(monsters[0].id).toBe("common-townsperson");
});
