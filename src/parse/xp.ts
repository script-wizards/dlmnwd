// Parse the prime-ability XP modifier table from the Player's Book, and read a
// kindred's flat XP bonus from its trait prose. Pure (no Node APIs).

import { reflowColumns } from "../pdf/columns.ts";

export interface XpBand {
  min: number;
  max: number;
  percent: number; // e.g. -10, +5
}

/** The "Prime Ability Score / XP Modifier" rows: "3–5  –20%", "16–18  +10%".
 *  The table can share its lines with a neighbouring column, so each row is
 *  matched where it sits rather than as a whole line. */
export function parsePrimeXpModifiers(pages: string[]): XpBand[] {
  for (const page of pages) {
    const lines = page.split("\n");
    const h = lines.findIndex((l) => /\bXP MODIFIERS?\b/.test(l));
    if (h < 0) continue;
    const bands: XpBand[] = [];
    for (const line of lines.slice(h + 1, h + 12)) {
      for (const m of line.matchAll(/(\d+)\s*[–-]\s*(\d+)\s{2,}([+–-])(\d+)%/g)) {
        const sign = m[3] === "+" ? 1 : -1;
        bands.push({ min: +m[1], max: +m[2], percent: sign * +m[4] });
      }
    }
    if (bands.length >= 2) return bands;
  }
  return [];
}

/** A kindred's flat bonus to all XP earned ("a +10% bonus to all Experience
 *  Points earned"), from its trait text; 0 when it has none. */
export function kindredXpBonus(traits: { text: string }[]): number {
  for (const t of traits) {
    const m = t.text
      .replace(/\s+/g, " ")
      .match(/([+–-])(\d+)% (?:bonus|penalty) to all Experience Points/i);
    if (m) return (m[1] === "+" ? 1 : -1) * +m[2];
  }
  return 0;
}

/** Flat kindred XP bonuses found anywhere in the book's prose ("Humans … gain a
 *  +10% bonus to all Experience Points earned"), keyed by kindred id. Used when
 *  a kindred's traits weren't parsed. The kindred is the nearest kindred name
 *  (singular or plural) before the phrase, within the same paragraph. */
export function kindredXpBonuses(
  pages: string[],
  kindreds: { id: string; name: string }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const page of pages) {
    const flat = reflowColumns(page).replace(/\s+/g, " ");
    for (const m of flat.matchAll(/([+–-])(\d+)% (?:bonus|penalty) to all Experience Points/gi)) {
      const before = flat.slice(Math.max(0, (m.index ?? 0) - 160), m.index);
      let best: { id: string; at: number } | null = null;
      for (const k of kindreds) {
        const re = new RegExp(`\\b${k.name}s?\\b`, "gi");
        for (const hit of before.matchAll(re)) {
          const at = hit.index ?? 0;
          if (!best || at > best.at) best = { id: k.id, at };
        }
      }
      if (best && out[best.id] === undefined) out[best.id] = (m[1] === "+" ? 1 : -1) * +m[2];
    }
  }
  return out;
}
