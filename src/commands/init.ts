import { rollDie } from "../dice.ts";

type Die = (sides: number) => number;

export interface Side {
  name: string;
  rolls: number[];
}

function orderByLastRoll(group: Side[], die: Die): Side[] {
  const byRoll = new Map<number, Side[]>();
  for (const s of group) {
    const last = s.rolls[s.rolls.length - 1];
    const tied = byRoll.get(last);
    if (tied) tied.push(s);
    else byRoll.set(last, [s]);
  }
  const out: Side[] = [];
  for (const [, tied] of [...byRoll].toSorted((a, b) => b[0] - a[0])) {
    if (tied.length > 1) {
      for (const s of tied) s.rolls.push(die(6));
      out.push(...orderByLastRoll(tied, die));
    } else {
      out.push(tied[0]);
    }
  }
  return out;
}

export function rollInitiative(
  names: string[],
  die: Die = rollDie,
): { sides: Side[]; order: Side[] } {
  const sides = names.map((name) => ({ name, rolls: [die(6)] }));
  return { sides, order: orderByLastRoll([...sides], die) };
}

const show = (s: Side): string => `${s.name} ${s.rolls.join("→")}`;

export function initLines(names: string[], rounds: number, die: Die = rollDie): string[] {
  const lines: string[] = [];
  for (let round = 1; round <= rounds; round++) {
    const { sides, order } = rollInitiative(names, die);
    const rolls = sides.map(show).join(", ");
    const acting =
      names.length === 2 ? `${order[0].name} first` : order.map((s) => s.name).join(", ");
    if (rounds === 1) {
      const tie = sides.some((s) => s.rolls.length > 1);
      lines.push(`Initiative: ${rolls}${tie ? "  (tie rerolled)" : ""}`);
      lines.push(names.length === 2 ? `  ${order[0].name} acts first` : `  Order: ${acting}`);
    } else {
      lines.push(`Round ${round}: ${rolls}  ${acting}`);
    }
  }
  return lines;
}

export function cmdInit(args: string[]): void {
  const names: string[] = [];
  let rounds = 1;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-r" || a === "--rounds") rounds = parseInt(args[++i] ?? "", 10);
    else if (a.startsWith("--rounds=")) rounds = parseInt(a.split("=")[1], 10);
    else if (a.startsWith("-")) rounds = NaN;
    else names.push(a);
  }
  const sides = names.length ? names : ["Party", "Enemies"];
  if (sides.length < 2 || !Number.isInteger(rounds) || rounds < 1) {
    console.error("usage: dw init [side side ...] [-r/--rounds <n>]");
    process.exit(1);
  }
  for (const line of initLines(sides, rounds)) console.log(line);
}
