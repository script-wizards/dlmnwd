import {
  advance,
  clearState,
  formatElapsed,
  loadState,
  parseTurns,
  saveState,
  statePath,
} from "../turn.ts";
import type { TurnState } from "../turn.ts";

const USAGE = `usage: dw turn [n]                       advance n turns (default 1)
       dw turn track <name> <duration>   track a light or spell (6, 30m, 1h)
       dw turn status                    current turn and tracked durations
       dw turn check-every <n>           wandering-check cadence (default 2)
       dw turn end                       end the session, clear state`;

function load(): TurnState {
  const { state, note } = loadState();
  if (note) console.error(`dw: ${note}`);
  return state;
}

function header(state: TurnState): string {
  return `Turn ${state.turn}  (${formatElapsed(state.turn)} elapsed)`;
}

function cmdStatus(): void {
  const state = load();
  console.log(header(state));
  const next = state.turn + state.checkEvery - (state.turn % state.checkEvery);
  console.log(`Wandering check every ${state.checkEvery} turns; next due turn ${next}`);
  if (state.tracked.length === 0) {
    console.log("Nothing tracked.");
    return;
  }
  const width = Math.max(...state.tracked.map((t) => t.name.length));
  for (const t of state.tracked) {
    const s = t.remaining === 1 ? "" : "s";
    console.log(
      `  ${t.name.padEnd(width)}  ${t.remaining} turn${s} left  (expires turn ${state.turn + t.remaining})`,
    );
  }
}

function cmdTrack(rest: string[]): void {
  const [name, duration] = rest;
  if (!name || !duration) {
    console.error("usage: dw turn track <name> <duration>   (e.g. dw turn track torch 1h)");
    process.exit(1);
  }
  const turns = parseTurns(duration);
  const state = load();
  state.tracked = state.tracked.filter((t) => t.name !== name);
  state.tracked.push({ name, remaining: turns });
  saveState(state);
  const s = turns === 1 ? "" : "s";
  console.log(
    `Tracking ${name}: ${turns} turn${s} (${formatElapsed(turns)}), expires turn ${state.turn + turns}`,
  );
}

// Digits only: turn state persists, so "1h" or "3x" must not slip through as 1 or 3.
function parseCount(arg: string | undefined): number {
  return /^\d+$/.test(arg ?? "") ? parseInt(arg!, 10) : NaN;
}

function cmdCheckEvery(rest: string[]): void {
  const n = parseCount(rest[0]);
  if (Number.isNaN(n) || n < 1) {
    console.error("usage: dw turn check-every <n>   (n >= 1)");
    process.exit(1);
  }
  const state = load();
  state.checkEvery = n;
  saveState(state);
  console.log(`Wandering check every ${n} turn${n === 1 ? "" : "s"}`);
}

function cmdEnd(): void {
  const { state } = loadState();
  if (state.turn === 0 && state.tracked.length === 0) {
    console.log("No session in progress.");
  } else {
    console.log(`Session ended: ${state.turn} turns (${formatElapsed(state.turn)})`);
  }
  clearState();
}

function cmdAdvance(arg: string | undefined): void {
  const n = arg === undefined ? 1 : parseCount(arg);
  if (Number.isNaN(n) || n < 1) {
    console.error(USAGE);
    process.exit(1);
  }
  const state = load();
  const result = advance(state, n);
  saveState(state);
  console.log(header(state));
  for (const e of result.expired) {
    const when = e.turn === state.turn ? "now" : `turn ${e.turn}`;
    console.log(`  ✗ ${e.name} expired ${when}`);
  }
  for (const name of result.expiringNext) {
    console.log(`  ! ${name} expires next turn`);
  }
  if (result.checksDue.length === 1) {
    console.log(`  Wandering check due  (every ${state.checkEvery} turns; dw wander)`);
  } else if (result.checksDue.length > 1) {
    console.log(
      `  ${result.checksDue.length} wandering checks due: turns ${result.checksDue.join(", ")}  (dw wander)`,
    );
  }
}

export function cmdTurn(args: string[]): void {
  const [sub, ...rest] = args;
  switch (sub) {
    case "status":
      return cmdStatus();
    case "track":
      return cmdTrack(rest);
    case "check-every":
      return cmdCheckEvery(rest);
    case "end":
      return cmdEnd();
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      console.log(`\nState survives between invocations in ${statePath()}`);
      return;
    default:
      return cmdAdvance(sub);
  }
}
