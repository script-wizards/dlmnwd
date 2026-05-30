import { splitProseColumns } from "../pdf/columns.ts";

export interface Trait {
  name: string;
  text: string;
}

/** A structured piece of a trait body: a run-in "Label: body" sub-point, a
 *  bulleted/numbered `item`, a named `subhead`, an embedded creature `statblock`,
 *  or a `plain` continuation. */
export interface TraitSub {
  kind: "label" | "item" | "subhead" | "statblock" | "plain";
  label?: string;
  body: string;
}
export interface TraitStructure {
  lead: string;
  subs: TraitSub[];
}

/** A parsed embedded creature stat block: a type line and labelled stats. */
export interface StatBlock {
  typeLine: string;
  stats: { label: string; value: string }[];
}

function isStatBlock(seg: string): boolean {
  return /\bLevel \d+ AC \d+\b/.test(seg) && /\bSaves?\b/.test(seg) && /\bXP \d+/.test(seg);
}

/** Split a run-on creature stat block into its type line and labelled stats. */
const SIZE = "Tiny|Small|Medium|Large|Huge|Gargantuan";
// A stat block runs from its size word through "XP N".
const STAT_RUN = new RegExp(`(?:${SIZE})\\b.*?\\bLevel \\d+ AC \\d+ HP .*?\\bXP \\d+\\b`, "i");

// Small-caps type lines extract with mangled casing (e.g. "meDium conStruct").
function titleCaseWords(s: string): string {
  return s.replace(/[A-Za-z]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** Pull a creature stat block out of a segment, keeping the text before it and,
 *  where present, the creature's name (which sits just before the size word). */
export function extractStatBlock(
  seg: string,
): { before: string; name: string; statblock: string } | null {
  const m = STAT_RUN.exec(seg);
  if (!m) return null;
  const beforeAll = seg.slice(0, m.index).replace(/\s+$/, "");
  const nameMatch = beforeAll.match(
    /(?:^|[.:]\s+)([A-Z][A-Za-z’']+(?:\s+[A-Za-z][A-Za-z’']+){0,3})$/,
  );
  const name = nameMatch ? nameMatch[1].trim() : "";
  const before = name
    ? beforeAll.slice(0, beforeAll.length - name.length).replace(/\s+$/, "")
    : beforeAll;
  return { before, name, statblock: m[0] };
}

export function parseStatBlock(text: string): StatBlock | null {
  if (!isStatBlock(text)) return null;
  const split = text.match(/^(.*?)\s*(Level \d+ .*)$/);
  if (!split) return null;
  const rest = split[2];
  const grab = (re: RegExp): string => rest.match(re)?.[1]?.trim() ?? "";
  const stats = (
    [
      ["Level", grab(/Level (\d+)/)],
      ["AC", grab(/\bAC (\d+)/)],
      ["HP", grab(/\bHP (.+?)(?= Saves)/)],
      ["Saves", grab(/\bSaves? (.+?)(?= Att)/)],
      ["Att", grab(/\bAtt (.+?)(?= (?:Speed|Fly|Swim|Climb|Burrow|Morale)\b)/)],
      ["Speed", grab(/\b(?:Speed|Fly|Swim|Climb|Burrow) (\d+)/)],
      ["Morale", grab(/\bMorale (\d+)/)],
      ["XP", grab(/\bXP (\d+)/)],
    ] as const
  )
    .filter(([, value]) => value)
    .map(([label, value]) => ({ label, value }));
  return { typeLine: titleCaseWords(split[1].trim()), stats };
}

const RENDER_GLYPH = /^[▶►◆•·‣]\s*/;

// A named sub-ability heading with no colon: a parenthetical sub-form, or a
// bare Title-Case name.
const SUBFORM_PAREN = /\([^)]+\)\s*$/;
const BARE_HEADING = /^[A-Z][A-Za-z’'-]*(?:\s[A-Z][A-Za-z’'-]*){0,3}$/;
function isSubheading(seg: string): boolean {
  return (
    seg.length <= 34 && !seg.includes(":") && (SUBFORM_PAREN.test(seg) || BARE_HEADING.test(seg))
  );
}

/** Split a reflowed trait body (logical lines joined by "\n", see reflowBody)
 *  into its lead sentence and structured sub-points, so both the sheet and the
 *  markdown export render the same shape without re-deriving it. */
export function structureTrait(text: string): TraitStructure {
  const segments = text.split("\n");
  const lead = segments[0] ?? "";
  const subs: TraitSub[] = [];
  for (const raw of segments.slice(1)) {
    const item = RENDER_GLYPH.test(raw);
    const seg = item ? raw.replace(RENDER_GLYPH, "") : raw;
    if (!item && isSubheading(seg)) {
      subs.push({ kind: "subhead", body: seg });
      continue;
    }
    // A segment may end in an embedded creature stat block (a higher-level
    // summon). Split off the descriptive text and the creature name from it.
    const sb = item ? null : extractStatBlock(seg);
    if (sb) {
      if (sb.before) {
        const bm = sb.before.match(/^([A-Z0-9][^:]{0,28}):\s*(.*)$/);
        subs.push(
          bm ? { kind: "label", label: bm[1], body: bm[2] } : { kind: "plain", body: sb.before },
        );
      }
      if (sb.name) subs.push({ kind: "subhead", body: sb.name });
      subs.push({ kind: "statblock", body: sb.statblock });
      continue;
    }
    const m = seg.match(/^([A-Z0-9][^:]{0,28}):\s*(.*)$/);
    if (m) subs.push({ kind: item ? "item" : "label", label: m[1], body: m[2] });
    else subs.push({ kind: item ? "item" : "plain", body: seg });
  }
  return { lead, subs };
}

