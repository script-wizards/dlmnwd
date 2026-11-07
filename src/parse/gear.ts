// Parse the equipment lists (item weights), the encumbrance tables, and the
// gear-slot rules from the Player's Book. Everything is discovered from the
// book's own tables; nothing setting-specific is embedded here. Pure (no Node
// APIs) so it can run in the browser build too.
//
// The equipment tables come two (or more) to a row: "Item Cost Weight" blocks
// side by side, each with its own heading above it, and a block's header can
// sit on the same line as another block's data rows. So a header is found
// anywhere on a line, split into blocks by its column labels, and each block's
// rows are read beneath it within that block's own x-range.

export type ItemKind =
  | "gear"
  | "armour"
  | "weapon"
  | "ammo"
  | "clothing"
  | "container"
  | "treasure";

export interface CatalogItem {
  name: string;
  kind: ItemKind;
  /** Weight in coins of the listed unit (a bundle weighs its listed total). */
  weight: number;
  /** Per-piece weight, when the list gives one ("20 (2 each)", "1 each"). */
  each?: number;
  /** The table heading the item was listed under, e.g. "CONTAINERS". */
  section: string;
  cost?: string;
  ac?: string; // armour
  bulk?: string; // armour: None / Light / Medium / Heavy
  damage?: string; // weapons
  size?: string; // weapons
  qualities?: string; // weapons
}

interface Tok {
  text: string;
  x: number;
  end: number;
}

function toks(s: string, offset = 0): Tok[] {
  const out: Tok[] = [];
  for (const m of s.matchAll(/\S+/g)) {
    const x = (m.index ?? 0) + offset;
    out.push({ text: m[0], x, end: x + m[0].length });
  }
  return out;
}

const HEADER_NEXT = new Set(["Cost", "Capacity", "Weight", "Damage"]);

interface Block {
  x0: number;
  x1: number;
  cols: Tok[]; // header labels, "(gp)" dropped
}

/** Find a table header on a line and split it into blocks, or null. A header's
 *  first label is followed by a Cost/Capacity/Weight/Damage column and the run
 *  includes a Weight column; a further block starts at a label after a Weight
 *  column that is itself followed by one of those columns. The header may start
 *  mid-line (beside a neighbouring block's data row or a heading). */
const isLabel = (t: Tok | undefined): boolean =>
  !!t && (/^[A-Z][A-Za-z]*$/.test(t.text) || t.text === "AC");

function headerBlocks(line: string): Block[] | null {
  const all = toks(line).filter((t) => t.text !== "(gp)");
  for (let j = 0; j + 1 < all.length; j++) {
    if (!isLabel(all[j]) || !HEADER_NEXT.has(all[j + 1].text)) continue;
    // Header labels are a run of Title-case words; stop at the first that isn't
    // (a neighbouring block's data row sharing the line).
    const labels: Tok[] = [];
    for (let k = j; k < all.length && isLabel(all[k]); k++) labels.push(all[k]);
    if (!labels.some((t) => t.text === "Weight")) continue;

    const starts = [0];
    let sawWeight = false;
    for (let i = 1; i < labels.length; i++) {
      if (labels[i].text === "Weight") sawWeight = true;
      else if (sawWeight && i + 1 < labels.length && HEADER_NEXT.has(labels[i + 1].text)) {
        starts.push(i);
        sawWeight = false;
      }
    }
    return starts.map((s, k) => {
      const e = k + 1 < starts.length ? starts[k + 1] : labels.length;
      return {
        x0: labels[s].x,
        x1: k + 1 < starts.length ? labels[starts[k + 1]].x : Infinity,
        cols: labels.slice(s, e),
      };
    });
  }
  return null;
}

function slice(line: string, x0: number, x1: number): string {
  return line.slice(x0, Number.isFinite(x1) ? x1 : undefined);
}

/** The ALL-CAPS heading just above a table block, if any. */
function titleAbove(lines: string[], h: number, b: Block): string {
  const weight = b.cols.find((c) => c.text === "Weight");
  const narrow = weight ? weight.end + 4 : b.x1;
  for (let i = h - 1; i >= Math.max(0, h - 3); i--) {
    for (const x0 of [b.x0, Math.max(0, b.x0 - 12)]) {
      for (const x1 of [b.x1, narrow]) {
        const t = slice(lines[i], x0, x1).trim();
        if (/^[A-Z][A-Z ,&]+$/.test(t) && t.length > 2) return t;
      }
    }
  }
  return "";
}

function kindOf(title: string, cols: Tok[]): ItemKind {
  const has = (l: string) => cols.some((c) => c.text === l);
  if (has("AC")) return "armour";
  if (has("Damage")) return "weapon";
  if (/AMMUNITION/.test(title)) return "ammo";
  if (/CLOTH/.test(title)) return "clothing";
  if (/CONTAINER/.test(title)) return "container";
  if (/TREASURE/.test(title)) return "treasure";
  return "gear";
}

