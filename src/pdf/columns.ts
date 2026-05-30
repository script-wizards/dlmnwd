// Pure column-geometry helpers over fixed-width page text. No Node APIs, so they
// run unchanged in the browser (the layout-emulated character canvas has the
// same shape as pdftotext -layout output these were written for).

/**
 * Reflow a two-column page into single-column reading order (left column, then
 * right). Detects the whitespace gutter in the central band of the page; pages
 * with no clear gutter are returned unchanged.
 */
export function reflowColumns(page: string): string {
  const lines = page.split("\n");
  const content = lines.filter((l) => l.trim().length > 0);
  if (content.length < 6) return page;

  const width = Math.max(...lines.map((l) => l.length));
  const lo = Math.floor(width * 0.3);
  const hi = Math.floor(width * 0.7);
  const need = content.length * 0.92; // a real gutter is blank on nearly every line

  const blankAt = (col: number) => content.filter((l) => col >= l.length || l[col] === " ").length;

  // The gutter is the rightmost near-blank column in the central band: left-column
  // body text can run wide, so we split just before the right column begins.
  let gutter = -1;
  for (let c = hi; c >= lo; c--) {
    if (blankAt(c) >= need) {
      gutter = c;
      break;
    }
  }
  if (gutter < 0) return page; // single column

  // gutter column itself is blank, so drop it: left keeps [0, gutter), right [gutter+1, ).
  const left = lines.map((l) => l.slice(0, gutter).replace(/\s+$/, "")).join("\n");
  const right = lines.map((l) => l.slice(gutter + 1)).join("\n");
  return `${left}\n${right}`;
}

/**
 * Split a page into its vertical columns at wide near-blank gutters. Returns
 * one string per column, left to right. Handles 2- and 3-column grids; pages
 * with no clear gutter come back as a single segment.
 */
export function splitColumns(page: string): string[] {
  const lines = page.split("\n");
  const content = lines.filter((l) => l.trim().length > 0);
  if (content.length < 6) return [page];

  const width = Math.max(...lines.map((l) => l.length));
  const need = content.length * 0.9;
  const blank = (c: number) => content.filter((l) => c >= l.length || l[c] === " ").length >= need;

  // Cut at the midpoint of each blank band that is at least 3 columns wide.
  const cuts: number[] = [];
  let runStart = -1;
  for (let c = 0; c <= width; c++) {
    if (c < width && blank(c)) {
      if (runStart < 0) runStart = c;
    } else {
      if (runStart >= 0 && c - runStart >= 3) cuts.push(Math.floor((runStart + c) / 2));
      runStart = -1;
    }
  }
  if (cuts.length === 0) return [page];

  const bounds = [0, ...cuts, width + 1];
  const segments: string[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const seg = lines
      .map((l) => l.slice(bounds[i], bounds[i + 1]).replace(/\s+$/, ""))
      .join("\n")
      .trim();
    if (seg.length > 0) segments.push(seg);
  }
  return segments;
}

/**
 * Split a two-column *prose* page into [left, right] reading order, cutting each
 * line at the whitespace gap nearest the gutter. Layout-emulated body text packs
 * glyphs by measured advance, so a left line can overrun a fixed gutter and drag
 * the right column's words with it; a per-line cut separates them regardless. A
 * line with continuous ink across the gutter (a full-width heading) stays whole
 * on the left. Returns [page] when there is no clear central gutter.
 *
 * Prose only (no x-offset is read downstream); use splitTwoColumns for tables.
 */
export function splitProseColumns(page: string): string[] {
  const lines = page.split("\n");
  const content = lines.filter((l) => l.trim().length > 0);
  if (content.length < 6) return [page];

  const width = Math.max(...lines.map((l) => l.length));
  const lo = Math.floor(width * 0.35);
  const hi = Math.floor(width * 0.65);

  let gutter = -1;
  let mostBlank = 0;
  for (let c = lo; c <= hi; c++) {
    const blank = content.filter((l) => c >= l.length || l[c] === " ").length;
    if (blank > mostBlank) {
      mostBlank = blank;
      gutter = c;
    }
  }
  // A wider tolerance than splitTwoColumns: emulated left-column overruns lower
  // the blank count at the true gutter, but it is still blank on most lines.
  if (gutter < 0 || mostBlank < content.length * 0.6) return [page];

  const left: string[] = [];
  const right: string[] = [];
  for (const line of lines) {
    const [l, r] = cutAtGutter(line, gutter);
    left.push(l);
    right.push(r);
  }
  return [left.join("\n"), right.join("\n")];
}

/** Cut one line into [left, right] at the whitespace gap nearest the gutter. */
function cutAtGutter(line: string, gutter: number): [string, string] {
  if (line.slice(gutter).trim() === "") return [line.replace(/\s+$/, ""), ""];
  if (line.slice(0, gutter).trim() === "") return ["", line];

  let best: { start: number; end: number } | null = null;
  let bestDist = Infinity;
  for (const m of line.matchAll(/\s{2,}/g)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const dist =
      gutter >= start && gutter <= end
        ? 0
        : Math.min(Math.abs(gutter - start), Math.abs(gutter - end));
    if (dist < bestDist) {
      bestDist = dist;
      best = { start, end };
    }
  }
  // No gap near the gutter: text runs continuously across it (a full-width
  // heading), so keep the line whole on the left rather than cut mid-phrase.
  if (!best || bestDist > 20) return [line.replace(/\s+$/, ""), ""];
  return [line.slice(0, best.start), line.slice(best.end)];
}

const ink = (c: string | undefined) => c !== undefined && c !== " ";

/**
 * Split a page into exactly two columns at the single best central gutter.
 * Unlike splitColumns (which cuts at every blank band and can over-split a busy
 * page into three), this picks one gutter, so a creature's lines are never
 * chopped across segments. Returns [page] if there is no clear central gutter.
 *
 * `hard` slices every line at the gutter with no bridging exception — for a table
 * wholly on one side of the gutter, where emulated left-column text overruns onto
 * its rows (a soft split would drag them left, losing the table's header words).
 */
export function splitTwoColumns(page: string, hard = false): string[] {
  const lines = page.split("\n");
  const content = lines.filter((l) => l.trim().length > 0);
  if (content.length < 6) return [page];

  const width = Math.max(...lines.map((l) => l.length));
  const lo = Math.floor(width * 0.35);
  const hi = Math.floor(width * 0.65);

  let gutter = -1;
  let mostBlank = 0;
  for (let c = lo; c <= hi; c++) {
    const blank = content.filter((l) => c >= l.length || l[c] === " ").length;
    if (blank > mostBlank) {
      mostBlank = blank;
      gutter = c;
    }
  }
  if (gutter < 0 || mostBlank < content.length * 0.85) return [page];

  // A line whose text bridges the gutter spans both columns — a wide heading or
  // flavour subtitle, not a two-column row. Two-column rows have a blank gap here
  // (that is why the gutter was chosen). Bridging means a glyph sits on the
  // gutter, or on both sides of it (the gutter can land on an inter-word space).
  // Checking only the immediate neighbours avoids reaching into a tight adjacent
  // column. Such lines are kept whole in the left segment so they are not chopped.
  const spans = (l: string) =>
    !hard && (ink(l[gutter]) || (ink(l[gutter - 1]) && ink(l[gutter + 1])));
  const left = lines.map((l) => (spans(l) ? l : l.slice(0, gutter)).replace(/\s+$/, "")).join("\n");
  const right = lines.map((l) => (spans(l) ? "" : l.slice(gutter))).join("\n");
  return [left, right];
}
