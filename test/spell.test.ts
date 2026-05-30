import { expect, test } from "bun:test";
import { parseSpells } from "../src/parse/spell.ts";

// Invented, non-canon spell entries in the Player's Book layout. Single-column
// pages, so the column reflow leaves them as-is.

test("title-cases names: lowercases minor words, keeps possessives and hyphens", () => {
  const page = [
    "Rank 1 Arcane Spells",
    "GUST OF THE TEST",
    "Duration: 1 Turn",
    "Range: 30′",
    "An invented gust of testing wind.",
    "",
    "TESTER’S COIN",
    "Duration: 1 Turn",
    "Range: Touch",
    "An invented glamour for testing.",
    "",
    "ANTI-TEST WARD",
    "Duration: 6 Turns",
    "Range: Self",
    "An invented ward for testing.",
  ].join("\n");
  const spells = parseSpells([page]);
  expect(spells.map((s) => s.name)).toEqual([
    "Gust of the Test",
    "Tester’s Coin",
    "Anti-Test Ward",
  ]);
  expect(spells[0].tradition).toBe("Arcane");
  expect(spells[0].rank).toBe(1);
});

test("Holy spell body stops at the saint story and drops page furniture", () => {
  const page = [
    "Rank 3 Holy Spells",
    "TEST PRAYER",
    "Prayer name: Mercy of St Nobody",
    "Duration: Instant",
    "Range: 30′",
    "A made-up blessing restores a thing.",
    "106", // page folio bled into the column
    "Part Five | Magic", // running header sliced into the column
    "Effects: Another real line of the prayer.",
    "The miracle of St Nobody, the Untested: A long flavour story",
    "about a saint that must not appear in the spell body at all.",
    "Patronages: Testers, (the untested).",
  ].join("\n");
  const [spell] = parseSpells([page]);
  expect(spell.name).toBe("Test Prayer");
  expect(spell.body).toContain("A made-up blessing restores a thing.");
  expect(spell.body).toContain("Effects: Another real line of the prayer.");
  // No folio, no running header, no flavour story.
  expect(spell.body).not.toContain("106");
  expect(spell.body).not.toContain("Magic");
  expect(spell.body).not.toContain("miracle");
  expect(spell.body).not.toContain("Patronages");
});

test("extracts the Prayer name into a field, out of the body", () => {
  const page = [
    "Rank 3 Holy Spells",
    "TEST BLESSING",
    "Prayer name: Grace of Saint Tester",
    "Duration: 1 Turn",
    "Range: 30′",
    "An invented restorative blessing tested here.",
  ].join("\n");
  const [spell] = parseSpells([page]);
  expect(spell.prayerName).toBe("Grace of Saint Tester");
  expect(spell.body).toBe("An invented restorative blessing tested here.");
});

test("reflows the body: heals a stray blank, de-hyphenates, keeps labels", () => {
  const page = [
    "Rank 1 Arcane Spells",
    "TEST FLOW",
    "Duration: 1 Turn",
    "Range: Self",
    "A gust of testing wind blows", // sentence continues below
    "", // stray blank injected by the column reflow
    "across the misty moor and", // continuation
    "fades into the gloam-", // hyphenated word-break
    "ing dusk of evening.",
    "Effect: A separate labelled line.",
  ].join("\n");
  const [spell] = parseSpells([page]);
  expect(spell.body).toBe(
    "A gust of testing wind blows across the misty moor and fades into the gloaming dusk of evening.\nEffect: A separate labelled line.",
  );
});

test("merges a spell name that wraps onto a second all-caps line", () => {
  const page = [
    "Rank 6 Arcane Spells",
    "WARD AGAINST TESTED",
    "BANE",
    "Duration: 2d6 Rounds",
    "Range: The caster",
    "Invented rune effect.",
  ].join("\n");
  const spells = parseSpells([page]);
  // One entry, not a bodiless first fragment plus a phantom from the second line.
  expect(spells.map((s) => s.name)).toEqual(["Ward Against Tested Bane"]);
  expect(spells[0].duration).toBe("2d6 Rounds");
  expect(spells[0].body).toContain("Invented rune effect.");
});
