// Parse the Adventuring Items d20 table from the Player's Book. The table is a
// 4-up layout (four "d20 Item" columns side by side) on a single page. In
// pdftotext -layout output, entries may appear as "N   Description" (number and
// text as separate split tokens) or "N Description" (single token), depending on
// the spacing. Both forms are handled.
//
// The table shares its page with body prose that also says "Adventuring Items"
// in running text, so we anchor on the heading line and the "d20 Item" header
// row, then scan only the compact data rows beneath — never the whole page.
//
// Pure (no Node APIs) so it runs unchanged in the browser build.

/**
 * Extract the 20-entry adventuring items table. Returns [] if the table is not
 * found. Entries are returned in d20 order (index 0 = roll 1).
 */
export function parseAdventuringItems(pages: string[]): string[] {
  for (const page of pages) {
    const lines = page.split("\n");
    // "ADVENTURING ITEMS" appears twice on the page: once in the body prose that
    // tells you to roll on it, and once as the actual table heading. Only the
    // heading is followed within a few lines by a "d20 Item" header row. Scan
    // every match until we find one with its table.
    for (let h = 0; h < lines.length; h++) {
      if (!/ADVENTURING ITEMS/i.test(lines[h])) continue;
      const headerOffset = lines.slice(h + 1, h + 4).findIndex((l) => /d20\s+Item/i.test(l));
      if (headerOffset < 0) continue; // body-prose mention, not the table

      const dataStart = h + 1 + headerOffset + 1;
      const items: string[] = Array.from({ length: 20 }, () => "");
      for (let i = dataStart; i < lines.length; i++) {
        const line = lines[i].trim();
        // The table is compact: a blank line ends it.
        if (line === "") break;

        const parts = line.split(/\s{2,}/);
        for (let j = 0; j < parts.length; j++) {
          const part = parts[j];
          // Case 1: "N Description" as a single token.
          const single = part.match(/^(\d{1,2})\s+(.+)/);
          if (single) {
            const n = parseInt(single[1], 10);
            if (n >= 1 && n <= 20 && items[n - 1] === "") items[n - 1] = single[2].trim();
            continue;
          }
          // Case 2: "N" is its own token, description is the next token.
          const numOnly = part.match(/^(\d{1,2})$/);
          if (numOnly && j + 1 < parts.length) {
            const n = parseInt(numOnly[1], 10);
            if (n >= 1 && n <= 20 && items[n - 1] === "") {
              items[n - 1] = parts[j + 1].trim();
              j++; // consume the description token
            }
          }
        }
      }
      if (items.filter(Boolean).length >= 10) return items.filter((s) => s.length > 0);
    }
  }
  return [];
}
