// Resolve what a player writes ("rope", "Longbow (d6)", "Rations (2)",
// "Common clothes") to an entry in the book's equipment lists, and work out
// each item's weight and gear slots. Pure: the catalog is passed in.

import type { CatalogItem, EncumbranceRules } from "../parse/gear.ts";
import { singular } from "../parse/gear.ts";
import { SLOT_COST } from "../rules.ts";
import type { InvItem, PC, Where } from "./store.ts";

const STOP = new Set(["of", "and", "or", "the", "a", "an", "with"]);

/** Fold quote/prime variants and case so "50'" matches "50′". */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[′’'`]/g, "'")
    .replace(/[″"]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Content words, plural-folded. A catalog entry keeps the words in its parens
 *  ("Paper (2 sheets)" matches "sheets of paper"); a query drops them, since
 *  there they're counts, dice, or the player's own notes. */
function words(s: string, keepParens = false): string[] {
  const t = norm(s);
  return (keepParens ? t : t.replace(/\([^)]*\)/g, " "))
    .split(/[^a-z']+/)
    .map((w) => singular(w.replace(/'s$/, "")))
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

export interface Resolved {
  item: CatalogItem | null;
  qty: number;
  /** The query with any quantity marker taken out ("Rope (50') x2" → "Rope (50')"). */
  label: string;
  /** What the query said beyond the item itself, e.g. "(14)" left in a quiver. */
  note?: string;
  /** Matched only loosely (the entry's name inside a longer description). */
  loose?: boolean;
}

/** A catalog entry sold as a bundle names its size: "(quiver of 20)", "(10)". */
function bundleSize(item: CatalogItem): number {
  const m = item.name.match(/\((?:[a-z ]+of )?(\d+)(?: [a-z]+)?\)/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Resolve a free-text item to a catalog entry plus a quantity.
 *  - "x2", "×2", "2x", "2 ropes" set the quantity;
 *  - a trailing "(N)" is a quantity, unless the entry is armour (where it's the
 *    AC) or a bundle (where it's the count left in it, kept as a note);
 *  - dice in parens ("(d6)", "(1d8)") are dropped.
 * Matching: exact name, then every query word found in the entry (fewest extra
 * words wins), then an entry whose single word appears in the query.
 */
export function resolveItem(catalog: CatalogItem[], query: string): Resolved {
  let q = norm(query).replace(/\(\s*\d*d\d+\s*\)/g, " ");
  let label = query.trim();
  let qty = 1;
  let note: string | undefined;
  const TIMES = /(?:^|\s)[x×]\s*(\d+)\s*$|(?:^|\s)(\d+)\s*[x×](?:\s|$)/i;
  const times = q.match(TIMES);
  if (times) {
    qty = parseInt(times[1] ?? times[2], 10);
    q = q.replace(times[0], " ");
    label = label.replace(TIMES, " ").trim();
  }
  const lead = q.match(/^(\d+)\s+(?=[a-z])/);
  let pieces = 0;
  if (lead) {
    qty = parseInt(lead[1], 10);
    pieces = qty;
    q = q.slice(lead[0].length);
    label = label.replace(/^\d+\s+/, "");
  }
  const paren = q.match(/\((\d+)\)\s*$/);
  const qName = paren ? q.slice(0, paren.index).trim() : q.trim();

  const hit = matchCatalog(catalog, q.trim()) ?? matchCatalog(catalog, qName);
  const item = hit?.item ?? null;
  if (paren && item) {
    const n = parseInt(paren[1], 10);
    const bundle = bundleSize(item);
    const bare = label.replace(/\s*\(\d+\)\s*$/, "");
    if (item.kind === "armour") {
      // "(12)" after armour is its AC, not a count.
    } else if (bundle > 1 && n !== bundle) {
      note = `${n} left`;
      label = bare;
    } else if (bundle === 0 && !norm(item.name).includes(`(${n})`)) {
      qty = n;
      label = bare;
    }
  }
  // "20 arrows" is pieces of a bundle sold as "(quiver of 20)": count bundles.
  const size = item ? bundleSize(item) : 0;
  if (pieces && size > 1) {
    qty = Math.ceil(pieces / size);
    if (pieces % size) note = `${pieces} pieces`;
  }
  return { item, qty, label, note, loose: hit?.loose };
}

function matchCatalog(
  catalog: CatalogItem[],
  q: string,
): { item: CatalogItem; loose?: boolean } | null {
  if (!q) return null;
  const exact = catalog.find((c) => norm(c.name) === q);
  if (exact) return { item: exact };
  const qw = words(q);
  if (qw.length === 0) return null;

  let best: { item: CatalogItem; extra: number } | null = null;
  for (const c of catalog) {
    const cw = words(c.name, true);
    if (!qw.every((w) => cw.includes(w))) continue;
    const extra = cw.length - qw.length;
    if (!best || extra < best.extra) best = { item: c, extra };
  }
  if (best) return { item: best.item };

  // "wand of 9 charges" → Wand. Not for lists ("ink, quill, paper"), which name
  // several things.
  if (q.includes(",")) return null;
  const single = catalog.filter((c) => {
    const cw = words(c.name);
    return cw.length === 1 && qw.includes(cw[0]);
  });
  return single.length === 1 ? { item: single[0], loose: true } : null;
}

/** Does a free-text example from the gear-slots table ("holy symbol") name this item? */
function exampleMatches(examples: string[], name: string): boolean {
  const n = norm(name)
    .replace(/\([^)]*\)/g, "")
    .trim();
  return examples.some((e) => {
    const ex = norm(e);
    return n === ex || n.startsWith(`${ex} `) || singular(n) === singular(ex);
  });
}

/** Gear slots one unit of an item occupies. */
export function slotCost(item: CatalogItem | null, name: string, enc: EncumbranceRules): number {
  const label = item?.name ?? name;
  if (exampleMatches(enc.zeroSlot, label)) return 0;
  if (exampleMatches(enc.bulky, label)) return SLOT_COST.bulky;
  if (!item) return SLOT_COST.general;
  switch (item.kind) {
    case "clothing":
      return 0;
    case "ammo":
      return SLOT_COST.ammo;
    case "armour": {
      if ((item.ac ?? "").startsWith("+")) return SLOT_COST.shield;
      return SLOT_COST.armour[(item.bulk ?? "").toLowerCase()] ?? 0;
    }
    case "weapon": {
      const q = item.qualities ?? "";
      const melee = /\bMelee\b/.test(q);
      if (/\bTwo-handed\b/.test(q)) return melee ? SLOT_COST.twoHanded : SLOT_COST.missile;
      return melee ? SLOT_COST.oneHanded : SLOT_COST.missile;
    }
    default:
      return SLOT_COST.general;
  }
}

/** Weapons, armour and shields are carried ready; everything else is packed. */
export function defaultWhere(item: CatalogItem | null): Where {
  return item && (item.kind === "weapon" || item.kind === "armour") ? "equipped" : "stowed";
}

export interface NewItemOpts {
  qty?: number;
  where?: Where;
  weight?: number;
  slots?: number;
  treasure?: boolean;
  /** Keep the player's own label rather than the catalog name. */
  keepName?: boolean;
}

/** Build an inventory entry from free text, resolved against the catalog. */
export function makeItem(
  catalog: CatalogItem[],
  enc: EncumbranceRules,
  query: string,
  opts: NewItemOpts = {},
): { inv: InvItem; resolved: Resolved } {
  const resolved = resolveItem(catalog, query);
  const { item } = resolved;
  const inv: InvItem = {
    name: opts.keepName || !item || resolved.loose ? resolved.label : item.name,
    qty: opts.qty ?? resolved.qty,
    weight: opts.weight ?? item?.weight ?? 0,
    slots: opts.slots ?? slotCost(item, query, enc),
    where: opts.where ?? defaultWhere(item),
  };
  if (item) inv.ref = item.name;
  if (resolved.note) inv.note = resolved.note;
  if (opts.treasure ?? item?.kind === "treasure") inv.treasure = true;
  if (exampleMatches(enc.bulky, item?.name ?? query)) {
    inv.bulky = true;
    if (!opts.where) inv.where = "equipped"; // carried in hand, not packed
  }
  return { inv, resolved };
}

/** Add an entry, stacking onto the same item already carried in the same place
 *  (same book entry, or the same name when it has none). */
export function addItem(pc: PC, inv: InvItem): InvItem {
  const same = pc.items.find(
    (i) =>
      (i.name === inv.name || (!!inv.ref && inv.name === inv.ref && i.ref === inv.ref)) &&
      i.where === inv.where &&
      i.weight === inv.weight &&
      !i.note,
  );
  if (same && !inv.note) {
    same.qty += inv.qty;
    return same;
  }
  pc.items.push(inv);
  return inv;
}

/** Find a carried item by name: exact, prefix, word-prefix, then substring. */
export function findItem(pc: PC, query: string): InvItem {
  const q = norm(query);
  const all = pc.items;
  const tiers = [
    all.filter((i) => norm(i.name) === q || (i.ref && norm(i.ref) === q)),
    all.filter((i) => norm(i.name).startsWith(q)),
    all.filter((i) =>
      norm(i.name)
        .split(/[^a-z']+/)
        .some((w) => w.startsWith(q)),
    ),
    all.filter((i) => norm(i.name).includes(q)),
  ];
  for (const hits of tiers) {
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      // The same item in two places (or stacks) is one thing to the player.
      if (hits.every((h) => h.name === hits[0].name || (h.ref && h.ref === hits[0].ref)))
        return hits[0];
      throw new Error(
        `"${query}" matches ${hits.map((i) => i.name).join(", ")}; be more specific.`,
      );
    }
  }
  throw new Error(`${pc.name} isn't carrying anything matching "${query}".`);
}

/** Remove qty of an item (all of it when qty is omitted). Returns what was removed. */
export function removeItem(pc: PC, inv: InvItem, qty?: number): number {
  const n = Math.min(qty ?? inv.qty, inv.qty);
  inv.qty -= n;
  if (inv.qty <= 0) pc.items = pc.items.filter((i) => i !== inv);
  return n;
}
