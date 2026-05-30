import { reflowColumns } from "../pdf/columns.ts";
import type { Spell } from "../schema.ts";

const RANK_HEADER = /Rank\s+(\d+)\s+(Arcane|Holy)\s+Spells/i;

// A trailing flavour story box follows each Holy spell; its text is excluded.
const FLAVOR_STORY = /^\s*The miracle of\b/i;
// A bare folio number or a running-header fragment left in a column by the reflow.
const isFurniture = (line: string) => /^\d{1,3}$/.test(line.trim()) || line.includes("|");

// Minor words stay lowercase in a title unless they lead it.
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

/** Title-case an all-caps heading. */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) =>
      i > 0 && MINOR_WORDS.has(w)
        ? w
        : w.replace(/(^|-)([a-z])/g, (_, pre, c) => pre + c.toUpperCase()),
    )
    .join(" ");
}

// A spell name is a short all-caps line (letters, spaces, apostrophes, hyphens,
// and the slash in dual spells like "IGNITE / EXTINGUISH").
function asHeader(line: string): string | null {
  const t = line.trim();
  if (t.length < 3 || t.length > 40) return null;
  if (!/^[A-Z][A-Z '’/-]+$/.test(t)) return null;
  if (/^(PART|RANK)\b/.test(t)) return null;
  return t;
}

/** A header is a spell entry only if a `Duration:` line follows within a few lines. */
function isSpellHeader(lines: string[], i: number): string | null {
  const name = asHeader(lines[i]);
  if (!name) return null;
  return /Duration:/.test(lines.slice(i + 1, i + 5).join("\n")) ? name : null;
}

/**
 * If line i starts a spell entry, return its Title-Case name and the line where
 * the body begins. A name can wrap onto a second all-caps line before the
 * Duration line; the fragments merge into one name (not a bodiless phantom).
 */
function spellHeaderAt(lines: string[], i: number): { name: string; bodyStart: number } | null {
  const first = asHeader(lines[i]);
  if (!first) return null;
  const parts = [first];
  let j = i + 1;
  while (j < lines.length && asHeader(lines[j]) && !/Duration:/.test(lines[j])) {
    parts.push(asHeader(lines[j]) as string);
    j++;
  }
  if (!/Duration:/.test(lines.slice(j, j + 4).join("\n"))) return null;
  return { name: titleCase(parts.join(" ")), bodyStart: j };
}

/**
 * Parse every spell entry out of the extracted pages. Rank and tradition are
 * carried from the most recent "Rank N <Arcane|Holy> Spells" heading. This is
 * the build-time transform; queries hit the database, not this.
 */
export function parseSpells(pages: string[]): Spell[] {
  const spells: Spell[] = [];
  let rank: number | undefined;
  let tradition: Spell["tradition"];

  for (let p = 0; p < pages.length; p++) {
    const lines = reflowColumns(pages[p]).split("\n");
    for (let i = 0; i < lines.length; i++) {
      const rh = lines[i].match(RANK_HEADER);
      if (rh) {
        rank = parseInt(rh[1], 10);
        tradition = rh[2] as Spell["tradition"];
        continue;
      }
      const hdr = spellHeaderAt(lines, i);
      if (hdr) {
        spells.push(collect(lines, hdr.bodyStart, hdr.name, rank, tradition, p + 1));
        i = hdr.bodyStart - 1; // skip the (possibly wrapped) name lines
      }
    }
  }
  return spells;
}

function collect(
  lines: string[],
  bodyStart: number,
  name: string,
  rank: number | undefined,
  tradition: Spell["tradition"],
  page: number,
): Spell {
  const body: string[] = [];
  let prayerName: string | undefined;
  let duration: string | undefined;
  let range: string | undefined;

  for (let j = bodyStart; j < lines.length; j++) {
    if (RANK_HEADER.test(lines[j]) || isSpellHeader(lines, j) || FLAVOR_STORY.test(lines[j])) break;
    const pm = lines[j].match(/^\s*Prayer name:\s*(.+?)\s*$/);
    const dm = lines[j].match(/^\s*Duration:\s*(.+?)\s*$/);
    const rm = lines[j].match(/^\s*Range:\s*(.+?)\s*$/);
    if (pm) {
      prayerName = pm[1];
    } else if (dm) {
      duration = dm[1];
    } else if (rm) {
      range = rm[1];
    } else if (!isFurniture(lines[j])) {
      body.push(lines[j]);
    }
  }

  return {
    name,
    tradition,
    rank,
    prayerName,
    duration,
    range,
    body: reflowBody(body),
    source: { book: "players", page },
  };
}

/** A body line that begins a new logical line rather than continuing the last. */
function startsBlock(l: string): boolean {
  if (/^\d+\.\s/.test(l)) return true; // "1." numbered list item
  if (/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b.*—.*—/.test(l)) return true; // stat-block type line
  if (/^(Level \d+ AC \d+|Att |Saves )/.test(l)) return true; // stat-block stat line
  const colon = l.indexOf(":");
  return colon > 0 && colon <= 25 && /^[A-Z][A-Za-z’'-]*(?:\s[A-Za-z’'-]+){0,2}:/.test(l); // "Label:"
}

/**
 * Rejoin a spell body into clean logical lines. The PDF hard-wraps prose (with
 * end-of-line hyphenation) and the column reflow injects stray blank lines
 * mid-paragraph; both are undone here. A new logical line starts only at real
 * structure (list item, "Label:" entry, embedded stat block) or a blank line
 * that follows a completed sentence — so a blank splitting a sentence is healed.
 */
function reflowBody(raw: string[]): string {
  const out: string[] = [];
  let sawBlank = true; // treat the start as if it followed a break
  for (const r of raw) {
    const line = r.trim();
    if (!line) {
      sawBlank = true;
      continue;
    }
    const prev = out[out.length - 1] ?? "";
    const breakHere =
      out.length === 0 || startsBlock(line) || (sawBlank && /[.!?:]["’”]?$/.test(prev));
    sawBlank = false;
    if (breakHere) {
      out.push(line);
    } else {
      // De-hyphenate a soft word-break; otherwise join with a space.
      out[out.length - 1] = /[A-Za-z]-$/.test(prev) ? prev.slice(0, -1) + line : `${prev} ${line}`;
    }
  }
  return out.join("\n");
}
