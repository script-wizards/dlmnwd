import { expect, test } from "bun:test";
import { parseSymbioticFlesh } from "../src/parse/symbiotic-flesh.ts";

// Invented, non-canon infestations in the Player's Book "d20 Infestation" layout.
const rows = Array.from({ length: 20 }, (_, i) => `${i + 1}   Invented infestation ${i + 1}.`);
const page = ["SYMBIOTIC FLESH", "d20   Infestation", ...rows, "49"].join("\n");

test("parses all 20 infestations indexed by roll", () => {
  const table = parseSymbioticFlesh([page]);
  expect(table).toHaveLength(20);
  expect(table[0]).toBe("Invented infestation 1.");
  expect(table[19]).toBe("Invented infestation 20.");
});

test("returns [] when the table is incomplete (pdftotext scrambles this graphic)", () => {
  const partial = ["d20   Infestation", "1   Only one row."].join("\n");
  expect(parseSymbioticFlesh([partial])).toEqual([]);
  expect(parseSymbioticFlesh(["no table here"])).toEqual([]);
});
