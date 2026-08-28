import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Same machine-local home as dw.db and the extraction cache (db.ts), so the
// session survives switching or re-cloning checkouts.
const CACHE_DIR = join(homedir(), ".cache", "dw");

export const TURN_MINUTES = 10;
export const DEFAULT_CHECK_EVERY = 2;

export interface Tracked {
  name: string;
  remaining: number;
}

export interface TurnState {
  turn: number;
  checkEvery: number;
  tracked: Tracked[];
}

export function statePath(): string {
  const env = process.env.DW_SESSION?.trim();
  return env || join(CACHE_DIR, "dw-session.json");
}

export function freshState(): TurnState {
  return { turn: 0, checkEvery: DEFAULT_CHECK_EVERY, tracked: [] };
}

export function loadState(): { state: TurnState; note?: string } {
  const path = statePath();
  if (!existsSync(path)) return { state: freshState() };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (
      !Number.isInteger(raw.turn) ||
      raw.turn < 0 ||
      !Number.isInteger(raw.checkEvery) ||
      raw.checkEvery < 1 ||
      !Array.isArray(raw.tracked) ||
      raw.tracked.some(
        (t: Tracked) =>
          typeof t?.name !== "string" || !Number.isInteger(t?.remaining) || t.remaining < 1,
      )
    ) {
      throw new Error("bad shape");
    }
    return { state: { turn: raw.turn, checkEvery: raw.checkEvery, tracked: raw.tracked } };
  } catch {
    return { state: freshState(), note: `Turn state at ${path} was unreadable; starting fresh.` };
  }
}

export function saveState(state: TurnState): void {
  const path = statePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

export function clearState(): void {
  rmSync(statePath(), { force: true });
}

/** Parse a duration into turns: "6" or "6t" turns, "30m" minutes, "1h" hours. */
export function parseTurns(spec: string): number {
  const m = /^(\d+)\s*(t|m|min|h|hr)?$/i.exec(spec.trim());
  if (!m) throw new Error(`Can't parse duration "${spec}" (turns like 6, or 30m, 1h)`);
  const n = parseInt(m[1], 10);
  const unit = (m[2] ?? "t").toLowerCase();
  const turns =
    unit === "h" || unit === "hr"
      ? n * (60 / TURN_MINUTES)
      : unit === "m" || unit === "min"
        ? Math.ceil(n / TURN_MINUTES)
        : n;
  if (turns < 1)
    throw new Error(`Duration "${spec}" is shorter than a turn (${TURN_MINUTES} minutes)`);
  return turns;
}

export function formatElapsed(turns: number): string {
  const minutes = turns * TURN_MINUTES;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

export interface AdvanceResult {
  expired: { name: string; turn: number }[];
  expiringNext: string[];
  checksDue: number[];
}

/** Advance n turns in place, ticking durations and noting due wandering checks. */
export function advance(state: TurnState, n: number): AdvanceResult {
  const expired: { name: string; turn: number }[] = [];
  const checksDue: number[] = [];
  for (let i = 0; i < n; i++) {
    state.turn += 1;
    for (const t of state.tracked) {
      t.remaining -= 1;
      if (t.remaining === 0) expired.push({ name: t.name, turn: state.turn });
    }
    state.tracked = state.tracked.filter((t) => t.remaining > 0);
    if (state.turn % state.checkEvery === 0) checksDue.push(state.turn);
  }
  const expiringNext = state.tracked.filter((t) => t.remaining === 1).map((t) => t.name);
  return { expired, expiringNext, checksDue };
}
