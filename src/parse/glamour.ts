// Parse the d20 glamours table and the glamour descriptions from the Player's
// Book. The d20 table sits in the enchanter/kindred creation pages; the
// descriptions live in the Fairy Magic chapter (a two-column "Glamours" spread)
// with the same shape as spell entries: an ALL-CAPS heading, Duration/Range
// lines, then body prose. Pure (no Node APIs) so it runs unchanged in the
// browser build.

import { reflowColumns } from "../pdf/columns.ts";

export interface GlamourEntry {
  name: string;
  duration: string | null;
  range: string | null;
  body: string | null;
}

/**
 * Parse the glamour names out of the d20 table. Empty slots are dropped, so the
 * result is the list of parsed names (not a fixed 20-entry, roll-indexed array);
 * callers only pick from it at random. Returns [] if the table isn't found.
 */
export function parseGlamoursTable(pages: string[]): string[] {
  for (const page of pages) {
    const lines = page.split("\n");
    // The table header has "Glamour" appearing 3 times in a "# Glamour" pattern.
    const headerIdx = lines.findIndex(
      (l) => (l.match(/Glamour/gi) ?? []).length >= 3 && /#/.test(l),
    );
    if (headerIdx < 0) continue;

    const items: string[] = Array.from({ length: 20 }, () => "");
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") break;

      // Entries: "1   Awe   8   Fairy Dust   15   Seeming"
      // Split on 2+ spaces, then walk pairs of (number, name).
      const parts = line.split(/\s{2,}/);
      for (let j = 0; j < parts.length; j += 1) {
        const m = parts[j].match(/^(\d{1,2})$/);
        if (m && j + 1 < parts.length) {
          const n = parseInt(m[1], 10);
          if (n >= 1 && n <= 20 && items[n - 1] === "") {
            items[n - 1] = parts[j + 1].trim();
            j++; // consume the name
          }
        }
      }
    }
    if (items.filter(Boolean).length >= 10) return items.filter((s) => s.length > 0);
  }
  return [];
}

const MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && MINOR_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** A glamour heading is a short ALL-CAPS line (letters, spaces, apostrophes). */
function asGlamourHeading(line: string): string | null {
  const t = line.trim();
  if (t.length < 3 || t.length > 30) return null;
  if (!/^[A-Z][A-Z '’-]+$/.test(t)) return null;
  return t;
}

/**
 * Parse glamour descriptions: each is an ALL-CAPS heading followed by Duration:
 * and Range: lines, then body prose, two-column like spell entries (so pages are
 * reflowed the same way). Only entries named in the glamour table are kept, which
 * bounds the scan to real glamours without matching on chapter prose. Returns a
 * map of lowercased name → details. Pass the already-parsed glamour table to
 * avoid re-parsing it.
 */
export function parseGlamourDetails(
  pages: string[],
  glamoursTable?: string[],
): Map<string, GlamourEntry> {
  const glamours = new Map<string, GlamourEntry>();
  const tableNames = new Set(
    (glamoursTable ?? parseGlamoursTable(pages)).map((n) => n.toLowerCase()),
  );

  for (const page of pages) {
    const reflowed = reflowColumns(page);
    const lines = reflowed.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const heading = asGlamourHeading(lines[i]);
      if (!heading) continue;
      // A heading is a glamour only if a Duration: line follows within a few.
      if (!/Duration:/.test(lines.slice(i + 1, i + 5).join("\n"))) continue;

      const name = titleCase(heading);
      if (!tableNames.has(name.toLowerCase())) continue; // real glamours only
      if (glamours.has(name.toLowerCase())) continue; // keep the first (full) entry

      let duration: string | null = null;
      let range: string | null = null;
      const body: string[] = [];

      for (let j = i + 1; j < lines.length; j++) {
        const next = asGlamourHeading(lines[j]);
        if (next && /Duration:/.test(lines.slice(j + 1, j + 5).join("\n"))) break; // next glamour
        const t = lines[j].trim();
        const dm = t.match(/^Duration:\s*(.+?)\s*$/);
        const rm = t.match(/^Range:\s*(.+?)\s*$/);
        if (dm) duration = dm[1];
        else if (rm) range = rm[1];
        else if (t && !/^\d{1,3}$/.test(t)) body.push(t);
      }

      glamours.set(name.toLowerCase(), {
        name,
        duration,
        range,
        body: body.length > 0 ? reflowBody(body) : null,
      });
    }
  }
  return glamours;
}

/** A body line that begins a new logical line rather than continuing the last.
 *  Mirrors the spell-body heuristic: numbered items and short "Label:" entries
 *  start fresh, everything else flows into the running line. */
function startsBlock(l: string): boolean {
  if (/^\d+\.\s/.test(l)) return true;
  const colon = l.indexOf(":");
  return colon > 0 && colon <= 25 && /^[A-Z][A-Za-z’'-]*(?:\s[A-Za-z’'-]+){0,2}:/.test(l);
}

/** Rejoin hard-wrapped glamour prose into clean logical lines, undoing the PDF's
 *  end-of-line hyphenation. Same shape as the spell-body reflow. */
function reflowBody(raw: string[]): string {
  const out: string[] = [];
  for (const line of raw) {
    const prev = out[out.length - 1] ?? "";
    if (out.length === 0 || startsBlock(line)) {
      out.push(line);
    } else {
      out[out.length - 1] = /[A-Za-z]-$/.test(prev) ? prev.slice(0, -1) + line : `${prev} ${line}`;
    }
  }
  return out.join("\n");
}
