import { splitTwoColumns } from "../pdf/columns.ts";
import type { Monster } from "../schema.ts";

// A stray char or two can bleed past the gutter from the left column into the
// start of a right-column line (e.g. "e   Level 7 …"), so allow a short leading
// fragment before the stat block; the rest of the pattern is specific enough
// that this stays unambiguous.
const STAT =
  /^\s*(?:\S{1,3}\s+)?Level (\d+) AC (\d+) HP (.+?) Saves (D\d+ R\d+ H\d+ B\d+ S\d+)\s*$/;

/**
 * Parse Monster Book stat blocks. Main bestiary entries are one per page and
 * parsed whole; the compact appendix (small animals, two columns, abbreviated
 * "Att"/"Enc") is column-split first so each creature's lines stay contiguous.
 */
export function parseMonsters(pages: string[]): Monster[] {
  const out: Monster[] = [];
  const seen = new Set<string>();
  for (let p = 0; p < pages.length; p++) {
    const compact = /^\s*Att(?!acks)\b/m.test(pages[p]);
    const chunks = compact ? splitTwoColumns(pages[p]) : [pages[p]];
    for (const chunk of chunks) collect(chunk.split("\n"), out, seen, p + 1);
  }
  linkSubBlocks(out);
  return out;
}

/**
 * Demote secondary stat blocks. A creature with no flavour subtitle that sits
 * below an already-described entry on the same page (a mount, spawn, or variant)
 * is tagged with its parent, so the browse list and count skip it while it stays
 * directly queryable. A lone block on its own page is left as a top-level entry.
 */
function linkSubBlocks(monsters: Monster[]): void {
  let lastDescribed: Monster | undefined;
  let lastPage = -1;
  for (const m of monsters) {
    if (m.page !== lastPage) {
      lastDescribed = undefined;
      lastPage = m.page ?? -1;
    }
    if (m.description) lastDescribed = m;
    else if (lastDescribed) m.parent = lastDescribed.name;
  }
}

function collect(lines: string[], out: Monster[], seen: Set<string>, page: number): void {
  for (let i = 0; i < lines.length; i++) {
    const stat = lines[i].match(STAT);
    if (!stat) continue;

    const typeIdx = prevNonBlank(lines, i - 1);
    const typeLine = typeIdx >= 0 ? lines[typeIdx].trim() : "";
    if (typeLine.startsWith("Size/Type By Kindred")) continue; // NPC class block
    if (!typeLine.includes("—")) continue; // not a valid "Size Type—Intel—Align" line

    const nameIdx = findName(lines, typeIdx);
    if (nameIdx < 0) continue;
    const rawName = lines[nameIdx].trim();
    const name = isAllCaps(rawName) ? titleCase(rawName) : rawName;
    const id = slug(name);
    if (seen.has(id)) continue;

    const [category, intelligence, alignment] = splitType(typeLine);
    const description = grabDescription(lines, nameIdx, typeIdx);
    const end = nextStatOrEnd(lines, i + 1);
    const blob = lines.slice(i + 1, end).join(" ");

    seen.add(id);
    out.push({
      id,
      name,
      description,
      page,
      level: parseInt(stat[1], 10),
      category,
      intelligence,
      alignment,
      ac: parseInt(stat[2], 10),
      hd: stat[3].trim(),
      saves: stat[4],
      // Abbreviations (Att/Spd/Enc) and line-split fields both fall out of the blob.
      attacks: rx(blob, /\bAtt(?:acks)?\s+(.+?)\s+(?:Speed|Spd)\b/),
      movement: rx(blob, /\b(?:Speed|Spd)\s+(.+?)\s+Morale\b/),
      morale: int(rx(blob, /\bMorale\s+(\d+)/)),
      xp: int(rx(blob, /\bXP\s+([\d,]+)/)),
      // Bound to the dice value (plus optional "(NN% in lair)") so it cannot run
      // on into the special abilities or the next entry in a packed column.
      numberAppearing: rx(blob, /\bEnc(?:ounters)?\s+(\d+(?:d\d+)?(?:\s*\([^)]*\))?)/),
      treasure: hoard(lines, i + 1, end),
      special: grabSpecial(lines, i + 1, end),
    });
  }
}

function prevNonBlank(lines: string[], from: number): number {
  let i = from;
  while (i >= 0 && lines[i].trim() === "") i--;
  return i;
}

