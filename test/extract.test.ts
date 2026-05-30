import { expect, test } from "bun:test";
import { splitColumns, splitTwoColumns } from "../src/pdf/columns.ts";

// A faint vertical bleed strip (one stray glyph per row, just right of the
// central gutter) is a real Monster Book hazard: splitColumns treats the blank
// bands on either side of the strip as separate gutters and cuts the page into
// THREE, which can chop a creature's block apart. splitTwoColumns picks the one
// widest central gutter instead, so each creature stays in a single column.
const stripRow = (left: string, right: string, strip: string) =>
  ((left.padEnd(56) + strip).padEnd(60) + right).replace(/\s+$/, "");
const bleedStripPage = [
  stripRow("TESTDOG", "TESTWOLF", " "),
  stripRow(
    "Invented pack hounds that roam the open test moors.",
    "Invented wild wolves that haunt the deep test woods.",
    "i",
  ),
  stripRow(
    "Small Animal—Animal Intelligence—Neutral",
    "Medium Animal—Animal Intelligence—Neutral",
    "n",
  ),
  stripRow(
    "Level 1 AC 12 HP 1d8 (6) Saves D3 R2 H4 B6 S5",
    "Level 2 AC 12 HP 2d8 (11) Saves D3 R2 H4 B6 S5",
    "c",
  ),
  stripRow(
    "Att Bite (+0, 1d4) Speed 50 Morale 7 XP 10 Enc 2d6",
    "Att Bite (+1, 1d6) Speed 65 Morale 4 XP 20 Enc 3d6",
    "-",
  ),
  stripRow(
    "Pack: Fights better when together in numbers.",
    "Pack: Morale rises to 8 when in larger packs.",
    "d",
  ),
].join("\n");

test("splitColumns over-splits a bleed-strip page into three columns", () => {
  // Documents the hazard the dedicated two-column splitter exists to avoid.
  expect(splitColumns(bleedStripPage).length).toBeGreaterThan(2);
});

test("splitTwoColumns cuts at the single central gutter, keeping blocks whole", () => {
  const [left, right] = splitTwoColumns(bleedStripPage);
  expect(splitTwoColumns(bleedStripPage).length).toBe(2);

  // The left creature's whole block lands in the left column...
  expect(left).toContain("TESTDOG");
  expect(left).toContain("Level 1 AC 12");
  expect(left).toContain("Pack: Fights better");
  // ...and the right creature's whole block in the right column.
  expect(right).toContain("TESTWOLF");
  expect(right).toContain("Level 2 AC 12");
  expect(right).toContain("Pack: Morale rises");
});

test("splitTwoColumns returns a single-column page unchanged", () => {
  const single = [
    "A single column of prose with no central gutter to split on.",
    "Every line runs the full measure, so there is one segment only.",
    "More body text here to clear the minimum content-line threshold.",
    "Still more text, filling out the column to a realistic length.",
    "Another line of the same single-column paragraph for good measure.",
    "And a final line so the page has enough content lines to consider.",
  ].join("\n");
  expect(splitTwoColumns(single)).toEqual([single]);
});

// A wide flavour subtitle that flows continuously across the page sits above a
// block of narrow rows with a right-hand sidebar. The gutter falls in the rows'
// blank gap; the subtitle must survive whole in the left segment rather than
// being chopped where the sidebar starts below it.
const sidebarRow = (left: string, side: string) => (left.padEnd(60) + side).replace(/\s+$/, "");
const wideHeaderPage = [
  "A wide flavour subtitle that flows continuously across the entire width of the page here",
  sidebarRow("Level 1 AC 12 HP 1d8 (6) Saves D3 R2 H4 B6 S5", "1  appearance one"),
  sidebarRow("Att Bite (+0, 1d4) Speed 50 Morale 7 XP 10 Enc 2d6", "2  appearance two"),
  sidebarRow("First line of the main left-hand column body text", "3  appearance three"),
  sidebarRow("Second line of the main left-hand column body text", "4  appearance four"),
  sidebarRow("Third line of the main left-hand column body text", "5  appearance five"),
  sidebarRow("Fourth line of the main left-hand column body text", "6  appearance six"),
  sidebarRow("Fifth line of the main left-hand column body text", "7  appearance seven"),
].join("\n");

test("splitTwoColumns keeps a gutter-spanning wide line whole", () => {
  const segments = splitTwoColumns(wideHeaderPage);
  expect(segments.length).toBe(2);
  const [left] = segments;
  // The full-width subtitle survives, not clipped at the gutter.
  expect(left).toContain("flows continuously across the entire width of the page here");
  // The sidebar is still clipped off the narrow rows below it.
  expect(left).not.toContain("appearance five");
});
