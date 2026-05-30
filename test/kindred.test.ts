import { expect, test } from "bun:test";
import { discoverKindreds, parseKindreds } from "../src/parse/kindred.ts";

// Place text at fixed column offsets to mimic pdftotext -layout output.
function at(cols: [number, string][]): string {
  let line = "";
  for (const [x, text] of cols) {
    if (line.length < x) line += " ".repeat(x - line.length);
    line += text;
  }
  return line;
}

// Invented, non-canon fixture exercising the names table (with one row that
// extraction "scattered" onto later lines) plus the persona grid.
const namesPage = [
  "Native Languages      Sample-Tongue, Bramblespeak",
  "",
  at([[40, "TESTKIN NAMES"]]),
  at([
    [20, "d20 First Name"],
    [44, "Surname"],
  ]),
  at([
    [20, "1"],
    [25, "Boots"],
    [44, "Bobblewhisk"],
  ]),
  at([
    [20, "2"],
    [25, "Fripple"],
    [44, "Cottonsocks"],
  ]),
  at([[20, "3"]]), // roll number; its values were pushed onto the next lines
  at([[25, "Felix"]]),
  at([[44, "Fang"]]),
].join("\n");

const personaPage = [
  at([
    [0, "d12 Demeanour"],
    [30, "d12 Desires"],
  ]),
  at([
    [0, "1  Sly"],
    [30, "1  Rule a secret court"],
  ]),
  at([
    [0, "2  Bold"],
    [30, "2  Build a palace"],
  ]),
  "",
].join("\n");

// Invented sections shaped like the book: each kindred opens with a "Kindred
// Type" line and carries an "X NAMES" header; mechanics sit in the prose. The
// field labels ("Kindred Type", "Magic Resistance") are the anchors the parser
// keys on, so they are structural; every kindred, number, and sentence here is
// made up.
const bristleSection = [
  "Kindred Type     Mortal",
  "BRISTLEKIN NAMES",
  "Plated hide, ridged like bark, is worth +1 AC to a bristlekin.",
].join("\n");
const wispSection = [
  "Kindred Type     Fairy",
  "WISPKIN NAMES",
  "Being half candle-smoke, they gain +2 Magic Resistance (see Magic Resistance, p99).",
].join("\n");
const plainSection = ["Kindred Type     Mortal", "PLAINFOLK NAMES", "Just ordinary folk."].join(
  "\n",
);
// An appendix that repeats an earlier kindred's trait. The last section must not
// reach this far, or Plainfolk would inherit Bristlekin's hide bonus.
const appendix = ["APPENDIX", "Recall: bristlekin hide is worth +1 AC."].join("\n");

test("discovers kindred names, title-cased, from NAMES headers", () => {
  const rules = discoverKindreds([bristleSection, wispSection, plainSection]);
  expect(rules.map((r) => r.name)).toEqual(["Bristlekin", "Wispkin", "Plainfolk"]);
  expect(rules.map((r) => r.id)).toEqual(["bristlekin", "wispkin", "plainfolk"]);
});

test("discovers magic resistance and natural-armour bonuses from prose", () => {
  const [bristle, wisp] = discoverKindreds([bristleSection, wispSection, plainSection]);
  expect(bristle.furArmourBonus).toBe(1);
  expect(bristle.magicResistance).toBeUndefined();
  expect(wisp.magicResistance).toBe(2);
  expect(wisp.furArmourBonus).toBeUndefined();
});

test("bounds the last section so it does not inherit appendix traits", () => {
  const rules = discoverKindreds([bristleSection, wispSection, plainSection, appendix]);
  const plain = rules.find((r) => r.id === "plainfolk");
  expect(plain?.furArmourBonus).toBeUndefined();
});

test("parseKindreds falls back to discovery when given no rules", () => {
  const kindreds = parseKindreds([bristleSection, wispSection, plainSection], []);
  expect(kindreds.map((k) => k.name)).toEqual(["Bristlekin", "Wispkin", "Plainfolk"]);
});

// A facing-prose line that bleeds a couple of characters past the table's left
// edge (as layout-emulated text can) must not abort the names table.
const bleedPage = [
  at([[40, "BLEEDKIN NAMES"]]),
  at([
    [20, "d20 First Name"],
    [44, "Surname"],
  ]),
  at([
    [20, "1"],
    [25, "Boots"],
    [44, "Bobblewhisk"],
  ]),
  at([
    [0, "Prose bleeds to col"], // 19 chars: reaches one past the table's start cut
    [20, "2"],
    [25, "Cane"],
    [44, "Cobble"],
  ]),
  at([
    [20, "3"],
    [25, "Felix"],
    [44, "Fang"],
  ]),
].join("\n");

test("recovers a names row whose facing prose bleeds past the table edge", () => {
  const [k] = parseKindreds(
    [bleedPage],
    [{ id: "bleedkin", name: "Bleedkin", kindredType: "Mortal" }],
  );
  expect(k.nameRows).toContainEqual(["Boots", "Bobblewhisk"]);
  expect(k.nameRows).toContainEqual(["Cane", "Cobble"]); // would be lost without the strip
  expect(k.nameRows).toContainEqual(["Felix", "Fang"]);
  expect(k.nameRows.length).toBe(3);
});

