import { roll } from "../dice.ts";
import { moraleBreaks } from "../rules.ts";

export function cmdMorale(args: string[]): void {
  const ml = parseInt(args[0] ?? "", 10);
  if (Number.isNaN(ml)) {
    console.error("usage: dw morale <morale-score 2-12> [modifier]");
    process.exit(1);
  }
  const mod = parseInt(args[1] ?? "0", 10) || 0;
  const r = roll("2d6");
  const total = r.total + mod;
  const modStr = mod ? ` ${mod > 0 ? "+" : ""}${mod}` : "";
  console.log(`Morale: ${total} (2d6=${r.rolls.join("+")}${modStr}) vs ML ${ml}`);
  console.log(moraleBreaks(total, ml) ? "  ✗ Breaks: flees or surrenders" : "  ✓ Holds");
}
