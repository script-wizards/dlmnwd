// Fairy runes a character knows and how often they may still be used. Usage
// limits come from the book's usage-frequency table by magnitude and the
// caster's *current* level; each use is stamped with the party day and the
// caster's level so per-day/week/year/level/ever limits can be counted. Pure.

import { roll } from "../dice.ts";
import type { RuneEntry, RuneRules, UsageBand } from "../parse/rune.ts";
import { pick } from "../util.ts";
import type { KnownRune, PC } from "./store.ts";

const DAYS: Record<string, number> = { day: 1, week: 7, year: 365 };

export function usageBand(rules: RuneRules, magnitude: string, level: number): UsageBand | null {
  const bands = rules.usage[magnitude] ?? [];
  return (
    bands.find((b) => level >= b.minLevel && (b.maxLevel === null || level <= b.maxLevel)) ?? null
  );
}

export interface RuneStatus {
  band: UsageBand | null;
  limit: number | null; // null when the frequency couldn't be read
  used: number;
  left: number | null;
}

/** How many uses this rune has left in its current period. */
export function runeStatus(rune: KnownRune, pc: PC, today: number, rules: RuneRules): RuneStatus {
  const band = usageBand(rules, rune.magnitude, pc.level);
  const freq = band?.freq;
  if (!freq) return { band, limit: null, used: rune.uses.length, left: null };
  const limit = freq.count * rune.times;
  const used = rune.uses.filter((u) => {
    if (freq.period === "ever") return true;
    if (freq.period === "level") return u.level === pc.level;
    return u.day > today - DAYS[freq.period];
  }).length;
  return { band, limit, used, left: Math.max(0, limit - used) };
}

/** Record a use; throws when none are left (unless forced). */
export function useRune(
  rune: KnownRune,
  pc: PC,
  today: number,
  rules: RuneRules,
  force = false,
): RuneStatus {
  const st = runeStatus(rune, pc, today, rules);
  if (!force && st.left === 0)
    throw new Error(
      `${pc.name} has no uses of ${rune.name} left (${st.band?.text ?? "limit reached"}). --force to use anyway.`,
    );
  rune.uses.push({ day: today, level: pc.level });
  return runeStatus(rune, pc, today, rules);
}

/** Find a rune in the book's lists (exact, then prefix, then substring). */
export function lookupRune(rules: RuneRules, query: string): RuneEntry | null {
  const q = query.trim().toLowerCase();
  const all = rules.runes;
  return (
    all.find((r) => r.name.toLowerCase() === q) ??
    all.find((r) => r.name.toLowerCase().startsWith(q)) ??
    all.find((r) => r.name.toLowerCase().includes(q)) ??
    null
  );
}

/** Teach a rune. A duplicate grant doubles the uses allowed. */
export function grantRune(pc: PC, entry: RuneEntry): { rune: KnownRune; duplicate: boolean } {
  const known = pc.runes.find((r) => r.name.toLowerCase() === entry.name.toLowerCase());
  if (known) {
    known.times *= 2;
    return { rune: known, duplicate: true };
  }
  const rune: KnownRune = { name: entry.name, magnitude: entry.magnitude, times: 1, uses: [] };
  pc.runes.push(rune);
  return { rune, duplicate: false };
}

export interface GrantRoll {
  dice: number;
  bonus: number;
  total: number;
  text: string;
  entry: RuneEntry | null;
}

/** Roll on the rune-granted table: 2d6 + the level bonus, then a random rune
 *  of the granted magnitude (or none). */
export function rollRuneGrant(rules: RuneRules, level: number, modifier = 0): GrantRoll {
  const dice = roll("2d6").total;
  const bonus =
    (rules.levelBonus.find(
      (b) => level >= b.minLevel && (b.maxLevel === null || level <= b.maxLevel),
    )?.bonus ?? 0) + modifier;
  const total = dice + bonus;
  const row = rules.granted.find(
    (g) => (g.min === null || total >= g.min) && (g.max === null || total <= g.max),
  );
  const pool = row?.magnitude ? rules.runes.filter((r) => r.magnitude === row.magnitude) : [];
  return {
    dice,
    bonus,
    total,
    text: row?.text ?? "no row on the table",
    entry: pool.length > 0 ? pick(pool) : null,
  };
}
