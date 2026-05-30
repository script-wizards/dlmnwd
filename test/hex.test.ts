import { expect, test } from "bun:test";
import { parseHexes, withBookmarks } from "../src/parse/hex.ts";

// Invented, non-canon hex entry in the Campaign Book layout.
const page = [
  "0101                                      THE SAMPLE MANSE",
  "           A bleak sweep of murky shallows. A far-off droning.",
  "",
  " Terrain: Bog (3), Sample Reach",
  " Lost/encounters: 2-in-6. Likely a wandering wisp.",
  " Foraging: 1d2 portions of sample balm.",
  "",
  "The Sample Manse",
  "A thicket of blackthorns stands amid the rivulets.",
].join("\n");

test("parses a hex entry summary", () => {
  const hexes = parseHexes([page]);
  expect(hexes.length).toBe(1);
  const h = hexes[0];

  expect(h.id).toBe("0101");
  expect(h.name).toBe("The Sample Manse");
  expect(h.entry).toBe("A bleak sweep of murky shallows. A far-off droning.");
  expect(h.terrain).toBe("Bog (3), Sample Reach");
  expect(h.lostEncounters).toBe("2-in-6. Likely a wandering wisp.");
  expect(h.foraging).toBe("1d2 portions of sample balm.");
});

test("parses a key-left header with only a single space (long name)", () => {
  const longName = [
    "0404 TESTERS' ENCAMPMENT AND SAMPLE ISLE",
    "           Flat grey shallows, reed-choked, loud with unseen frogs.",
    "",
    " Terrain: Swamp (4), Sample Mire",
  ].join("\n");
  const [h] = parseHexes([longName]);
  expect(h.id).toBe("0404");
  expect(h.name).toBe("Testers' Encampment and Sample Isle");
  expect(h.terrain).toBe("Swamp (4), Sample Mire");
});

test("ignores a bare number with no Terrain field", () => {
  const notHex = [
    "0102                                      SOMETHING",
    "  just prose, no fields",
  ].join("\n");
  expect(parseHexes([notHex]).length).toBe(0);
});

test("withBookmarks: bookmark names canonical, every hex resolves", () => {
  const bookmarks = [
    { id: "0101", name: "The Sample Lodge" },
    { id: "1508", name: "Sample Keep and Sample Hill" },
  ];
  const parsed = [{ id: "0101", name: "Sample Lodge", terrain: "Bog (3)", entry: "blurb" }];
  const merged = withBookmarks(bookmarks, parsed);

  expect(merged.map((h) => h.id)).toEqual(["0101", "1508"]);
  expect(merged[0].name).toBe("The Sample Lodge"); // bookmark name wins
  expect(merged[0].terrain).toBe("Bog (3)"); // parsed detail overlaid
  expect(merged[1].name).toBe("Sample Keep and Sample Hill"); // resolves with no parse
  expect(merged[1].terrain).toBeUndefined();
});

test("withBookmarks falls back to parsed when no bookmarks", () => {
  const parsed = [{ id: "0101", name: "X", entry: "y" }];
  expect(withBookmarks([], parsed)).toEqual(parsed);
});
