import { expect, test } from "bun:test";
import { initLines, rollInitiative } from "../src/commands/init.ts";

const seq = (...rolls: number[]) => {
  let i = 0;
  return () => {
    if (i >= rolls.length) throw new Error("roll script exhausted");
    return rolls[i++];
  };
};

test("highest roll acts first", () => {
  const { sides, order } = rollInitiative(["Party", "Enemies"], seq(2, 5));
  expect(sides.map((s) => s.rolls)).toEqual([[2], [5]]);
  expect(order.map((s) => s.name)).toEqual(["Enemies", "Party"]);
});

test("a tie is rerolled until broken", () => {
  const { sides, order } = rollInitiative(["Party", "Enemies"], seq(3, 3, 4, 4, 2, 6));
  expect(sides.map((s) => s.rolls)).toEqual([
    [3, 4, 2],
    [3, 4, 6],
  ]);
  expect(order[0].name).toBe("Enemies");
});

test("a tie below the top is also broken", () => {
  const { order } = rollInitiative(["a", "b", "c"], seq(6, 4, 4, 1, 5));
  expect(order.map((s) => s.name)).toEqual(["a", "c", "b"]);
});

test("every side appears exactly once in the order", () => {
  for (let i = 0; i < 200; i++) {
    const { order } = rollInitiative(["a", "b", "c", "d"]);
    expect(order.map((s) => s.name).toSorted()).toEqual(["a", "b", "c", "d"]);
    for (const s of order) {
      for (const r of s.rolls) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(6);
      }
    }
  }
});

test("single round, two sides", () => {
  expect(initLines(["Party", "Enemies"], 1, seq(4, 2))).toEqual([
    "Initiative: Party 4, Enemies 2",
    "  Party acts first",
  ]);
});

test("single round shows the tie", () => {
  expect(initLines(["Party", "Enemies"], 1, seq(3, 3, 5, 1))).toEqual([
    "Initiative: Party 3→5, Enemies 3→1  (tie rerolled)",
    "  Party acts first",
  ]);
});

test("more than two sides prints the full order", () => {
  expect(initLines(["a", "b", "c"], 1, seq(2, 6, 4))).toEqual([
    "Initiative: a 2, b 6, c 4",
    "  Order: b, c, a",
  ]);
});

test("rounds flag rerolls each round", () => {
  expect(initLines(["Party", "Enemies"], 2, seq(4, 2, 1, 6))).toEqual([
    "Round 1: Party 4, Enemies 2  Party first",
    "Round 2: Party 1, Enemies 6  Enemies first",
  ]);
});
