import { splitTwoColumns } from "../pdf/columns.ts";
import { extractTraits, type Trait } from "./traits.ts";

export interface ParsedKindred {
  id: string;
  name: string;
  /** Kindred category from the book's "Kindred Type" line (Mortal, Fairy, etc.). */
  kindredType: string;
  nativeLanguages: string[];
  /** Column labels of the names table, e.g. ["First Name", "Surname"]. */
  nameColumns: string[];
  /** One row per name entry, cells aligned to nameColumns. */
  nameRows: string[][];
  /** Persona tables: field (lowercased) -> rollable options. */
  persona: Record<string, string[]>;
  /** Named kindred abilities (empty if none parsed). */
  traits: Trait[];
  /** Trinket table entries for this kindred (empty if none parsed). */
  trinkets: string[];
  /** Background table entries for this kindred (empty if none parsed). */
  backgrounds: string[];
  /** Un-rolled physical stat expressions from the kindred stat block. */
  physical?: KindredPhysical;
  /** Armour-name swaps stated in the kindred's rules (e.g. rolled metal armour
   *  replaced with a small-folk equivalent), keyed by the metal armour word. */
  armourSwaps?: Record<string, string>;
  magicResistance?: number;
  furArmourBonus?: number;
}

/** Raw (un-rolled) physical stat expressions from the kindred stat block. */
export interface KindredPhysical {
  age: string | null;
  lifespan: string | null;
  height: string | null;
  weight: string | null;
}

/**
 * A kindred and its generation mechanics. Usually discovered from the book
 * itself via {@link discoverKindreds}, but {@link parseKindreds} also accepts
 * these as explicit input so tests can supply controlled fixtures. Either way,
 * no setting-specific names live in the code.
 */
export interface KindredRule {
  id: string;
  name: string;
  /** Kindred category from the book's "Kindred Type" line (Mortal, Fairy, etc.). */
  kindredType: string;
  magicResistance?: number;
  furArmourBonus?: number;
}

/**
 * Derive the kindred list and mechanics straight from the book, so an online
 * "drop your PDF and go" flow needs no hand-authored config. Each kindred has a
 * stat block opening with a "Kindred Type" line; those lines bound the sections.
 * Within a section we read the kindred's name from its "X NAMES" header and pick
 * up the two generation-relevant bonuses where the prose states them: magic
 * resistance ("+N Magic Resistance") and natural armour ("…fur grants … +N AC").
 *
 * Names and prime abilities (see parseClasses) are exact. The two bonuses are
 * best-effort: they live in flowing two-column prose whose reading order can
 * scatter the number away from the stat it modifies, so a value may be missed
 * (never invented). A UI should let the player confirm the discovered numbers.
 */