// A kindred section: a "Kindred Type" line opens it, abilities are all-caps
// run-in headers in the prose, and a d12 appearance table must not be mistaken
// for a trait.
const traitSection = [
  "Kindred Type     Mortal",
  at([
    [0, "Sample-folk are short and"],
    [50, "STONE SENSE"],
  ]),
  at([
    [0, "stout, fond of digging."],
    [50, "A sample-folk always knows"],
  ]),
  at([[50, "which way is down."]]),
  at([[50, "TUNNEL VISION"]]),
  at([[50, "They see in total darkness."]]),
  "SAMPLEFOLK NAMES",
  at([
    [0, "d20 Name"],
    [20, "Clan"],
  ]),
  at([
    [0, "1  Bod"],
    [20, "Hill"],
  ]),
  at([[50, "WHISKERS"]]),
  at([[50, "d12 Whisker Style"]]),
  at([[50, "1   Bushy"]]),
].join("\n");

test("parses kindred trait names and descriptions, ignoring roll tables", () => {
  const [k] = parseKindreds(
    [traitSection],
    [{ id: "samplefolk", name: "Samplefolk", kindredType: "Mortal" }],
  );
  expect(k.traits.map((t) => t.name)).toEqual(["Stone Sense", "Tunnel Vision"]);
  expect(k.traits[0].text).toBe("A sample-folk always knows which way is down.");
  // "WHISKERS" heads a d12 appearance table, not a trait, so it is dropped.
  expect(k.traits.map((t) => t.name)).not.toContain("Whiskers");
});

test("parses languages, names, scattered rows, and persona", () => {
  const kindreds = parseKindreds(
    [namesPage, personaPage],
    [{ id: "testkin", name: "Testkin", kindredType: "Mortal" }],
  );
  expect(kindreds.length).toBe(1);
  const k = kindreds[0];

  expect(k.id).toBe("testkin");
  expect(k.nativeLanguages).toEqual(["Sample-Tongue", "Bramblespeak"]);
  expect(k.nameColumns).toEqual(["First Name", "Surname"]);
  expect(k.nameRows).toContainEqual(["Boots", "Bobblewhisk"]);
  expect(k.nameRows).toContainEqual(["Felix", "Fang"]); // reassembled from scattered lines
  expect(k.nameRows.length).toBe(3);
  expect(k.persona.demeanour).toEqual(["Sly", "Bold"]);
  expect(k.persona.desires).toContain("Rule a secret court");
});

// A kindred section: "Kindred Type" line + names table. The trinket table is on
// its own page (as in the real Player's Book), headed "{KINDRED} TRINKETS".
const trinketSection = [
  "Kindred Type     Mortal",
  "TESTKIN NAMES",
  at([
    [0, "d20 First Name"],
    [20, "Surname"],
  ]),
  at([
    [0, "1  Alder"],
    [20, "Leaf"],
  ]),
].join("\n");

const trinketPage = [
  at([[47, "TESTKIN TRINKETS"]]),
  at([
    [1, "d100 Trinket"],
    [69, "d100 Trinket"],
  ]),
  at([
    [0, "01–02 A bent spoon that sings at dawn"],
    [69, "51–52 A key to an unknown door"],
  ]),
  at([
    [0, "03–04 A shiny pebble that glows in moon"],
    [69, "53–54 A dried flower pressed in a book"],
  ]),
  at([[7, "light."]]),
  at([
    [0, "05–06 A feather from a dream bird"],
    [69, "55–56 A coin that always lands on edge"],
  ]),
].join("\n");

test("parses the kindred trinket table", () => {
  const [k] = parseKindreds(
    [trinketSection, trinketPage],
    [{ id: "testkin", name: "Testkin", kindredType: "Mortal" }],
  );
  expect(k.trinkets.length).toBeGreaterThanOrEqual(4);
  expect(k.trinkets).toContain("A bent spoon that sings at dawn");
  expect(k.trinkets).toContain("A key to an unknown door");
  // The "light." continuation is stitched onto the pebble entry.
  expect(k.trinkets.some((t) => t.includes("shiny pebble"))).toBe(true);
  expect(k.trinkets.some((t) => t.includes("light."))).toBe(true);
});

test("trinkets is empty when no trinket table is present", () => {
  const [k] = parseKindreds(
    [namesPage, personaPage],
    [{ id: "testkin", name: "Testkin", kindredType: "Mortal" }],
  );
  expect(k.trinkets).toEqual([]);
});

const backgroundPage = [
  at([[47, "TESTKIN BACKGROUNDS"]]),
  at([
    [1, "d20 Background"],
    [51, "d20 Background"],
  ]),
  at([
    [0, "1  Farmer"],
    [51, "11  Merchant"],
  ]),
  at([
    [0, "2  Baker"],
    [51, "12  Smuggler"],
  ]),
  at([
    [0, "3  Guard"],
    [51, "13  Thatcher"],
  ]),
  at([
    [0, "4  Cook"],
    [51, "14  Vagrant"],
  ]),
  at([
    [0, "5  Hunter"],
    [51, "15  Scribe"],
  ]),
  "",
].join("\n");

test("parses the kindred background table", () => {
  const [k] = parseKindreds(
    [trinketSection, trinketPage, backgroundPage],
    [{ id: "testkin", name: "Testkin" }],
  );
  expect(k.backgrounds.length).toBeGreaterThanOrEqual(10);
  expect(k.backgrounds).toContain("Farmer");
  expect(k.backgrounds).toContain("Vagrant");
});

test("backgrounds is empty when no background table is present", () => {
  const [k] = parseKindreds([namesPage, personaPage], [{ id: "testkin", name: "Testkin" }]);
  expect(k.backgrounds).toEqual([]);
});
