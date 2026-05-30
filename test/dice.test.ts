import { expect, test } from "bun:test";
import { roll } from "../src/dice.ts";
import { abilityMod, moraleBreaks, reaction } from "../src/rules.ts";

test("constant expression", () => {
  expect(roll("4").total).toBe(4);
  expect(roll("4").rolls.length).toBe(0);
});

test("dice stay within range", () => {
  for (let i = 0; i < 500; i++) {
    const r = roll("3d6");
    expect(r.rolls.length).toBe(3);
    expect(r.total).toBeGreaterThanOrEqual(3);
    expect(r.total).toBeLessThanOrEqual(18);
  }
});

test("flat modifier is applied", () => {
  for (let i = 0; i < 100; i++) {
    const r = roll("1d6+10");
    expect(r.total).toBeGreaterThanOrEqual(11);
    expect(r.total).toBeLessThanOrEqual(16);
  }
});

test("d20 shorthand", () => {
  const r = roll("d20");
  expect(r.rolls.length).toBe(1);
  expect(r.total).toBeGreaterThanOrEqual(1);
  expect(r.total).toBeLessThanOrEqual(20);
});

test("unparseable expression throws", () => {
  expect(() => roll("banana")).toThrow();
});

test("ability modifiers", () => {
  expect(abilityMod(3)).toBe(-3);
  expect(abilityMod(8)).toBe(-1);
  expect(abilityMod(10)).toBe(0);
  expect(abilityMod(13)).toBe(1);
  expect(abilityMod(16)).toBe(2);
  expect(abilityMod(18)).toBe(3);
});

test("reaction tiers cover the full 2d6 range", () => {
  expect(reaction(2)).toMatch(/Hostile/);
  expect(reaction(4)).toMatch(/Unfriendly/);
  expect(reaction(7)).toMatch(/Neutral/);
  expect(reaction(10)).toMatch(/Indifferent/);
  expect(reaction(12)).toMatch(/Friendly/);
  expect(reaction(20)).toMatch(/Friendly/);
});

test("morale break logic", () => {
  expect(moraleBreaks(9, 8)).toBe(true);
  expect(moraleBreaks(8, 8)).toBe(false);
  expect(moraleBreaks(2, 12)).toBe(false);
});
