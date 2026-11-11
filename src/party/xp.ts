// XP awards and levelling. The XP modifier comes from the class's prime
// abilities (lowest score) against the book's modifier table, plus any flat
// kindred bonus; level rows come from the class's advancement table. Pure.

import { roll } from "../dice.ts";
import type { LevelRow, ParsedClass } from "../parse/class.ts";
import { abilityMod } from "../rules.ts";
import { classOf, type PartyRules } from "./rules.ts";
import type { PC, Party, Saves } from "./store.ts";
import { activeMembers } from "./store.ts";

/** Percent applied to XP earned: prime-ability modifier + kindred bonus. */
export function xpModifier(pc: PC, rules: PartyRules): number {
  const klass = classOf(rules, pc.class);
  let prime = 0;
  if (klass && klass.primeAbilities.length > 0) {
    const lowest = Math.min(...klass.primeAbilities.map((a) => pc.scores[a]));
    prime = rules.primeXp.find((b) => lowest >= b.min && lowest <= b.max)?.percent ?? 0;
  }
  return prime + (rules.kindredXp[pc.kindred] ?? 0);
}

/** XP needed for the next level, or null at the top of the table / unknown class. */
export function nextLevelXp(pc: PC, klass: ParsedClass | undefined): number | null {
  const row = klass?.advancement?.find((r) => r.level === pc.level + 1);
  return row ? row.xp : null;
}

/** Can this character level up on their current XP? */
export function canLevel(pc: PC, klass: ParsedClass | undefined): boolean {
  const next = nextLevelXp(pc, klass);
  return next !== null && pc.xp >= next;
}

export interface Award {
  pc: PC;
  share: number; // before modifiers
  gained: number;
  modifier: number;
  ready: boolean; // enough XP to level up
}

/** Apply raw XP to one character through their modifier (halved for retainers). */
export function grantXp(pc: PC, amount: number, rules: PartyRules): Award {
  const modifier = xpModifier(pc, rules);
  let gained = Math.floor(amount * (1 + modifier / 100));
  if (pc.retainer) gained = Math.floor(gained / 2);
  pc.xp += gained;
  return {
    pc,
    share: amount,
    gained,
    modifier,
    ready: canLevel(pc, classOf(rules, pc.class)),
  };
}

/** Divide a party award evenly between the active members (or those named). */
export function awardParty(
  party: Party,
  total: number,
  rules: PartyRules,
  members: PC[] = activeMembers(party),
): Award[] {
  if (members.length === 0) throw new Error("No active party members to award XP to.");
  const share = Math.floor(total / members.length);
  return members.map((pc) => grantXp(pc, share, rules));
}

export interface LevelUp {
  from: number;
  to: number;
  hpRoll: string; // e.g. "1d6 (4) + 1 CON" or "+2"
  hpGained: number;
  attack: [number, number];
  saves: [Saves, Saves];
  /** Extra table columns that changed, e.g. { Glamours: ["2", "3"] }. */
  extras: Record<string, [string, string]>;
  row: LevelRow;
}

/**
 * Advance a character one level from their class table: roll the level's Hit
 * Points (dice add the CON modifier, min 1; a flat gain doesn't), and take the
 * new Attack and Save Targets. `hp` records a roll the player made themselves
 * (the die result, before CON).
 */
export function levelUp(pc: PC, klass: ParsedClass, opts: { hp?: number } = {}): LevelUp {
  const table = klass.advancement ?? [];
  const row = table.find((r) => r.level === pc.level + 1);
  if (!row) throw new Error(`${klass.name} advancement table has no Level ${pc.level + 1}.`);
  const prev = table.find((r) => r.level === pc.level);

  const dice = row.hitPoints.match(/(\d*d\d+)/);
  let hpGained: number;
  let hpRoll: string;
  if (dice) {
    const rolled = opts.hp ?? roll(dice[1]).total;
    const con = abilityMod(pc.scores.con);
    hpGained = Math.max(1, rolled + con);
    hpRoll = `${dice[1]} (${rolled})${con ? ` ${con > 0 ? "+" : "−"} ${Math.abs(con)} CON` : ""}`;
  } else {
    hpGained = opts.hp ?? (parseInt(row.hitPoints.replace(/[^\d]/g, ""), 10) || 0);
    hpRoll = row.hitPoints;
  }

  const extras: Record<string, [string, string]> = {};
  for (const [k, v] of Object.entries(row.extras)) {
    const before = prev?.extras[k] ?? "";
    if (before !== v) extras[k] = [before, v];
  }
  const out: LevelUp = {
    from: pc.level,
    to: row.level,
    hpRoll,
    hpGained,
    attack: [pc.attack, row.attack],
    saves: [{ ...pc.saves }, { ...row.saves }],
    extras,
    row,
  };
  pc.level = row.level;
  pc.maxHp += hpGained;
  pc.hp += hpGained;
  pc.attack = row.attack;
  pc.saves = { ...row.saves };
  return out;
}

/** The table row for the character's current level, when known. */
export function currentRow(pc: PC, klass: ParsedClass | undefined): LevelRow | undefined {
  return klass?.advancement?.find((r) => r.level === pc.level);
}