export function discoverKindreds(pages: string[]): KindredRule[] {
  const starts = pages.map((p, i) => (/Kindred Type/.test(p) ? i : -1)).filter((i) => i >= 0);
  const rules: KindredRule[] = [];
  for (let s = 0; s < starts.length; s++) {
    // Bound the section by the next kindred. The last has no successor, so mirror
    // the previous section's span rather than run to the end of the book (which
    // would sweep in appendix references to other kindreds' traits).
    const span = starts.length > 1 ? starts[starts.length - 1] - starts[starts.length - 2] : 4;
    const to = s + 1 < starts.length ? starts[s + 1] : Math.min(pages.length, starts[s] + span);
    // Read the section both page-flat and column-by-column: the two-column reflow
    // order differs by renderer, so a sentence the splitter scatters in one view
    // can stay contiguous in the other. Trying both maximises recall.
    const sectionPages = pages.slice(starts[s], to);
    const flat = sectionPages.join("\n");
    const cols = sectionPages.flatMap(splitTwoColumns).join("\n");
    const header = flat.match(/\b([A-Z][A-Z’'-]+) NAMES\b/);
    if (!header) continue;
    const name = header[1].charAt(0) + header[1].slice(1).toLowerCase();

    // Magic resistance: "They gain +2 [… wrapped/interleaved …] Magic Resistance
    // (see …)". The bonus precedes the named stat; allow a bounded run between
    // them so a column the splitter failed to separate still resolves. Natural
    // armour ("…hide grants them +1 AC" and the like) is one sentence, so keep it
    // on a single line to avoid matching unrelated AC bonuses in the column.
    const mrRe = /\+(\d+)[\s\S]{0,120}?Magic Resistance \(see/;
    const furRe = /(?:fur|hide|scales|carapace)[^.\n]{0,40}?\+(\d+)\s*AC\b/i;
    const mr = flat.match(mrRe) ?? cols.match(mrRe);
    const fur = flat.match(furRe) ?? cols.match(furRe);
    // The kindred type sits on the "Kindred Type" stat line; capture the full
    // token including hyphens (e.g. "Demi-fey").
    const typeMatch = flat.match(/Kindred Type\s+(?:Level 1 PC Age\s+)?([\w'-]+)/);
    const kindredType = typeMatch ? typeMatch[1].trim() : "Mortal";
    rules.push({
      id: name.toLowerCase(),
      name,
      kindredType,
      ...(mr ? { magicResistance: Number(mr[1]) } : {}),
      ...(fur ? { furArmourBonus: Number(fur[1]) } : {}),
    });
  }
  return rules;
}

/**
 * Build the kindred records. Production callers omit `rules` and let the book
 * discover its own kindreds (see {@link discoverKindreds}); the param exists so
 * tests can drive the name-table/persona parsing with controlled fixtures.
 */
export function parseKindreds(pages: string[], rules: KindredRule[] = []): ParsedKindred[] {
  const resolved = rules.length > 0 ? rules : discoverKindreds(pages);
  // Each kindred section opens with a "Kindred Type" line; the starts bound the
  // span the trait scan reads (its abilities sit in the prose of that span).
  const starts = pages.map((p, i) => (/Kindred Type/.test(p) ? i : -1)).filter((i) => i >= 0);
  const out: ParsedKindred[] = [];
  for (const rule of resolved) {
    const upper = rule.name.toUpperCase();
    const namesPage = pages.findIndex((t) => t.includes(`${upper} NAMES`));
    if (namesPage < 0) continue;
    const { columns, rows } = parseNameTable(pages[namesPage], upper);
    const [from, to] = sectionSpan(starts, namesPage, pages.length);
    const traits = extractTraits(pages, from, to);
    out.push({
      id: rule.id,
      name: rule.name,
      kindredType: rule.kindredType,
      nativeLanguages: parseLanguages(pages, namesPage),
      nameColumns: columns,
      nameRows: rows,
      persona: parsePersona(pages, namesPage),
      traits,
      trinkets: parseTrinkets(pages, rule.name),
      backgrounds: parseBackgrounds(pages, rule.name),
      physical: parsePhysical(pages, from, to),
      armourSwaps: parseArmourSwaps(traits),
      magicResistance: rule.magicResistance,
      furArmourBonus: rule.furArmourBonus,
    });
  }
  return out;
}

/** The [from, to) page span of the kindred section containing `page`, bounded by
 *  the surrounding "Kindred Type" starts (or a short window when none are found,
 *  as in unit-test fixtures). */
function sectionSpan(starts: number[], page: number, total: number): [number, number] {
  // The last start at or before `page` (plain loop, not Array.findLast, to avoid
  // an ES2023 dependency in the browser build).
  let from = page;
  for (let i = starts.length - 1; i >= 0; i--) {
    if (starts[i] <= page) {
      from = starts[i];
      break;
    }
  }
  const to = starts.find((s) => s > from) ?? Math.min(total, from + 4);
  return [from, to];
}

/** Read the physical stat rows from the section's opening page. Each value is
 *  the first column of its line; right-column prose (2+ spaces off) is trimmed.
 *  A gendered Height wraps its second variant to the next line, folded back in.
 *  Returns undefined when no stats are found. */
function parsePhysical(pages: string[], from: number, to: number): KindredPhysical | undefined {
  const field = (label: string): string | null => {
    for (let p = Math.max(0, from); p < to && p < pages.length; p++) {
      const lines = pages[p].split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(new RegExp(`^\\s*${label}\\s{2,}(.+)`));
        if (!m) continue;
        let value = m[1].split(/\s{2,}/)[0].trim();
        // A gendered height wraps its second variant onto the next line.
        if (/^Male:/i.test(value)) {
          const next = lines[i + 1]?.match(/^\s*(Female:.+)/);
          if (next) value += ` ${next[1].split(/\s{2,}/)[0].trim()}`;
        }
        return value;
      }
    }
    return null;
  };

  const age = field("Level 1 PC Age");
  const lifespan = field("Lifespan");
  const height = field("Height");
  const weight = field("Weight");
  if (!age && !lifespan && !height && !weight) return undefined;
  return { age, lifespan, height, weight };
}

/** Parse "rolled X armour is replaced with Y" swaps from a kindred's rules,
 *  keyed by the metal armour word (chainmail/plate). Returns undefined if none. */
function parseArmourSwaps(traits: Trait[]): Record<string, string> | undefined {
  const swaps: Record<string, string> = {};
  const text = traits.map((t) => t.text).join(" ");
  for (const metal of ["chainmail", "plate"]) {
    const m = text.match(new RegExp(`${metal}[^.]*?replaced with ([a-z]+ armour)`, "i"));
    if (m) swaps[metal] = m[1].trim();
  }
  return Object.keys(swaps).length > 0 ? swaps : undefined;
}

function parseLanguages(pages: string[], page: number): string[] {
  for (const p of [page, page - 1]) {
    if (p < 0) continue;
    const m = pages[p].match(/Native Languages\s+(.+)/);
    if (m) {
      // Trim any right-column prose that pdftotext glued onto the same line.
      return m[1]
        .split(/\s{2,}/)[0]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * Parse the "d20 ... Surname" names table. The table sits in one column whose
 * rows can run below the facing prose, so whole-page column splitting drifts at
 * the bottom. Instead we locate the table's x-offset from the "d20" header, then
 * slice each row there and split on 2+ spaces, letting the data's own gaps define
 * the cells. That stays aligned for every row and never cuts mid-word.
 */
function parseNameTable(page: string, upperName: string): { columns: string[]; rows: string[][] } {
  const lines = page.split("\n");
  const titleIdx = lines.findIndex((l) => l.includes(`${upperName} NAMES`));
  const headerIdx = lines.findIndex((l, i) => i > titleIdx && /\bd\d{1,2}\s+[A-Za-z]/.test(l));
  if (headerIdx < 0) return { columns: [], rows: [] };

  const header = lines[headerIdx];
  const diceX = header.search(/\bd\d{1,2}\s+[A-Za-z]/);
  const start = Math.max(0, diceX - 2); // a hair left of the roll-number column
  const columns = header
    .slice(diceX)
    .replace(/^d\d{1,2}\s+/, "")
    .split(/\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  if (columns.length === 0) return { columns: [], rows: [] };

  // x-offset where each column begins, for reassembling rows that extraction scatters.
  const colX: number[] = [];
  let pos = diceX;
  for (const c of columns) {
    const x = header.indexOf(c, pos);
    colX.push(x);
    pos = x + c.length;
  }

  const rows: string[][] = [];
  const scattered: number[] = []; // rows whose values landed on later, number-less lines
  const orphans: string[][] = columns.map(() => []); // stray values, bucketed by column
  let blanks = 0;
  for (let i = headerIdx + 1; i < lines.length && rows.length < 30; i++) {
    let region = lines[i].slice(start);
    if (region.trim() === "") {
      if (++blanks >= 4 && rows.length > 0) break;
      continue;
    }
    // A very wide facing-prose line can bleed a few characters past the table's
    // left edge (it sits entirely left of it in pdftotext, but layout-emulated
    // text can run a hair wider). If a roll number — 1-2 digits before a column
    // gap — follows some non-digit prose, drop the prose so the row still reads.
    const roll = region.match(/\d{1,2}(?=\s{2,}\S)/);
    if (roll && (roll.index ?? 0) > 0 && !/\d/.test(region.slice(0, roll.index))) {
      region = region.slice(roll.index);
    }
    if (/^\s*\d/.test(region)) {
      blanks = 0;
      const parts = region.trim().split(/\s{2,}/);
      parts.shift(); // drop the roll number
      if (parts.length > 0) {
        rows.push(parts.map((p) => p.trim()));
      } else {
        rows.push(columns.map(() => "")); // a roll number with its values scattered below
        scattered.push(rows.length - 1);
      }
    } else if (scattered.length > 0) {
      // Orphaned values from a scattered row: bucket each token under its nearest column.
      blanks = 0;
      let from = 0;
      for (const tok of cells(lines[i])) {
        const x = lines[i].indexOf(tok, from);
        from = x + tok.length;
        if (x < start) continue; // left-column prose
        orphans[nearestColumn(colX, x)].push(tok);
      }
    } else if (rows.length > 0) {
      break; // prose after a complete table
    }
  }

  // Fill scattered rows from the orphan buckets, in order, per column.
  for (let ci = 0; ci < columns.length; ci++) {
    let oi = 0;
    for (const ri of scattered) {
      if (rows[ri][ci] === "" && oi < orphans[ci].length) rows[ri][ci] = orphans[ci][oi++];
    }
  }
  return { columns, rows: rows.filter((r) => r.some((c) => c !== "")) };
}

function cells(line: string): string[] {
  return line
    .trim()
    .split(/\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function nearestColumn(colX: number[], x: number): number {
  let best = 0;
  let bestDist = Infinity;
  colX.forEach((cx, i) => {
    const d = Math.abs(cx - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/**
 * Parse the persona d12 grid. Each band is a line with one or more "d12 <Label>"
 * groups; the grid is x-aligned, so we slice each row at the "d12" offsets.
 */
function parsePersona(pages: string[], namesPage: number): Record<string, string[]> {
  const persona: Record<string, string[]> = {};
  for (let p = namesPage; p <= namesPage + 4 && p < pages.length; p++) {
    // Stop if we have wandered into the next kindred's section.
    if (p > namesPage && /\b[A-Z]+ NAMES\b/.test(pages[p]) && !pages[p].includes("d12")) break;

    const lines = pages[p].split("\n");
    for (let i = 0; i < lines.length; i++) {
      const starts = [...lines[i].matchAll(/d12\b/g)]
        .map((m) => m.index ?? -1)
        .filter((x) => x >= 0);
      if (starts.length === 0) continue;

      const ends = [...starts.slice(1), Number.MAX_SAFE_INTEGER];
      const fields = starts.map((s, k) =>
        lines[i]
          .slice(s + 3, ends[k])
          .trim()
          .toLowerCase(),
      );

      let j = i + 1;
      let collected = 0;
      while (j < lines.length && collected < 12) {
        if (lines[j].trim() === "") {
          if (collected > 0) break;
          j++;
          continue;
        }
        starts.forEach((s, k) => {
          const cell = lines[j]
            .slice(s, ends[k])
            .replace(/^\s*\d+\s+/, "")
            .trim();
          if (cell) (persona[fields[k]] ??= []).push(cell);
        });
        collected++;
        j++;
      }
      i = j - 1;
    }
  }
  return persona;
}

/**
 * Parse a kindred's trinket table. The table is on its own page (not within the
 * kindred section), headed "{KINDRED} TRINKETS" with a "d100 Trinket" header.
 * Entries use d100 ranges (e.g. "01–02 Description") in two columns; a
 * continuation line (no range) is stitched to the previous entry in its column.
 *
 * Searches all pages so the trinket table is found regardless of how far it sits
 * from the kindred's main section.
 */
function parseTrinkets(pages: string[], kindredName: string): string[] {
  const heading = new RegExp(
    `\\b${kindredName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toUpperCase()}\\s+TRINKETS?\\b`,
  );

  for (let p = 0; p < pages.length; p++) {
    const lines = pages[p].split("\n");
    const hIdx = lines.findIndex((l) => heading.test(l));
    if (hIdx < 0) continue;

    // The "d100 Trinket" header row sits within a few lines of the heading.
    let d100Line = -1;
    for (let i = hIdx + 1; i < Math.min(lines.length, hIdx + 4); i++) {
      if (/d100\s+Trinket/i.test(lines[i])) {
        d100Line = i;
        break;
      }
    }
    if (d100Line < 0) continue;

    // Find the column boundary: the x-offset of the right column's "d100".
    const header = lines[d100Line];
    const d100Positions = [...header.matchAll(/d100/gi)].map((m) => m.index ?? 0);
    const rightX = d100Positions.length >= 2 ? d100Positions[1] : header.length;

    // Entry start: a d100 range ("01–02 ") or a single number ("51 ").
    const rangeRe = /^\s*(\d{1,3})[–-](\d{1,3})\s+(.+)|^\s*(\d{1,3})\s+(.+)/;

    const left: string[] = [];
    const right: string[] = [];
    let leftCur = "";
    let rightCur = "";

    for (let i = d100Line + 1; i < lines.length; i++) {
      const line = lines[i];

      // A bare page number marks the end of the table.
      if (/^\s*\d{1,3}\s*$/.test(line) && (leftCur || rightCur)) break;

      if (line.trim() === "") continue;

      // Split the line at the column boundary.
      const leftPart = line.slice(0, rightX);
      const rightPart = line.slice(rightX);

      // Left column.
      const lm = leftPart.match(rangeRe);
      if (lm) {
        const text = (lm[3] ?? lm[5] ?? "").trim();
        if (text) {
          if (leftCur) left.push(leftCur);
          leftCur = text;
        }
      } else if (leftPart.trim() && leftCur && !/^\s*\d{1,3}\s*$/.test(leftPart)) {
        leftCur += ` ${leftPart.trim()}`;
      }

      // Right column.
      const rm = rightPart.match(rangeRe);
      if (rm) {
        const text = (rm[3] ?? rm[5] ?? "").trim();
        if (text) {
          if (rightCur) right.push(rightCur);
          rightCur = text;
        }
      } else if (rightPart.trim() && rightCur && !/^\s*\d{1,3}\s*$/.test(rightPart)) {
        rightCur += ` ${rightPart.trim()}`;
      }
    }
    if (leftCur) left.push(leftCur);
    if (rightCur) right.push(rightCur);

    const all = [...left, ...right]
      .filter((s) => s.length > 0)
      .map((s) =>
        s
          .replace(/\s{2,}\d{1,3}$/, "") // trailing page number in a column gap
          .replace(/\s{2,}\d{1,3}\s+/g, " ") // page number wedged into a column gap
          .trim(),
      );
    if (all.length >= 4) return all;
  }
  return [];
}

/**
 * Parse a kindred's background table. Like trinkets, the table is on its own
 * page, headed "{KINDRED} BACKGROUNDS". Most kindreds use a d20 in two columns;
 * humans use a d100 in three columns. Entries use ranges (e.g. "02-05") or
 * single numbers. Continuation lines are stitched to the previous entry in
 * their column, and page numbers leaking into column gaps are stripped.
 */
function parseBackgrounds(pages: string[], kindredName: string): string[] {
  const heading = new RegExp(
    `\\b${kindredName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toUpperCase()}\\s+BACKGROUNDS?\\b`,
  );

  for (let p = 0; p < pages.length; p++) {
    const lines = pages[p].split("\n");
    const hIdx = lines.findIndex((l) => heading.test(l));
    if (hIdx < 0) continue;

    // Find the "d20 Background" or "d100 Background" header row.
    let diceLine = -1;
    for (let i = hIdx + 1; i < Math.min(lines.length, hIdx + 4); i++) {
      if (/d\d{1,3}\s+Background/i.test(lines[i])) {
        diceLine = i;
        break;
      }
    }
    if (diceLine < 0) continue;

    // Column boundaries: the x-offset of each "d20"/"d100" in the header.
    // The first column starts at 0 (the roll numbers sit at or before the "d20"),
    // so we only use the subsequent positions as cut points.
    const header = lines[diceLine];
    const dicePositions = [...header.matchAll(/d\d{1,3}/gi)].map((m) => m.index ?? 0);
    if (dicePositions.length < 2) continue;
    const cuts = [0, ...dicePositions.slice(1)];

    const cols: string[][] = Array.from({ length: cuts.length }, () => []);
    const curs: string[] = Array.from({ length: cuts.length }, () => "");
    const rangeRe = /^\s*(\d{1,3})[–-](\d{1,3})\s+(.+)|^\s*(\d{1,3})\s+(.+)/;

    for (let i = diceLine + 1; i < lines.length; i++) {
      const line = lines[i];
      // A bare page number or a blank line marks the end of the table.
      if (line.trim() === "") {
        if (curs.some((c) => c)) break;
        continue;
      }
      if (/^\s*\d{1,3}\s*$/.test(line) && curs.some((c) => c)) break;
      // Stop if we've wandered into the next table (e.g. TRINKETS).
      if (/\b(?:TRINKETS|BACKGROUNDS|EXTRA DETAILS|NAMES)\b/i.test(line) && curs.some((c) => c))
        break;

      for (let col = 0; col < cuts.length; col++) {
        const start = cuts[col];
        const end = col + 1 < cuts.length ? cuts[col + 1] : line.length;
        const part = line.slice(start, end);

        // Try range match first, then single number.
        const rm = part.match(rangeRe);
        if (rm) {
          const text = (rm[3] ?? rm[5] ?? "").trim();
          if (rm[1] || rm[4]) {
            // New entry.
            if (curs[col]) cols[col].push(curs[col]);
            curs[col] = text;
          }
        } else if (part.trim() && curs[col] && !/^\s*\d{1,3}\s*$/.test(part)) {
          curs[col] += ` ${part.trim()}`;
        }
      }
    }
    for (let col = 0; col < curs.length; col++) {
      if (curs[col]) cols[col].push(curs[col]);
    }

    const all = cols
      .flat()
      .filter((s) => s.length > 0)
      .map((s) =>
        s
          .replace(/\s{2,}\d{1,3}$/, "")
          .replace(/\s{2,}\d{1,3}\s+/g, " ")
          .trim(),
      );
    if (all.length >= 10) return all;
  }
  return [];
}
