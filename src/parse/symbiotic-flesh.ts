// Parse the d20 Symbiotic Flesh infestation table. Pure (no Node APIs) so it
// runs unchanged in the browser build.

/** Parse the 20 infestation descriptions from the "d20 Infestation" table,
 *  indexed by roll − 1. Returns [] unless all 20 rows are found: this table is a
 *  stylised graphic that the pdftotext path scrambles, so only the pdf.js
 *  emulator (the web path) reads it cleanly — the CLI degrades to no roll. */
export function parseSymbioticFlesh(pages: string[]): string[] {
  for (const page of pages) {
    const lines = page.split("\n");
    const header = lines.findIndex((l) => /\bd20\b\s+Infestation/i.test(l));
    if (header < 0) continue;

    const items: string[] = Array.from({ length: 20 }, () => "");
    for (let i = header + 1; i < lines.length; i++) {
      const m = lines[i].trim().match(/^(\d{1,2})\s+(.+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 20 && items[n - 1] === "") items[n - 1] = m[2].trim();
      }
      if (items.every(Boolean)) return items;
    }
  }
  return [];
}
