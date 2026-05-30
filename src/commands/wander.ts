import { roll } from "../dice.ts";
import { loadData } from "../data.ts";

function inRange(spec: string, n: number): boolean {
  if (spec.includes("-")) {
    const [a, b] = spec.split("-").map((s) => parseInt(s, 10));
    return n >= a && n <= b;
  }
  return parseInt(spec, 10) === n;
}

export function cmdWander(args: string[]): void {
  const chanceFlag = args.find((a) => a.startsWith("--chance="));
  const chance = chanceFlag ? parseInt(chanceFlag.split("=")[1], 10) : 1;
  const region = args.find((a) => !a.startsWith("--"));

  const check = roll("1d6");
  if (check.total > chance) {
    console.log(`No encounter  (1d6=${check.total}, needs ≤${chance})`);
    return;
  }
  console.log(`Encounter!  (1d6=${check.total} ≤ ${chance})`);

  if (!region) {
    console.log("  (no region given; roll on your table)");
    return;
  }
  const data = loadData();
  const table = data.encounters.get(region);
  if (!table) {
    const known = [...data.encounters.keys()].join(", ") || "none";
    console.error(`  No encounter table for "${region}". Available: ${known}`);
    return;
  }
  const er = roll(table.die);
  const row = table.results.find((r) => inRange(r.roll, er.total));
  const result = row ? row.monster + (row.note ? `  (${row.note})` : "") : "(none)";
  console.log(`  ${table.die}=${er.total}: ${result}`);
}
