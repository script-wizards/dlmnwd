import { expect, test } from "bun:test";
import { parseGlamourDetails, parseGlamoursTable } from "../src/parse/glamour.ts";

// Invented, non-canon glamours in the Player's Book layout: a 3-up d20 table and
// single-column description entries (so the column reflow leaves them as-is).

const tablePage = [
  "#   Glamour         #   Glamour         #   Glamour",
  "1   Aurora          8   Mistveil        15  Umbermeld",
  "2   Bramblehush     9   Nightcloak      16  Vinesong",
  "3   Cinderwink      10  Owlsight        17  Wispward",
  "4   Dewstep         11  Pinefall        18  Yarrowcall",
].join("\n");

const detailPage = [
  "Glamours",
  "AURORA",
  "Duration: 1 Round",
  "Range: 30′",
  "An invented shimmer of testing light.",
  "",
  "MISTVEIL",
  "Duration: Concentration",
  "Range: The caster",
  "An invented veil of testing mist.",
  "",
  // A description whose name is NOT in the table (a rune, say) must be ignored.
  "ARCANE UNBINDING",
  "Duration: Instant",
  "Range: 60′",
  "An invented rune that must not be treated as a glamour.",
].join("\n");

test("parses glamour names from the d20 table, dropping empty slots", () => {
  const names = parseGlamoursTable([tablePage]);
  expect(names).toEqual([
    "Aurora",
    "Bramblehush",
    "Cinderwink",
    "Dewstep",
    "Mistveil",
    "Nightcloak",
    "Owlsight",
    "Pinefall",
    "Umbermeld",
    "Vinesong",
    "Wispward",
    "Yarrowcall",
  ]);
});

test("parses details only for names in the table, keyed lowercase", () => {
  const details = parseGlamourDetails([tablePage, detailPage]);
  expect(details.get("aurora")).toEqual({
    name: "Aurora",
    duration: "1 Round",
    range: "30′",
    body: "An invented shimmer of testing light.",
  });
  expect(details.get("mistveil")?.duration).toBe("Concentration");
  // The rune-named entry is not in the glamour table, so it is not captured.
  expect(details.has("arcane unbinding")).toBe(false);
});
