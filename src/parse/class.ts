import { splitProseColumns, splitTwoColumns } from "../pdf/columns.ts";
import { extractTraits, type Trait } from "./traits.ts";

export interface EquipmentOption {
  /** The roll value or range that maps to this option, e.g. "1-2" or "3". */
  roll: string;
  /** The equipment description, e.g. "Quilted armour" or "3 awls". */
  item: string;
}

export interface StartingEquipment {
  /** d6 options for armour (roll once). */
  armour: EquipmentOption[];
  /** d6 options for weapons (rolled twice). */
  weapons: EquipmentOption[];
  /** Fixed class-specific items (e.g. "Musical instrument", "Thieves' tools"). */
  classItems: string[];
}

export interface SpellBook {
  name: string;
  spells: string[];
}

export interface ParsedClass {
  id: string;
  name: string;
  hitDie: string; // e.g. "1d4"
  armour: string; // e.g. "Light, no shields"
  weapons: string; // e.g. "Small and Medium"
  primeAbilities: Ability[]; // e.g. ["cha", "dex"]; drives the score-adjustment step
  attack: number; // level-1 attack bonus
  nextLevelXp: number; // XP required for level 2
  saves: { doom: number; ray: number; hold: number; blast: number; spell: number };
  skills: Record<string, number>; // level-1 skill targets (empty if the class has none)
  languages: string[]; // bonus languages the class grants
  traits: Trait[]; // named class abilities (empty if none parsed)
  startingEquipment: StartingEquipment | null; // parsed from the Starting Equipment section
  spellBooks: SpellBook[]; // magician only; empty for others
}

const ABILITY_BY_NAME: Record<string, Ability> = {
  strength: "str",
  intelligence: "int",
  wisdom: "wis",
  dexterity: "dex",
  constitution: "con",
  charisma: "cha",
};
export type Ability = "str" | "int" | "wis" | "dex" | "con" | "cha";

const CLASSES = [
  "Bard",
  "Cleric",
  "Enchanter",
  "Fighter",
  "Friar",
  "Hunter",
  "Knight",
  "Magician",
  "Thief",
];

const SAVES = ["Doom", "Ray", "Hold", "Blast", "Spell"] as const;

export function parseClasses(pages: string[]): ParsedClass[] {
  const out: ParsedClass[] = [];
  for (const name of CLASSES) {
    const page = findClassPage(pages, name);
    if (page < 0) continue;
    const adv = parseLevel1(pages, page);
    if (!adv) continue;
    const block = parseStatBlock(pages[page]);
    const skills = parseSkills(pages, page, name);
    // A class occupies its stat-block page and the spread beside it; the next
    // class starts two pages on, so stop short of it.
    const traits = extractTraits(pages, page, Math.min(pages.length, page + 2));
    const startingEquipment = parseStartingEquipment(pages[page]);
    const spellBooks = name === "Magician" ? parseSpellBooks(pages, page) : [];
    out.push({
      id: name.toLowerCase(),
      name,
      ...block,
      ...adv,
      skills,
      languages: parseClassLanguages(traits),
      traits,
      startingEquipment,
      spellBooks,
    });
  }
  return out;
}

/** Bonus languages a class grants, read from a "speak X[, Y]" phrase in its
 *  "Languages" ability. */
function parseClassLanguages(traits: Trait[]): string[] {
  const trait = traits.find((t) => /^Languages?$/i.test(t.name));
  if (!trait) return [];
  const langs: string[] = [];
  for (const m of trait.text.matchAll(
    /\bspeaks?\s+([A-Z][a-zA-Z]+(?:(?:,\s*|\s+and\s+)[A-Z][a-zA-Z]+)*)/g,
  )) {
    for (const lang of m[1].split(/,\s*|\s+and\s+/)) {
      if (lang && !langs.includes(lang)) langs.push(lang);
    }
  }
  return langs;
}

/** Map a "Prime Abilities" cell ("Charisma, Dexterity") to ability keys. */
function parsePrimeAbilities(cell: string): Ability[] {
  const out: Ability[] = [];
  for (const word of cell.toLowerCase().split(/[^a-z]+/)) {
    const ability = ABILITY_BY_NAME[word];
    if (ability && !out.includes(ability)) out.push(ability);
  }
  return out;
}

