import { expect, test } from "bun:test";
import { parseKnacks, parseKnacksTable } from "../src/parse/knack.ts";

// Invented, non-canon knacks in the Player's Book layout: a 2-up d6 table and
// ALL-CAPS entries with level-gated abilities, single-column so the reflow is a
// no-op.

const page = [
  "MOSSLING KNACKS",
  "d6  Knack            d6  Knack",
  "1   Testsong         4   Windwhistle",
  "2   Barkwhisper      5   Mistcaller",
  "3   Rootspeak        6   Emberknack",
  "TESTSONG",
  "An invented knack of testing songs.",
  "First gift (Level 1): The mossling hums an invented tune.",
  "Second gift (Level 3): A grander invented tune.",
  "BARKWHISPER",
  "Another invented knack, of bark.",
  "Bark sense (Level 1): The mossling reads the invented grain.",
].join("\n");

test("parses knack names from the d6 table", () => {
  expect(parseKnacksTable([page])).toEqual([
    "Testsong",
    "Barkwhisper",
    "Rootspeak",
    "Windwhistle",
    "Mistcaller",
    "Emberknack",
  ]);
});

test("parses the named knack entries, keeping level-gated abilities", () => {
  const knacks = parseKnacks([page]);
  // Only the entries with descriptions are returned, in d6 order.
  expect(knacks.map((k) => k.name)).toEqual(["Testsong", "Barkwhisper"]);
  expect(knacks[0].text).toContain("First gift (Level 1):");
  expect(knacks[0].text).toContain("Second gift (Level 3):");
});
