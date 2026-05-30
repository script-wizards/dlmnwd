import { expect, test } from "bun:test";
import { layoutPage } from "../src/pdf/emulate.ts";

// pdf.js hands us positioned glyph runs; layoutPage re-grids them onto the
// fixed-width canvas the parsers expect. These tests pin the two behaviours the
// parsers depend on: collapsing within-word kerning splits, and preserving the
// 2+ space gaps that separate table columns.

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
// Build an item whose advance width matches `str.length * pitch`, so the median
// per-glyph pitch across a line is exactly `pitch`.
function item(str: string, x: number, y: number, pitch = 6): Item {
  return { str, x, y, width: str.length * pitch, height: pitch * 2 };
}

test("collapses a within-word kerning split into one token", () => {
  // pdf.js commonly emits one word as adjacent runs ("Legerde" + "main").
  const out = layoutPage([item("Legerde", 0, 100), item("main", 42, 100)]);
  expect(out).toBe("Legerdemain");
});

test("preserves a 2+ space gap between distant columns", () => {
  // A roll number and its value sit far apart; the gap must survive so a
  // downstream split(/\s{2,}/) sees two cells.
  const out = layoutPage([item("1", 0, 100), item("Boots", 60, 100)]);
  expect(out.split(/\s{2,}/)).toEqual(["1", "Boots"]);
});

test("keeps columns vertically aligned across rows", () => {
  // Same x on two rows must map to the same character column.
  const out = layoutPage([
    item("1", 0, 100),
    item("Boots", 60, 100),
    item("2", 0, 80),
    item("Cane", 60, 80),
  ]);
  const [r1, r2] = out.split("\n");
  expect(r1.indexOf("Boots")).toBe(r2.indexOf("Cane"));
});

test("clusters items into lines by baseline y", () => {
  const out = layoutPage([item("top", 0, 100), item("bottom", 0, 80)]);
  expect(out.split("\n")).toEqual(["top", "bottom"]);
});