/**
 * The name is the nearest caps heading or strongly-indented title above the
 * type line. Returns its line index (so the flavour prose between it and the
 * type line can be grabbed), or -1 if none is found.
 */
function findName(lines: string[], typeIdx: number): number {
  let nearest = true; // first non-blank line above the type line
  for (let k = typeIdx - 1; k >= 0 && k > typeIdx - 15; k--) {
    const raw = lines[k];
    if (raw.trim() === "") continue;
    const text = raw.trim();
    if (text.includes("|")) {
      nearest = false;
      continue; // running page header
    }
    const indent = raw.length - raw.trimStart().length;
    const capsHeading = isAllCaps(text) && /^[A-Z][A-Z0-9 ,'’()­-]+$/.test(text);
    const centred = indent >= 10 && /^[A-Z][A-Za-z'’,() —-]+$/.test(text) && text.length <= 40;
    // A short, every-word-capitalised heading directly above the stat block.
    // The all-words-capitalised test keeps it from matching wrapped flavour
    // prose, whose last line is a sentence.
    const titleHeading =
      nearest &&
      text.length <= 25 &&
      !text.endsWith(".") &&
      /^[A-Z][A-Za-z’']+(?: [A-Z][A-Za-z’']+){0,3}$/.test(text);
    if (capsHeading || centred || titleHeading) return k;
    nearest = false;
  }
  return -1;
}

/**
 * The flavour subtitle: the prose between the name heading and the type line.
 * Blank lines and stray page furniture are dropped; the rest joins into one blurb.
 */
function grabDescription(lines: string[], nameIdx: number, typeIdx: number): string | undefined {
  const text = lines
    .slice(nameIdx + 1, typeIdx)
    .map((l) => l.trim())
    .filter((l) => l && !l.includes("|"))
    .join(" ")
    .trim();
  return text || undefined;
}

function isAllCaps(s: string): boolean {
  return !/[a-z]/.test(s) && /[A-Z]/.test(s);
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[ ,(])([a-z])/g, (_, pre, c) => pre + c.toUpperCase());
}

function splitType(typeLine: string): [string, string, string] {
  const parts = typeLine.split("—").map((s) => s.trim());
  if (parts.length < 3) return [typeLine, "", ""];
  // Start the category at the size keyword, dropping any text bled in from an
  // adjacent column.
  const category = parts[0].replace(/^.*?\b(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/, "$1");
  return [category, parts[1], parts[parts.length - 1]];
}

function nextStatOrEnd(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    if (STAT.test(lines[i])) return prevNonBlank(lines, i - 1);
  }
  return lines.length;
}

function rx(s: string, re: RegExp): string | undefined {
  const m = s.match(re);
  return m ? m[1].trim() : undefined;
}

function int(s: string | undefined): number | undefined {
  return s ? parseInt(s.replace(/,/g, ""), 10) : undefined;
}

/**
 * The Hoard stat value. It usually sits mid-line after another field (after
 * Possessions), so match it anywhere, stopping at the gap where a right-hand
 * sidebar can bleed in. The colon form ("Hoard:") is the appendix detail
 * paragraph, not the stat, and is skipped by the \s+.
 */
function hoard(lines: string[], from: number, end: number): string | undefined {
  for (const l of lines.slice(from, end)) {
    const m = l.match(/\bHoard\s+(.+?)(?:\s{2,}|\s*$)/);
    if (m) return m[1].trim();
  }
  return undefined;
}

/**
 * Column at which the right-hand sidebar begins (clip the abilities to its
 * left), or -1 if the region is a single column. Scans the central band for
 * columns blank on nearly every line and takes the widest such band — the true
 * gutter, not a narrow blank inside the sidebar's own table (e.g. between a d6
 * row's number and its text). Returns the band's right edge so the longest
 * ability line, which can poke into the gutter, is kept whole.
 */
function columnGutter(lines: string[], from: number, end: number): number {
  const region = lines.slice(from, end);
  const content = region.filter((l) => l.trim() !== "");
  const width = Math.max(0, ...region.map((l) => l.length));
  if (content.length < 4 || width < 40) return -1;
  const lo = Math.floor(width * 0.3);
  const hi = Math.floor(width * 0.7);
  const need = content.length * 0.85;
  const blank = (c: number) => content.filter((l) => c >= l.length || l[c] === " ").length >= need;

  let best = -1;
  let bestLen = 0;
  let runStart = -1;
  for (let c = lo; c <= hi + 1; c++) {
    if (c <= hi && blank(c)) {
      if (runStart < 0) runStart = c;
    } else {
      if (runStart >= 0 && c - runStart > bestLen) {
        bestLen = c - runStart;
        best = runStart;
      }
      runStart = -1;
    }
  }
  return bestLen >= 3 ? best + bestLen : -1;
}

