import { roll } from "../dice.ts";
import { reaction } from "../rules.ts";

export function cmdReact(args: string[]): void {
  const mod = parseInt(args[0] ?? "0", 10) || 0;
  const r = roll("2d6");
  const total = r.total + mod;
  const modStr = mod ? ` ${mod > 0 ? "+" : ""}${mod}` : "";
  console.log(`Reaction: ${total}  (2d6=${r.rolls.join("+")}${modStr})`);
  console.log(`  ${reaction(total)}`);
}
