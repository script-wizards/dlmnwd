// Parse the fairy-rune tables from the Player's Book: the rune lists by
// magnitude (a 3-up "<MAGNITUDE> RUNES" table), the usage-frequency table, and
// the 2d6 rune-granted table with its level modifiers. Magnitudes are
// discovered from the table headings, never hardcoded. Pure (no Node APIs).

export interface RuneEntry {
  name: string;
  magnitude: string; // lower-case, as headed in the book ("lesser")
}

/** How often a rune may be used: `count` times per `period`. */
export interface Frequency {
  count: number;
  period: "day" | "week" | "year" | "level" | "ever";
}

export interface UsageBand {
  minLevel: number;
  maxLevel: number | null; // null for an open-ended "10+" band
  text: string; // as printed, e.g. "Twice per day"
  freq: Frequency | null;
}

export interface GrantRow {
  min: number | null; // null for "2 or less"
  max: number | null; // null for "12 or more"
  text: string;
  magnitude: string | null; // the magnitude granted, or null for none
}

export interface RuneRules {
  runes: RuneEntry[];
  usage: Record<string, UsageBand[]>; // by magnitude
  granted: GrantRow[];
  levelBonus: { minLevel: number; maxLevel: number | null; bonus: number }[];
}

const COUNT: Record<string, number> = { once: 1, twice: 2, thrice: 3 };

/** "Once per day", "Twice per week", "Once per Level", "Once ever", "3 times per day". */
export function parseFrequency(text: string): Frequency | null {
  const t = text.trim().toLowerCase();
  if (/^once ever$/.test(t)) return { count: 1, period: "ever" };
  const m = t.match(/^(once|twice|thrice|(\d+) times?) (?:per|a|each) (day|week|year|level)$/);
  if (!m) return null;
  const count = m[2] ? parseInt(m[2], 10) : COUNT[m[1]];
  return { count, period: m[3] as Frequency["period"] };
}

export function parseRunes(pages: string[]): RuneRules {
  const out: RuneRules = { runes: [], usage: {}, granted: [], levelBonus: [] };
  for (const page of pages) {
    const lines = page.split("\n");
    lines.forEach((line, h) => {
      const heads = [...line.matchAll(/\b([A-Z]+) RUNES\b/g)];
      if (heads.length >= 2 && out.runes.length === 0) out.runes = runeLists(lines, h, heads);
      if (/\bRUNE USAGE FREQUENCY\b/.test(line) && Object.keys(out.usage).length === 0)
        out.usage = usageTable(lines, h);
      if (/\bRUNE GRANTED\b/.test(line) && out.granted.length === 0)
        out.granted = grantedTable(lines, h);
    });
  }
  // The level modifier to the grant roll is prose: "Level 3–5 gain a +1 bonus".
  const magnitudes = [...new Set(out.runes.map((r) => r.magnitude))];
  if (out.granted.length > 0) {
    for (const g of out.granted)
      g.magnitude = magnitudes.find((m) => new RegExp(`\\b${m}\\b`, "i").test(g.text)) ?? null;
  }
  for (const page of pages) {
    const flat = page.replace(/\s+/g, " ");
    if (!/Rune Granted table/i.test(flat)) continue;
    for (const m of flat.matchAll(/Level (\d+)\s*[–-]\s*(\d+) gain an? \+(\d+) bonus/g))
      out.levelBonus.push({ minLevel: +m[1], maxLevel: +m[2], bonus: +m[3] });
    for (const m of flat.matchAll(/Level (\d+) or above gain an? \+(\d+) bonus/g))
      out.levelBonus.push({ minLevel: +m[1], maxLevel: null, bonus: +m[2] });
    if (out.levelBonus.length > 0) break;
  }
  return out;
}

/** The "# Rune" rows under a line of "<MAGNITUDE> RUNES" headings. Each row's
 *  "N  Name" pair belongs to the heading nearest to it. */
function runeLists(lines: string[], h: number, heads: RegExpMatchArray[]): RuneEntry[] {
  const cols = heads.map((m) => ({ x: m.index ?? 0, magnitude: m[1].toLowerCase() }));
  const out: RuneEntry[] = [];
  for (let i = h + 1; i < Math.min(lines.length, h + 30); i++) {
    const line = lines[i];
    if (line.trim() === "") {
      if (out.length > 0) break;
      continue;
    }
    for (const m of line.matchAll(/(?:^|\s)(\d{1,2})\s{2,}(\S(?:.*?\S)?)(?=\s{2,}|\s*$)/g)) {
      const x = (m.index ?? 0) + m[0].indexOf(m[1]);
      // Headings are centred over their columns, so take the nearest one.
      const col = cols.reduce((a, c) => (Math.abs(c.x - x) < Math.abs(a.x - x) ? c : a));
      out.push({ name: m[2].trim(), magnitude: col.magnitude });
    }
  }
  return out;
}

/** "Type  1–4  5–9  10+" then one row per magnitude of frequency cells. */
function usageTable(lines: string[], h: number): Record<string, UsageBand[]> {
  const usage: Record<string, UsageBand[]> = {};
  let bands: { min: number; max: number | null }[] = [];
  for (let i = h + 1; i < Math.min(lines.length, h + 10); i++) {
    const line = lines[i];
    const found = [...line.matchAll(/(\d+)\s*(?:[–-]\s*(\d+)|(\+))/g)];
    if (bands.length === 0 && found.length >= 2 && /\bType\b/.test(line)) {
      bands = found.map((m) => ({ min: +m[1], max: m[3] ? null : +m[2] }));
      continue;
    }
    if (bands.length === 0) continue;
    const cells = line.trim().split(/\s{2,}/);
    if (cells.length !== bands.length + 1) {
      if (Object.keys(usage).length > 0) break;
      continue;
    }
    usage[cells[0].toLowerCase()] = bands.map((b, k) => ({
      minLevel: b.min,
      maxLevel: b.max,
      text: cells[k + 1],
      freq: parseFrequency(cells[k + 1]),
    }));
  }
  return usage;
}

/** "2d6  Rune Granted" then rows "2 or less", "3–7", "12 or more". */
function grantedTable(lines: string[], h: number): GrantRow[] {
  const rows: GrantRow[] = [];
  for (let i = h + 1; i < Math.min(lines.length, h + 10); i++) {
    const t = lines[i].trim();
    let m = t.match(/^(\d+) or less\s{2,}(.+)$/);
    if (m) {
      rows.push({ min: null, max: +m[1], text: m[2], magnitude: null });
      continue;
    }
    m = t.match(/^(\d+) or more\s{2,}(.+)$/);
    if (m) {
      rows.push({ min: +m[1], max: null, text: m[2], magnitude: null });
      continue;
    }
    m = t.match(/^(\d+)\s*[–-]\s*(\d+)\s{2,}(.+)$/);
    if (m) rows.push({ min: +m[1], max: +m[2], text: m[3], magnitude: null });
    else if (rows.length > 0) break;
  }
  return rows;
}
