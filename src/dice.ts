export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export interface RollResult {
  expr: string;
  rolls: number[];
  total: number;
}

// Matches dice terms ("3d6", "d20", "-2d4") and flat modifiers ("+2", "5").
const TERM = /([+-]?)\s*(\d*)d(\d+)|([+-]?)\s*(\d+)/gi;

export function roll(expr: string): RollResult {
  const rolls: number[] = [];
  let total = 0;
  let matched = false;
  for (const m of expr.matchAll(TERM)) {
    matched = true;
    if (m[3]) {
      const sign = m[1] === "-" ? -1 : 1;
      const count = m[2] === "" ? 1 : parseInt(m[2], 10);
      const sides = parseInt(m[3], 10);
      for (let i = 0; i < count; i++) {
        const r = rollDie(sides);
        rolls.push(r);
        total += sign * r;
      }
    } else {
      const sign = m[4] === "-" ? -1 : 1;
      total += sign * parseInt(m[5], 10);
    }
  }
  if (!matched) throw new Error(`Can't parse dice expression: "${expr}"`);
  return { expr, rolls, total };
}