/** Parse one weight cell: "50", "1,000", "–", "20 (2 each)", "1 each", "50 (full)". */
function parseWeight(cell: string): { weight: number; each?: number } | null {
  const t = cell.trim();
  if (/^[–—-]$/.test(t)) return { weight: 0 };
  const m = t.match(/^([\d,]+)(?:\s+each\b|\s*\((\d+) each\))?/);
  if (!m) return null;
  const weight = parseInt(m[1].replace(/,/g, ""), 10);
  if (/^[\d,]+\s+each\b/.test(t)) return { weight, each: weight };
  return m[2] ? { weight, each: parseInt(m[2], 10) } : { weight };
}

/** Read a block's rows. Returns the items and the line index where it ended. */
function readRows(lines: string[], from: number, b: Block, title: string): [CatalogItem[], number] {
  const items: CatalogItem[] = [];
  const kind = kindOf(title, b.cols);
  const nameEnd = b.cols[1].x - 3;
  let i = from;
  for (; i < lines.length; i++) {
    const s = slice(lines[i], b.x0, b.x1);
    const ts = toks(s, b.x0);
    const nameToks = ts.filter((t) => t.x < nameEnd);
    if (nameToks.length === 0) {
      // A table interleaved with a neighbour's prose can leave a blank row in
      // its region; carry on only if a row follows straight after.
      const next = lines[i + 1] !== undefined ? slice(lines[i + 1], b.x0, b.x1) : "";
      if (ts.length === 0 && toks(next, b.x0).some((t) => t.x < nameEnd)) continue;
      break;
    }
    const name = nameToks.map((t) => t.text).join(" ");
    if (/^[A-Z][A-Z ]+$/.test(name)) break; // the next table's heading
    // Value cells: what follows the name, split on 2+ spaces, in column order.
    const rest = s.slice(nameToks[nameToks.length - 1].end - b.x0);
    const cells = rest
      .trim()
      .split(/\s{2,}/)
      .filter(Boolean);
    const labels = b.cols.slice(1).map((c) => c.text);
    const cell = (label: string): string | undefined => {
      const k = labels.indexOf(label);
      return k >= 0 ? cells[k] : undefined;
    };
    const w = cell("Weight") !== undefined ? parseWeight(cell("Weight")!) : null;
    if (!w) break; // a footnote ("Italics: …") or the end of the table
    const item: CatalogItem = { name, kind, ...w, section: title };
    const cost = cell("Cost");
    if (cost) item.cost = cost;
    if (kind === "armour") {
      item.ac = cell("AC");
      item.bulk = cell("Bulk");
    }
    if (kind === "weapon") {
      item.damage = cell("Damage");
      item.size = cell("Size");
      // Qualities is the last column; anything after it belongs to it.
      const q = labels.indexOf("Qualities");
      if (q >= 0 && cells.length > q) item.qualities = cells.slice(q).join(" ");
    }
    items.push(item);
  }
  return [items, i];
}

/** Every item with a listed weight, from all the equipment tables in the book.
 *  The first listing of a name wins (summary tables repeat the main ones). */