/** The class's stat-block page: has "Prime Abilities" and the class title near the top. */
function findClassPage(pages: string[], name: string): number {
  return pages.findIndex((t) => {
    if (!t.includes("Prime Abilities")) return false;
    return t
      .split("\n")
      .slice(0, 12)
      .some((l) => l.trim() === name);
  });
}

function parseStatBlock(
  page: string,
): Pick<ParsedClass, "hitDie" | "armour" | "weapons" | "primeAbilities"> {
  const grab = (label: string): string => {
    const m = page.match(new RegExp(`${label}\\s{2,}(.+)`));
    return m ? m[1].split(/\s{2,}/)[0].trim() : "";
  };
  const hp = page.match(/Hit Points\s{2,}(1d\d+)/);
  return {
    hitDie: hp ? hp[1] : "",
    armour: grab("Armour"),
    weapons: grab("Weapons"),
    primeAbilities: parsePrimeAbilities(grab("Prime Abilities")),
  };
}

/** Parse the level-1 (and level-2 XP) rows of the advancement table, by header name. */
function parseLevel1(
  pages: string[],
  page: number,
): Pick<ParsedClass, "attack" | "saves" | "nextLevelXp"> | null {
  for (const pg of [page, page + 1]) {
    if (pg >= pages.length) continue;
    const lines = pages[pg].split("\n");
    const h = lines.findIndex(
      (l) => /\bDoom\b/.test(l) && /\bSpell\b/.test(l) && /\bAttack\b/.test(l),
    );
    if (h < 0) continue;

    const cols = cells(lines[h]);
    let level1: { attack: number; saves: ParsedClass["saves"] } | null = null;
    let nextLevelXp = 0;
    for (let i = h + 1; i < lines.length; i++) {
      const row = cells(lines[i]);
      if (row[0] === "1" && !level1) {
        level1 = {
          attack: num(row[cols.indexOf("Attack")]),
          saves: Object.fromEntries(
            SAVES.map((s) => [s.toLowerCase(), num(row[cols.indexOf(s)])]),
          ) as ParsedClass["saves"],
        };
      } else if (row[0] === "2" && level1) {
        nextLevelXp = num(row[cols.indexOf("XP")]);
        break;
      }
    }
    if (level1) return { ...level1, nextLevelXp };
  }
  return null;
}

/**
 * Parse the level-1 skill targets. Two layouts occur: a single table, and a
 * "2-up" table with levels 1-5 and 6-10 side by side. We read the data row
 * positionally and rebuild each column's label from the header tokens above it,
 * using token centres so wrapped and side-by-side labels reassemble correctly.
 * For a 2-up table we keep only the left (levels 1-5) block.
 */
function parseSkills(pages: string[], page: number, name: string): Record<string, number> {
  for (const pg of [page, page + 1]) {
    if (pg >= pages.length) continue;
    // Flat page first (reads a wide centred table whole, e.g. Thief); then a hard
    // column slice (recovers a table buried in facing prose, e.g. Bard, without
    // losing its header words).
    for (const seg of [pages[pg], ...splitTwoColumns(pages[pg], true)]) {
      const skills = skillsFromSegment(seg, name);
      if (skills) return skills;
    }
  }
  return {};
}