// A run-in heading: all-caps words with heading punctuation only.
const HEADER = /^[A-Z][A-Z’'&-]*(?: [A-Z’'&.-]+)*$/;

// All-caps section/table titles, not abilities. Generic structural words only, so
// no setting-specific names are hard-coded here.
const NOT_A_TRAIT =
  /\b(ADVANCEMENT|SPELLS|SKILL TARGETS|BACKGROUNDS|TRINKETS|NAMES|RELATIONS|EXTRA DETAILS|CHOOSING|RANK|TENETS|CLASS|KINDRED|EQUIPMENT|RESTRICTIONS|PER DAY)\b/;

// A body opening with a die notation is a roll table, not an ability description.
const DICE_TABLE = /^d(4|6|8|10|12|20|100)\b/;

// A short all-caps line: either a trait heading or a section/table title.
function looksLikeHeading(t: string): boolean {
  if (t.length < 3 || t.length > 34) return false;
  if (t.split(/\s+/).length > 4) return false;
  return HEADER.test(t);
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

// A body line that opens a new logical line: a run-in sub-label, a
// bulleted/numbered list item, a level-gated ability, or a sub-form heading.
const SUB_LABEL = /^[A-Z][A-Za-z'’-]*(?:\s[A-Za-z0-9'’-]+){0,2}:/;
const LEVEL_ABILITY = /^[A-Z][A-Za-z'’ -]*\(Level \d+\):/;
const GLYPH_ITEM = /^[▶►◆•·‣]\s/;
const NUMBERED_ITEM = /^\d+[.)]\s/;
const SUBFORM_HEADING = /^[A-Z][A-Za-z'’-]+(?:\s[A-Za-z'’-]+)*\s\([^)]+\)$/;
function startsBlock(line: string): boolean {
  const l = line.trim();
  if (!l) return false;
  if (GLYPH_ITEM.test(l) || NUMBERED_ITEM.test(l) || LEVEL_ABILITY.test(l)) return true;
  const colon = l.indexOf(":");
  if (colon > 0 && colon <= 28 && SUB_LABEL.test(l)) return true;
  return l.length <= 34 && SUBFORM_HEADING.test(l);
}

/** Reflow hard-wrapped body lines into logical lines: prose is joined (undoing
 *  end-of-line hyphenation), while sub-labels, list items, and named headings
 *  each start a fresh line. A bare Title-Case heading breaks only when it follows
 *  a completed sentence or a blank line — the pdf.js emulator drops paragraph
 *  blanks that pdftotext keeps, so we can't rely on the blank alone — while a
 *  mid-sentence capitalised phrase (which follows an unfinished line) doesn't. */
function reflowBody(raw: string[]): string {
  const out: string[] = [];
  let sawBlank = true; // treat the body start as if it followed a break
  for (const line of raw) {
    if (!line) {
      sawBlank = true;
      continue;
    }
    const prev = out[out.length - 1] ?? "";
    const afterSentence = sawBlank || out.length === 0 || /[.!?][’”"')]?$/.test(prev);
    const breakHere =
      out.length === 0 ||
      startsBlock(line) ||
      (afterSentence && isSubheading(line)) ||
      isSubheading(prev); // a heading never absorbs the line beneath it
    sawBlank = false;
    if (breakHere) {
      out.push(line);
    } else {
      out[out.length - 1] =
        prev.endsWith("-") && /^[a-z]/.test(line) ? prev.slice(0, -1) + line : `${prev} ${line}`;
    }
  }
  return out.join("\n");
}

/**
 * Pull the named abilities from a class or kindred section spanning pages
 * [from, to). In the book these are run-in ALL-CAPS headings in two-column prose,
 * each followed by its description. We read each column top to bottom: an all-caps
 * line opens a trait and the lines beneath are its body, until the next heading.
 * Trait state resets at each column, so nothing bleeds between columns (an open
 * trait does not carry across the boundary). Section/table titles and roll tables
 * are rejected. Best-effort: a long ability that flows into the next column, or a
 * heading the column split scatters, may be truncated or missed — but the reset
 * keeps unrelated prose, running headers, and tables from merging in, and nothing
 * is fabricated.
 */
export function extractTraits(pages: string[], from: number, to: number): Trait[] {
  const traits: Trait[] = [];
  const seen = new Set<string>();
  for (let p = Math.max(0, from); p < to && p < pages.length; p++) {
    for (const col of splitProseColumns(pages[p])) {
      let name: string | null = null;
      let lines: string[] = [];
      const flush = () => {
        if (name !== null) {
          // Reflow the body, then drop a trailing page-number footer the column
          // scan swept in.
          const text = reflowBody(lines)
            .replace(/\s+\d{1,3}$/, "")
            .trim();
          if (text && !DICE_TABLE.test(text) && !seen.has(name)) {
            seen.add(name);
            traits.push({ name, text });
          }
        }
        name = null;
        lines = [];
      };
      for (const raw of col.split("\n")) {
        const t = raw.replace(/­/g, "").trim(); // drop soft hyphens
        if (looksLikeHeading(t)) {
          // Any heading closes the current trait; a section/table title just ends
          // the run, so its prose never bleeds into the previous trait.
          flush();
          if (!NOT_A_TRAIT.test(t)) name = titleCase(t);
        } else if (name !== null) {
          // Keep blank lines (as "") — reflowBody uses them to spot sub-headings.
          // Collapse the emulator's wide inter-glyph gaps to single spaces.
          lines.push(t.replace(/\s{2,}/g, " "));
        }
      }
      flush();
    }
  }
  return traits;
}
