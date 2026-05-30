// A browser-friendly emulation of `pdftotext -layout`, built on pdf.js.
//
// The whole parse/ pipeline assumes the fixed-width ASCII that `pdftotext
// -layout` emits, where a glyph's character column carries meaning (cells split
// on 2+ spaces, table columns read by x-offset). pdf.js gives us positioned
// text items instead, so here we re-grid them onto a monospace character canvas:
// one global character pitch per page, every item placed at round((x-minX)/pitch).
// Same x always maps to the same column, so vertical table alignment is preserved
// exactly — which is the property the parsers actually depend on.

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number; // advance width of the whole str, in PDF user units
  height: number; // font size, in PDF user units
}

/** Median of a numeric array (returns 0 for empty input). */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.toSorted((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Render one page's positioned items into a fixed-width text block. */
export function layoutPage(items: TextItem[]): string {
  const real = items.filter((it) => it.str.length > 0 && it.width > 0);
  if (real.length === 0) return "";

  // Character pitch: median per-glyph advance across the page. Too small and a
  // word's own letters gain internal spaces (over-splitting cells); too large and
  // adjacent columns collapse. The median advance tracks the body font closely.
  const pitch = median(real.map((it) => it.width / it.str.length)) || 1;

  // Line height: median font size, used as the y-clustering tolerance.
  const lineH = median(real.map((it) => it.height)) || pitch;
  const minX = Math.min(...real.map((it) => it.x));

  // Cluster items into lines by baseline y (pdf.js y grows upward → sort desc).
  const byY = real.toSorted((a, b) => b.y - a.y);
  const lines: TextItem[][] = [];
  for (const it of byY) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= lineH * 0.5) last.push(it);
    else lines.push([it]);
  }

  return lines
    .map((line) => {
      line.sort((a, b) => a.x - b.x);
      let out = "";
      let prevEndX = minX; // x where the previous item's glyphs ended
      for (const it of line) {
        // The absolute column this item belongs in (preserves table alignment)…
        const col = Math.max(0, Math.round((it.x - minX) / pitch));
        // …but the *gap* is measured from the previous item's real end, so kerning
        // splits within a word (consecutive pdf.js items, no true space between
        // them) collapse to zero instead of gaining a spurious space.
        const gap = Math.round((it.x - prevEndX) / pitch);
        if (out.length === 0) {
          out = " ".repeat(col) + it.str;
        } else if (gap <= 0) {
          out += it.str; // adjoining glyphs: no separator
        } else {
          // Honour the larger of the measured gap and the absolute column, so a
          // real column boundary still lands where the header expects it.
          out += " ".repeat(Math.max(gap, col - out.length, 1)) + it.str;
        }
        prevEndX = it.x + it.width;
      }
      return out.replace(/\s+$/, "");
    })
    .join("\n");
}

/**
 * Extract every page of a PDF as fixed-width text, one string per page — the
 * pdf.js-based, browser-safe analogue of extract.ts's pdftotext call. Accepts a
 * raw byte buffer so it works the same in Bun and in the browser (File → bytes).
 */
export async function extractPagesEmulated(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await task.promise;

  const pages: string[] = [];
  // Sequential (not Promise.all) so each page is cleaned up before the next —
  // keeps peak memory bounded when a large PDF is loaded in the browser.
  // oxlint-disable no-await-in-loop
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = content.items
      .filter(
        (i): i is { str: string; transform: number[]; width: number; height: number } => "str" in i,
      )
      .map((i) => ({
        str: i.str,
        x: i.transform[4],
        y: i.transform[5],
        width: i.width,
        height: i.height || Math.abs(i.transform[3]),
      }));
    pages.push(layoutPage(items));
    page.cleanup();
  }
  // oxlint-enable no-await-in-loop
  await task.destroy();
  return pages;
}
