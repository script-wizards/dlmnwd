import type { Bookmark } from "../pdf/outline.ts";
import type { Hex } from "../schema.ts";

// Hex entry headers alternate layout on facing pages: the 4-digit key is on the
// left on one page and on the right on the other. Match both, plus a soft hyphen
// (U+00AD) that can appear in the caps name.
// Caps name, allowing ligatures (Œœ), curly quotes, and other header punctuation.
const NAME = "[A-Z][A-Z0-9 '’“”,.&()/Œœ­-]+?";
// The key can sit on either side of the name, separated by one or more spaces;
// over-matches are harmless because the bookmark merge keeps only real hexes.
const NUM_LEFT = new RegExp(`^\\s{0,6}(\\d{4})\\s+(${NAME})\\s*$`);
const NUM_RIGHT = new RegExp(`^\\s*(${NAME})\\s+(\\d{4})\\s*$`);

/**
 * Parse hex entries from the Campaign Book gazetteer. Each starts with a
 * "NNNN  HEX NAME" header, an atmospheric one-liner, then Terrain / Lost-
 * encounters / Foraging metadata. The deep keyed-location detail that follows
 * is left in the book; this captures the travel-time summary.
 */
export function parseHexes(pages: string[]): Hex[] {
  const out: Hex[] = [];
  for (let p = 0; p < pages.length; p++) {
    const lines = pages[p].split("\n");
    for (let i = 0; i < lines.length; i++) {
      const left = lines[i].match(NUM_LEFT);
      const right = lines[i].match(NUM_RIGHT);
      const id = left?.[1] ?? right?.[2];
      const rawName = left?.[2] ?? right?.[1];
      if (!id || !rawName) continue;

      const window = lines.slice(i + 1, i + 20);
      // Confirm it is a real hex entry, not a stray number, by the Terrain field.
      if (!window.some((l) => /^\s*Terrain:/.test(l))) continue;

      out.push({
        id,
        name: titleCase(rawName.replace(/­/g, "").trim()),
        page: p + 1,
        entry: blurb(window),
        terrain: field(window, /^\s*Terrain:\s*(.+)/),
        lostEncounters: multiField(window, /^\s*Lost\/encounters:\s*/),
        foraging: multiField(window, /^\s*Foraging:\s*/),
      });
    }
  }
  return out;
}

/**
 * Drive the hex list off the bookmarks (the authoritative set of all hexes,
 * with clean names), overlaying text-parsed terrain/blurb/encounters by id. This
 * guarantees every bookmarked hex resolves, including settlements detailed in a
 * non-standard format (e.g. Sample Keep). Falls back to the text parse
 * when bookmarks are unavailable.
 */
export function withBookmarks(bookmarks: Bookmark[], parsed: Hex[], pages: string[] = []): Hex[] {
  if (bookmarks.length === 0) return parsed;
  const byId = new Map(parsed.map((h) => [h.id, h]));
  return bookmarks.map((b) => {
    const t = byId.get(b.id);
    return {
      id: b.id,
      name: b.name,
      // Text page if parsed; otherwise the page that references "(Hex NNNN)"
      // (settlements detailed elsewhere), so --open still lands somewhere useful.
      page: t?.page ?? referencePage(pages, b.id),
      terrain: t?.terrain,
      lostEncounters: t?.lostEncounters,
      foraging: t?.foraging,
      entry: t?.entry ?? "",
    };
  });
}

function referencePage(pages: string[], id: string): number | undefined {
  // The settlement entry header ends with "(Hex NNNN)" (capital Hex, line end),
  // distinct from lowercase "(hex NNNN)" prose cross-references.
  const header = new RegExp(`\\(Hex ${id}\\)\\s*$`, "m");
  const idx = pages.findIndex((p) => header.test(p));
  return idx >= 0 ? idx + 1 : undefined;
}

/** The first prose line after the header (the atmospheric one-liner). */
function blurb(window: string[]): string {
  for (const l of window) {
    const t = l.trim();
    if (t === "") continue;
    if (/^[A-Z][A-Za-z/]+:/.test(t)) break; // hit the metadata fields
    return t;
  }
  return "";
}

function field(window: string[], re: RegExp): string | undefined {
  const hit = window.find((l) => re.test(l));
  return hit ? hit.match(re)![1].trim() : undefined;
}

/** A labelled field whose value wraps over several lines, up to the next field. */
function multiField(window: string[], label: RegExp): string | undefined {
  const i = window.findIndex((l) => label.test(l));
  if (i < 0) return undefined;
  let value = window[i].replace(label, "").trim();
  for (let j = i + 1; j < window.length; j++) {
    const t = window[j].trim();
    if (t === "" || /^[A-Z][A-Za-z/ ]*:/.test(t)) break; // blank or next field label
    value += ` ${t}`;
  }
  return value.replace(/(\p{L})- (\p{L})/gu, "$1$2").trim();
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[ ([])([a-z])/g, (_, pre, c) => pre + c.toUpperCase()) // word-initial only
    .replace(/\b(Of|The|And|In|On)\b/g, (w) => w.toLowerCase())
    .replace(/^([a-z])/, (c) => c.toUpperCase());
}
