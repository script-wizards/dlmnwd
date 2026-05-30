// Parse the d6 knack table and the named knack entries. Pure (no Node APIs) so
// it runs unchanged in the browser build.

import { extractTraits } from "./traits.ts";

export interface KnackEntry {
  name: string;
  text: string;
}

/** Parse the knack names out of the d6 table. Rows pair two d6 columns, so we
 *  walk (number, name) pairs; empty slots are dropped, so the result is the list
 *  of parsed names (callers only pick from it at random). Returns [] if the table
 *  isn't found. */
export function parseKnacksTable(pages: string[]): string[] {
  for (const page of pages) {
    const lines = page.split("\n");
    // Anchor on the "d6 Knack" column header, not the section title (which also
    // appears beside an unrelated d20 table).
    const header = lines.findIndex((l) => /\bd6\b\s+Knack/i.test(l));
    if (header < 0) continue;

    const items: string[] = Array.from({ length: 6 }, () => "");
    for (let i = header + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") {
        if (items.some(Boolean)) break; // table ended
        continue;
      }
      const cells = line.split(/\s{2,}/);
      for (let j = 0; j < cells.length; j++) {
        const m = cells[j].match(/^([1-6])$/);
        if (m && j + 1 < cells.length) {
          const n = parseInt(m[1], 10);
          if (items[n - 1] === "") {
            items[n - 1] = cells[j + 1].trim();
            j++;
          }
        }
      }
      if (items.every(Boolean)) break;
    }
    if (items.filter(Boolean).length >= 4) return items.filter(Boolean);
  }
  return [];
}

/** Parse the named knack entries in d6 order. The entries are ALL-CAPS-headed
 *  abilities, so we reuse the trait extractor and keep only the ones the table
 *  names (filtering out neighbouring headings). */
export function parseKnacks(pages: string[]): KnackEntry[] {
  const names = parseKnacksTable(pages);
  if (names.length === 0) return [];

  const start = pages.findIndex(
    (pg) => /MOSSLING KNACKS/i.test(pg) && names.some((n) => pg.includes(n)),
  );
  if (start < 0) return [];

  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const found = new Map(
    extractTraits(pages, start, Math.min(pages.length, start + 3))
      .filter((t) => wanted.has(t.name.toLowerCase()))
      .map((t) => [t.name.toLowerCase(), t]),
  );
  return names
    .map((n) => found.get(n.toLowerCase()))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .map((t) => ({ name: t.name, text: t.text }));
}