// A labelled ability reads "Keyword: description …" — a short keyword, or a
// comma-separated list of trait keywords. A long comma-less run is prose, not a
// label, so it stays part of the previous ability rather than starting a new one.
const SPECIAL_LABEL = /^[A-Z][\w'’ ()-]{0,30}?:\s|^[A-Z][\w'’ ()-]*(?:,\s*[\w'’ ()-]+)+:\s/;
// A neighbouring entry's type line ("Size Type—Intel—Alignment") can bleed into
// an ability across the gutter on a packed two-column page; strip the fragment.
const BLED_TYPE_LINE =
  /\s{2,}(?:Tiny|Small|Medium|Large|Huge|Gargantuan)\b[^—]*—[^—]+—(?:Lawful|Neutral|Chaotic|Any(?: Alignment)?)/g;

// Treasure, naming pointers, and the prose sidebars are not special abilities.
const NON_SPECIAL_LABEL =
  /^(Hoard|Encounters?|Behaviou?r|Speech|Possessions|Lair|Treasure|Names)\b/i;

/**
 * Collect a creature's labelled special abilities ("Keyword: text"). Stops at
 * the next entry heading or prose sidebar (an all-caps line), and skips
 * treasure/behaviour paragraphs and the stat-block continuation lines, which
 * carry no leading label.
 *
 * In the main bestiary the abilities sit in a left column beside a sidebar (a
 * TRAITS d6 table, ENCOUNTERS/LAIRS, etc.); pdftotext interleaves the two, so
 * each line is clipped to the left of the region's column gutter. Right-column
 * table rows collapse to blank and drop out, while an indented sidebar header
 * (ENCOUNTERS, LAIRS) lands in the left column and ends the abilities. A
 * single-column entry has no gutter and is read whole.
 */
function grabSpecial(lines: string[], from: number, end: number): string[] | undefined {
  const para: string[] = [];
  let current = "";
  let capturing = false;
  const gutter = columnGutter(lines, from, end);
  const flush = () => {
    if (current) {
      const text = current
        .replace(BLED_TYPE_LINE, " ")
        .replace(/(\p{L})- (\p{L})/gu, "$1$2")
        .replace(/\s{2,}/g, " ")
        .trim();
      para.push(text);
    }
    current = "";
  };
  for (let i = from; i < end; i++) {
    const raw = lines[i];
    // Clip to the left column only when the gutter band is actually present on
    // this line (≥2 blank columns before the sidebar). A wide single-column
    // line whose prose crosses the gutter is kept whole.
    const onGutter = gutter > 1 && raw[gutter - 1] === " " && raw[gutter - 2] === " ";
    // Drop a trailing sidebar table-row number that a slightly wide gutter band
    // can leave behind (e.g. "… if bottled.        1").
    const text = (onGutter ? raw.slice(0, gutter) : raw).replace(/\s{2,}\d{1,3}\s*$/, "").trim();
    if (text === "") continue;
    // A line that is just a number, or a number followed by a wide gap, is a
    // page folio or a stray sidebar table row — never the start of an ability.
    if (/^\d{1,3}(?:\s{2,}|$)/.test(text)) continue;
    // End the abilities at a sidebar header (all-caps) or a bold sub-heading (a
    // short, every-word-capitalised line with no trailing punctuation).
    if (text.length >= 3 && isAllCaps(text) && /^[A-Z][A-Z0-9 ,'’()­.&—-]+$/.test(text)) break;
    if (capturing && /^[A-Z][A-Za-z’']+(?: [A-Z][A-Za-z’']+){0,3}$/.test(text)) break;
    if (SPECIAL_LABEL.test(text)) {
      flush();
      capturing = !NON_SPECIAL_LABEL.test(text); // skip the labelled non-ability and its body
      if (capturing) current = text;
      continue;
    }
    if (capturing) current = `${current} ${text}`;
  }
  flush();
  return para.length > 0 ? para : undefined;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