export function parseCatalog(pages: string[]): CatalogItem[] {
  const seen = new Map<string, CatalogItem>();
  for (const page of pages) {
    if (!/\bWeight\b/.test(page)) continue;
    const lines = page.split("\n");
    lines.forEach((line, i) => {
      for (const b of headerBlocks(line) ?? []) {
        const [items] = readRows(lines, i + 1, b, titleAbove(lines, i, b));
        for (const it of items) {
          const key = it.name.toLowerCase();
          if (!seen.has(key)) seen.set(key, it);
        }
      }
    });
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Encumbrance rules

export interface WeightBand {
  max: number; // up to this many coins
  speed: number;
}

export interface SlotBand {
  equipped: number; // up to this many equipped slots
  stowed: number; // up to this many stowed slots
  speed: number;
}

export interface EncumbranceRules {
  /** Weight bands, ascending; carrying more than the last band's max can't move. */
  weight: WeightBand[];
  /** Slot bands, ascending; equipped and stowed are looked up separately. */
  slots: SlotBand[];
  /** Stowed slots each container provides. */
  slotsPerContainer: number;
  /** Words naming the containers that hold stowed items ("sack", "backpack"). */
  stowContainers: string[];
  /** Basic (armour-only) speeds by armour bulk: [without, with] treasure. */
  basic: Record<string, [number, number]>;
  /** Item-slot examples by category, from the gear-slots table. */
  zeroSlot: string[]; // tiny items and containers in use: 0 slots
  bulky: string[]; // 2 slots, can't be stowed
  coinsPerSlot: number;
  /** Weight of a small trinket, when the book gives one. */
  trinketWeight: number;
}

const num = (s: string): number => parseInt(s.replace(/,/g, ""), 10);

/** Parse the weight, slot, and basic encumbrance tables plus the slot rules. */
export function parseEncumbrance(pages: string[]): Partial<EncumbranceRules> {
  const out: Partial<EncumbranceRules> = {};
  for (const page of pages) {
    const lines = page.split("\n");
    lines.forEach((line, h) => {
      if (/\bWEIGHT ENCUMBRANCE\b/.test(line) && !out.weight) {
        const bands: WeightBand[] = [];
        for (const l of lines.slice(h + 1, h + 14)) {
          const m = l.match(/([\d,]+) coins\s{2,}(\d+)/);
          if (m) bands.push({ max: num(m[1]), speed: num(m[2]) });
        }
        if (bands.length >= 2) out.weight = bands;
      }
      if (/\bSLOT ENCUMBRANCE\s*$/.test(line) && !out.slots) {
        const bands: SlotBand[] = [];
        for (const l of lines.slice(h + 1, h + 14)) {
          const m = l.match(/^\s*\d+\s*[–-]\s*(\d+)\s+\d+\s*[–-]\s*(\d+)\s+(\d+)\b/);
          if (m) bands.push({ equipped: num(m[1]), stowed: num(m[2]), speed: num(m[3]) });
        }
        if (bands.length >= 2) out.slots = bands;
      }
      if (/\bBASIC ENCUMBRANCE\s*$/.test(line) && !out.basic) {
        const basic: Record<string, [number, number]> = {};
        for (const l of lines.slice(h + 1, h + 10)) {
          const m = l.match(
            /(?:^|\s{2,})([A-Z][a-z]+(?: or [A-Z][a-z]+)*)\s{2,}(\d+)\s{2,}(\d+)\s*$/,
          );
          if (!m) continue;
          for (const bulk of m[1].split(/ or /)) basic[bulk.toLowerCase()] = [num(m[2]), num(m[3])];
        }
        if (Object.keys(basic).length >= 2) out.basic = basic;
      }
      if (/\bITEM GEAR SLOTS\s*$/.test(line) && !out.zeroSlot) {
        Object.assign(out, parseGearSlots(lines, h));
      }
    });
    const flat = page.replace(/\s+/g, " ");
    const per = flat.match(/(\d+) Slots \/ Container/i);
    if (per && !out.slotsPerContainer) out.slotsPerContainer = num(per[1]);
    const holders = flat.match(/\b([A-Za-z]+) and ([a-z]+) each have \d+ slots for stowed/);
    if (holders && !out.stowContainers)
      out.stowContainers = [holders[1], holders[2]].map((w) => singular(w.toLowerCase()));
    const trinket = flat.match(/trinkets? weighs? (\d+) coins?/i);
    if (trinket && out.trinketWeight === undefined) out.trinketWeight = num(trinket[1]);
  }
  return out;
}

/** Read the "Item Gear Slots" table: category rows with example lists. */
function parseGearSlots(
  lines: string[],
  h: number,
): Pick<EncumbranceRules, "zeroSlot" | "bulky" | "coinsPerSlot"> | null {
  // The table sits in one column; take its x from the first "… Slots" header.
  let x = -1;
  let i = h + 1;
  for (; i < Math.min(lines.length, h + 4); i++) {
    const m = lines[i].match(/(\S.*?)\s{2,}Slots\s*$/);
    if (m) {
      x = lines[i].indexOf(m[1]);
      break;
    }
  }
  if (x < 0) return null;
  const rows: { label: string; slots: string }[] = [];
  const stop = Math.min(lines.length, i + 40);
  for (i = i + 1; i < stop; i++) {
    const s = lines[i].slice(Math.max(0, x - 2)).trim();
    if (s === "") continue;
    if (/\s{2,}Slots$/.test(s)) continue; // a sub-header (Weapons, Armour)
    const m = s.match(/^(.*?)\s{2,}(\d+(?: [a-z ]+)?)$/);
    if (m) rows.push({ label: m[1], slots: m[2] });
    else if (rows.length > 0 && !/^[A-Z][A-Z ]+$/.test(s)) rows[rows.length - 1].label += ` ${s}`;
    else break;
    if (/^Shield\b/.test(s)) break; // the last armour row ends the table
  }
  const zeroSlot: string[] = [];
  const bulky: string[] = [];
  let coinsPerSlot = 0;
  for (const r of rows) {
    const coins = r.label.match(/^Coins\b.*?up to (\d+)/i);
    if (coins) coinsPerSlot = num(coins[1]);
    const eg = r.label.match(/e\.g\.\s*(.+)$/);
    if (!eg) continue;
    const examples = eg[1]
      .split(/,\s*/)
      .map((e) =>
        e
          .replace(/\(.*?\)/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase(),
      )
      .flatMap((e) => e.split(/\s*\/\s*/))
      .filter(Boolean);
    const n = parseInt(r.slots, 10);
    if (n === 0) zeroSlot.push(...examples);
    else if (n >= 2) bulky.push(...examples);
  }
  return { zeroSlot, bulky, coinsPerSlot };
}

export function singular(w: string): string {
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (/(ch|sh|ss|x)es$/.test(w)) return w.replace(/es$/, "");
  return w.replace(/s$/, "");
}
