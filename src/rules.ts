// System mechanics (not copyrightable flavour). Numbers here are the standard
// B/X-style spreads; override per-table in data/ if your game differs.

import { pick } from "./util.ts";

export function abilityMod(score: number): number {
  if (score <= 3) return -3;
  if (score <= 5) return -2;
  if (score <= 8) return -1;
  if (score <= 12) return 0;
  if (score <= 15) return 1;
  if (score <= 17) return 2;
  return 3;
}

export interface ReactionTier {
  max: number;
  label: string;
}

// Standard 2d6 reaction roll.
export const REACTION_TIERS: ReactionTier[] = [
  { max: 2, label: "Hostile: attacks if able" },
  { max: 5, label: "Unfriendly: may attack" },
  { max: 8, label: "Neutral: uncertain, wary" },
  { max: 11, label: "Indifferent: no strong reaction" },
  { max: Infinity, label: "Friendly: helpful" },
];

export function reaction(total: number): string {
  return REACTION_TIERS.find((t) => total <= t.max)!.label;
}

/** Morale check: 2d6 over the morale score means the creature breaks. */
export function moraleBreaks(total: number, moraleScore: number): boolean {
  return total > moraleScore;
}

// Non-mortal kindreds cannot take the two devotional classes. The books state
// this as a religion rule; the mechanical effect is the restriction below.
const RESTRICTED_CLASSES = new Set(["cleric", "friar"]);

/** True if the kindred type can choose the given class. */
export function canBeClass(kindredType: string, classId: string): boolean {
  if (!RESTRICTED_CLASSES.has(classId)) return true;
  return kindredType.toLowerCase() === "mortal";
}

const VALID_ALIGNMENTS = new Set(["lawful", "neutral", "chaotic"]);

/** Normalize an alignment string to canonical title case, or "" if invalid. */
export function normalizeAlignment(input: string): string {
  const lower = input.trim().toLowerCase();
  if (!VALID_ALIGNMENTS.has(lower)) return "";
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** True if the class permits the given alignment (clerics/friars can't be Chaotic). */
export function canBeAlignment(classId: string, alignment: string): boolean {
  if (alignment.toLowerCase() !== "chaotic") return true;
  return !RESTRICTED_CLASSES.has(classId);
}

interface KindredChoice {
  id: string;
  kindredType: string;
}

interface ClassChoice {
  id: string;
}

/**
 * Fill in whichever half of a kindred/class pair the player left unchosen,
 * rolling only among legal combinations: a kindred is drawn uniformly from
 * those with at least one permitted class, then a class uniformly from that
 * kindred's permitted classes. A given alignment narrows the class pool too.
 * Returns null when nothing satisfies the constraints.
 */
export function rollKindredClass<K extends KindredChoice, C extends ClassChoice>(
  kindreds: K[],
  classes: C[],
  opts: { kindred?: K | null; klass?: C | null; alignment?: string } = {},
): { kindred: K; klass: C } | null {
  const kindredPool = opts.kindred ? [opts.kindred] : kindreds;
  const classPool = opts.klass ? [opts.klass] : classes;

  const candidates = kindredPool
    .map((kindred) => ({
      kindred,
      classes: classPool.filter(
        (c) =>
          canBeClass(kindred.kindredType, c.id) &&
          (!opts.alignment || canBeAlignment(c.id, opts.alignment)),
      ),
    }))
    .filter((c) => c.classes.length > 0);

  if (candidates.length === 0) return null;
  const chosen = pick(candidates);
  return { kindred: chosen.kindred, klass: pick(chosen.classes) };
}
