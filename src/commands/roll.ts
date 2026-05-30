import { roll } from "../dice.ts";

export function cmdRoll(args: string[]): void {
  const expr = args.join("") || "1d20";
  const r = roll(expr);
  const detail = r.rolls.length > 1 ? `  (${r.rolls.join(", ")})` : "";
  console.log(`${r.total}${detail}  [${expr}]`);
}
