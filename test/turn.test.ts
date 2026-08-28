import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  advance,
  clearState,
  formatElapsed,
  freshState,
  loadState,
  parseTurns,
  saveState,
  statePath,
} from "../src/turn.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dw-turn-"));
  process.env.DW_SESSION = join(dir, "dw-session.json");
});

afterEach(() => {
  delete process.env.DW_SESSION;
  rmSync(dir, { recursive: true, force: true });
});

describe("parseTurns", () => {
  test("bare numbers and t suffix are turns", () => {
    expect(parseTurns("6")).toBe(6);
    expect(parseTurns("1t")).toBe(1);
    expect(parseTurns("12t")).toBe(12);
  });

  test("hours convert at 6 turns per hour", () => {
    expect(parseTurns("1h")).toBe(6);
    expect(parseTurns("2h")).toBe(12);
    expect(parseTurns("1hr")).toBe(6);
  });

  test("minutes convert at 10 per turn, rounding up", () => {
    expect(parseTurns("30m")).toBe(3);
    expect(parseTurns("25m")).toBe(3);
    expect(parseTurns("10min")).toBe(1);
    expect(parseTurns("5m")).toBe(1);
  });

  test("rejects garbage and zero durations", () => {
    expect(() => parseTurns("soon")).toThrow();
    expect(() => parseTurns("")).toThrow();
    expect(() => parseTurns("0")).toThrow();
    expect(() => parseTurns("0m")).toThrow();
  });
});

describe("formatElapsed", () => {
  test("formats minutes and hours", () => {
    expect(formatElapsed(0)).toBe("0m");
    expect(formatElapsed(3)).toBe("30m");
    expect(formatElapsed(6)).toBe("1h");
    expect(formatElapsed(10)).toBe("1h40m");
  });
});

describe("advance", () => {
  test("advances the turn counter", () => {
    const state = freshState();
    advance(state, 1);
    expect(state.turn).toBe(1);
    advance(state, 3);
    expect(state.turn).toBe(4);
  });

  test("ticks durations, warning at one turn left and on expiry", () => {
    const state = freshState();
    state.tracked = [{ name: "torch", remaining: 2 }];

    let r = advance(state, 1);
    expect(r.expired).toEqual([]);
    expect(r.expiringNext).toEqual(["torch"]);

    r = advance(state, 1);
    expect(r.expired).toEqual([{ name: "torch", turn: 2 }]);
    expect(r.expiringNext).toEqual([]);
    expect(state.tracked).toEqual([]);
  });

  test("reports mid-span expiries with their turn", () => {
    const state = freshState();
    state.tracked = [
      { name: "candle", remaining: 1 },
      { name: "lantern", remaining: 5 },
    ];
    const r = advance(state, 4);
    expect(r.expired).toEqual([{ name: "candle", turn: 1 }]);
    expect(r.expiringNext).toEqual(["lantern"]);
    expect(state.tracked).toEqual([{ name: "lantern", remaining: 1 }]);
  });

  test("flags wandering checks on the cadence", () => {
    const state = freshState();
    expect(advance(state, 4).checksDue).toEqual([2, 4]);

    const every3 = { ...freshState(), checkEvery: 3 };
    expect(advance(every3, 7).checksDue).toEqual([3, 6]);

    const everyTurn = { ...freshState(), checkEvery: 1 };
    expect(advance(everyTurn, 2).checksDue).toEqual([1, 2]);
  });
});

describe("state persistence", () => {
  test("round-trips through the state file", () => {
    const state = freshState();
    state.tracked = [{ name: "light spell", remaining: 6 }];
    advance(state, 2);
    state.checkEvery = 3;
    saveState(state);

    const { state: loaded, note } = loadState();
    expect(note).toBeUndefined();
    expect(loaded).toEqual(state);
  });

  test("missing file starts fresh without a note", () => {
    const { state, note } = loadState();
    expect(note).toBeUndefined();
    expect(state).toEqual(freshState());
  });

  test("corrupt file starts fresh with a note", () => {
    writeFileSync(statePath(), "{not json");
    const { state, note } = loadState();
    expect(state).toEqual(freshState());
    expect(note).toContain("starting fresh");
  });

  test("wrong-shaped file starts fresh with a note", () => {
    writeFileSync(statePath(), JSON.stringify({ turn: "three", tracked: {} }));
    const { state, note } = loadState();
    expect(state).toEqual(freshState());
    expect(note).toContain("starting fresh");
  });

  test("out-of-range values start fresh with a note", () => {
    for (const bad of [
      { turn: -1, checkEvery: 2, tracked: [] },
      { turn: 1.5, checkEvery: 2, tracked: [] },
      { turn: 0, checkEvery: 0, tracked: [] },
      { turn: 0, checkEvery: 2, tracked: [{ name: "torch", remaining: 0 }] },
      { turn: 0, checkEvery: NaN, tracked: [] },
    ]) {
      writeFileSync(statePath(), JSON.stringify(bad));
      const { state, note } = loadState();
      expect(state).toEqual(freshState());
      expect(note).toContain("starting fresh");
    }
  });

  test("clearState removes the file", () => {
    saveState(freshState());
    clearState();
    const { state } = loadState();
    expect(state.turn).toBe(0);
    expect(() => clearState()).not.toThrow();
  });
});