function skillsFromSegment(seg: string, name: string): Record<string, number> | null {
  const lines = seg.split("\n");
  const banner = lines.findIndex(
    (l) => /SKILL TARGETS/.test(l) && l.toUpperCase().includes(name.toUpperCase()),
  );
  if (banner < 0) return null;

  let dataIdx = -1;
  for (let i = banner + 1; i < lines.length && i - banner <= 12; i++) {
    if (/^\s*1\s+\d/.test(lines[i])) {
      dataIdx = i;
      break;
    }
  }
  if (dataIdx < 0) return null;

  const header = lines.slice(banner + 1, dataIdx);
  // A 2-up table repeats the Level column; cut everything from the second one on,
  // so only the levels 1-5 block (which holds the level-1 row) is read.
  const limit = secondLevelOffset(header);

  const data = tokens(lines[dataIdx]).filter((t) => t.x < limit);
  const values = data.filter((t) => /^\d+$/.test(t.text));
  values.shift(); // drop the leading level number
  if (values.length === 0) return null;

  // Each value's centre is a column anchor; assign every header token to its
  // nearest column, then read each column top-to-bottom into a label.
  const cols = values.map((v) => ({ x: v.x, target: parseInt(v.text, 10), words: [] as Tok[] }));
  header.forEach((line, li) => {
    for (const t of tokens(line)) {
      if (t.text === "Level" || t.x >= limit) continue;
      let best = 0;
      let bestDist = Infinity;
      cols.forEach((c, i) => {
        const d = Math.abs(c.x - t.x);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      if (bestDist <= 10) cols[best].words.push({ ...t, line: li });
    }
  });

  const skills: Record<string, number> = {};
  for (const c of cols) {
    c.words.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.x - b.x);
    const label = joinWrap(c.words.map((w) => w.text));
    if (isSkillLabel(label) && c.target >= 1 && c.target <= 6)
      skills[fullSkillName(label)] = c.target;
  }
  return Object.keys(skills).length > 0 ? skills : null;
}

// The advancement tables abbreviate skill names; expand to the full name.
const SKILL_FULL_NAMES: Record<string, string> = {
  "Decipher Doc": "Decipher Document",
  "Disarm Mech": "Disarm Mechanism",
  "Climb Wall": "Climbing",
};
function fullSkillName(label: string): string {
  return SKILL_FULL_NAMES[label] ?? label;
}

const NON_SKILL_WORDS = /\b(the|skill|targets|table|lists|standard|rank|spell|per|day|level)\b/i;

function isSkillLabel(label: string): boolean {
  return label.length >= 4 && /^[A-Z][A-Za-z .'’-]+$/.test(label) && !NON_SKILL_WORDS.test(label);
}

interface Tok {
  text: string;
  x: number;
  line?: number;
}

// Token positions use the centre, not the left edge: a wide header word set above
// a narrow column would otherwise drift into the neighbouring column.
function tokens(line: string): Tok[] {
  const out: Tok[] = [];
  for (const m of line.matchAll(/\S+/g))
    out.push({ text: m[0], x: (m.index ?? 0) + m[0].length / 2 });
  return out;
}

/** The x of the second "Level" header (start of the 2-up right block), else ∞. */
function secondLevelOffset(header: string[]): number {
  const xs: number[] = [];
  for (const line of header) for (const t of tokens(line)) if (t.text === "Level") xs.push(t.x);
  xs.sort((a, b) => a - b);
  return xs.length >= 2 ? xs[1] : Infinity;
}

/** Join a column's words, stitching hyphenated wraps ("Legerde-" + "main"). */
function joinWrap(words: string[]): string {
  let label = "";
  for (const w of words) {
    label = label.endsWith("-") ? label.slice(0, -1) + w : label ? `${label} ${w}` : w;
  }
  return label.replace(/\.$/, "");
}

function cells(line: string): string[] {
  return line
    .trim()
    .split(/\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function num(s: string | undefined): number {
  return s ? parseInt(s.replace(/[+,]/g, ""), 10) || 0 : 0;
}

/**
 * Parse the "Starting Equipment" section from a class page. The section has:
 * - Armour (roll 1d6): ranged options like "1-3. Quilted. 4-5. Ringmail. 6. Scale."
 * - Weapons (roll 1d6 twice): numbered options like "1. Cudgel. 2. 3 awls."
 * - Class items: a fixed list like "Wooden holy symbol." or "Thieves' tools."
 *
 * The text flows in two columns, so options can wrap across lines. Returns null
 * if the section is not found.
 */
function parseStartingEquipment(page: string): StartingEquipment | null {
  // Try split columns first (the heading sits in one column, so the split is
  // needed to avoid the other column's text bleeding in), then the flat page.
  const segments = [...splitProseColumns(page), ...splitTwoColumns(page), page];
  for (const seg of segments) {
    const lines = seg.split("\n");
    const start = lines.findIndex((l) => /starting equipment/i.test(l));
    if (start < 0) continue;

    const textParts: string[] = [];
    let blanks = 0;
    for (let i = start + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === "") {
        if (textParts.length > 0) {
          blanks++;
          if (blanks >= 2) break; // two consecutive blanks end the section
        }
        continue;
      }
      blanks = 0;
      // Stop at a new section heading (ALL-CAPS, not a d6 option).
      if (/^[A-Z][A-Z ]{8,}$/.test(t) && !/^\d/.test(t)) break;
      textParts.push(t);
    }
    if (textParts.length === 0) continue;
    const text = textParts.join(" ");

    const weapons = parseEquipmentTable(text, "Weapons");
    const result: StartingEquipment = {
      armour: parseEquipmentTable(text, "Armour"),
      weapons: weapons.length > 0 ? weapons : parseEquipmentTable(text, "Weapon"),
      classItems: parseClassItems(text),
    };
    if (result.armour.length > 0 || result.weapons.length > 0) return result;
  }
  return null;
}

/**
 * Parse a d6 equipment table ("Armour" or "Weapons") from the section text.
 * Entries are like "1-2. None." or "1. Cudgel." — a roll number or range,
 * followed by a period, then the item text until the next entry or end.
 */
function parseEquipmentTable(text: string, label: string): EquipmentOption[] {
  // Find the label's content: "Armour (roll 1d6):" or "Weapons (roll 1d6 twice):"
  const startMatch = text.match(
    new RegExp(
      `${label}\\s*\\(roll[^)]*\\):\\s*(.+?)(?=\\s*(?:Weapons|Weapon|Class items:|$))`,
      "s",
    ),
  );
  if (!startMatch) return [];
  const body = startMatch[1].trim();

  // Split on "N." or "N-N." entry starts, recording the marker's index so we
  // can slice to the next marker's start (not a magic offset).
  const entryRe = /(\d{1,2}(?:[–-]\d{1,2})?)\.\s*/g;
  const entries: { roll: string; textStart: number; markerStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(body)) !== null) {
    entries.push({
      roll: m[1].replace("–", "-"),
      textStart: m.index + m[0].length,
      markerStart: m.index,
    });
  }
  if (entries.length === 0) return [];

  return entries.map((e, i) => {
    const end = i + 1 < entries.length ? entries[i + 1].markerStart : body.length;
    const item = body.slice(e.textStart, end).trim().replace(/\.$/, "").trim();
    return { roll: e.roll, item };
  });
}

/** Parse the "Class items:" line — a fixed list of items separated by commas. */
function parseClassItems(text: string): string[] {
  const m = text.match(/Class items:\s*(.+?)(?:\s*$)/);
  if (!m) return [];
  // Stop at trailing prose (e.g. "A Level 1 magician starts play with...").
  const items = m[1]
    .replace(/\s{2,}[A-Z][A-Z ]{8,}.*$/, "")
    .replace(/\s+A Level 1.*$/, "")
    .trim()
    .replace(/\.$/, "");
  if (!items || items.length > 200) return []; // reject prose mistaken for items
  return items
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse the magician's starting spell books. The table is on the class page
 * (right column), with 6 numbered entries. Each entry is:
 * "N. Book Name: Contains the following Rank 1 spells: Spell A, Spell B, Spell C."
 */
function parseSpellBooks(pages: string[], classPage: number): SpellBook[] {
  // Try split columns first (the spell book list sits in the right column).
  const segments = [
    ...splitProseColumns(pages[classPage]),
    ...splitTwoColumns(pages[classPage]),
    pages[classPage],
  ];
  for (const seg of segments) {
    const lines = seg.split("\n");
    const start = lines.findIndex((l) => /starting spell books/i.test(l));
    if (start < 0) continue;

    // Gather ALL remaining lines in the segment after the heading — the spell
    // book entries are at the bottom of the right column, after intro prose
    // with blank lines between. The numbered-entry regex handles the split.
    const text = lines
      .slice(start + 1)
      .join(" ")
      .replace(/^\s*/, "")
      .trim();

    const entryRe = /(\d)\.\s+/g;
    const entries: { textStart: number; markerStart: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(text)) !== null) {
      entries.push({ textStart: m.index + m[0].length, markerStart: m.index });
    }
    if (entries.length < 3) continue;

    const books = entries.map((e, i) => {
      const end = i + 1 < entries.length ? entries[i + 1].markerStart : text.length;
      // Collapse the column-gap whitespace runs the reflow leaves behind, so the
      // "Name: Contains the following … spells:" shape matches on one line.
      const entry = text.slice(e.textStart, end).replace(/\s+/g, " ").trim();

      const nameMatch = entry.match(
        /^(.+?):\s*Contains the following (?:Rank \d+ )?spells?:\s*(.+)/,
      );
      if (nameMatch) {
        const name = nameMatch[1].trim();
        const spells = nameMatch[2]
          .replace(/\.$/, "")
          .split(/,\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
        return { name, spells };
      }
      return { name: entry.replace(/\.$/, "").trim(), spells: [] as string[] };
    });
    if (books.length >= 3) return books;
  }
  return [];
}
