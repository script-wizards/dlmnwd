// Work out a character's load and Speed under the table's encumbrance method,
// and flag anything over a limit. Pure: rules are passed in.

import type { CatalogItem, EncumbranceRules } from "../parse/gear.ts";
import { abilityMod } from "../rules.ts";
import type { Coins, EncMethod, PC } from "./store.ts";

export interface Load {
  method: EncMethod;
  /** Total weight carried, in coins (items + coins). */
  weight: number;
  coinCount: number;
  equippedSlots: number;
  stowedSlots: number;
  /** Stowed slots the carried containers provide (slot method). */
  stowedCapacity: number;
  speed: number;
  /** Basic method: the Speed while hauling significant treasure. */
  ladenSpeed?: number;
  /** Rules broken (over a maximum, bulky item stowed, …). */
  problems: string[];
  /** Weight method: coins of headroom before Speed drops; null at the last band. */
  headroom: number | null;
}

export function coinCount(c: Coins): number {
  return c.cp + c.sp + c.gp + c.pp;
}

export function itemsWeight(pc: PC): number {
  return pc.items.reduce((sum, i) => sum + i.qty * i.weight, 0);
}

function slotSpeed(enc: EncumbranceRules, used: number, key: "equipped" | "stowed"): number {
  const band = enc.slots.find((b) => used <= b[key]);
  return band ? band.speed : 0;
}

export function computeLoad(
  pc: PC,
  method: EncMethod,
  enc: EncumbranceRules,
  catalog: CatalogItem[] = [],
): Load {
  const coins = coinCount(pc.coins);
  const weight = itemsWeight(pc) + coins;
  const problems: string[] = [];
  const equippedSlots = pc.items
    .filter((i) => i.where === "equipped")
    .reduce((s, i) => s + i.qty * i.slots, 0);
  const coinSlots = enc.coinsPerSlot > 0 ? Math.ceil(coins / enc.coinsPerSlot) : 0;
  const stowedSlots =
    pc.items.filter((i) => i.where === "stowed").reduce((s, i) => s + i.qty * i.slots, 0) +
    coinSlots;
  const holders = pc.items
    .filter((i) =>
      enc.stowContainers.some((w) => new RegExp(`^${w}s?\\b`, "i").test(i.ref ?? i.name)),
    )
    .reduce((n, i) => n + i.qty, 0);
  const maxStowed = enc.slots.at(-1)?.stowed ?? 0;
  const stowedCapacity = Math.min(holders * enc.slotsPerContainer, maxStowed || Infinity);
  const base: Omit<Load, "speed" | "headroom"> = {
    method,
    weight,
    coinCount: coins,
    equippedSlots,
    stowedSlots,
    stowedCapacity,
    problems,
  };

  if (method === "slots") {
    if (enc.slots.length === 0) {
      problems.push("the book's slot encumbrance table wasn't found; Speed not checked");
      return { ...base, speed: 0, headroom: null };
    }
    const maxEquipped = enc.slots.at(-1)!.equipped;
    if (equippedSlots > maxEquipped)
      problems.push(`${equippedSlots} equipped slots (max ${maxEquipped})`);
    if (stowedSlots > maxStowed) problems.push(`${stowedSlots} stowed slots (max ${maxStowed})`);
    else if (stowedSlots > stowedCapacity)
      problems.push(
        `${stowedSlots} stowed slots but containers hold ${stowedCapacity}` +
          (holders === 0 ? " (no backpack or sack)" : ""),
      );
    for (const i of pc.items)
      if (i.where === "stowed" && i.bulky) problems.push(`${i.name} is bulky and can't be stowed`);
    const speed = Math.min(
      slotSpeed(enc, equippedSlots, "equipped"),
      slotSpeed(enc, stowedSlots, "stowed"),
    );
    return { ...base, speed, headroom: null };
  }

  if (method === "basic") {
    const bulk = armourBulk(pc, catalog);
    const [free, laden] = enc.basic[bulk] ?? enc.basic.none ?? [40, 30];
    const treasure =
      coins + pc.items.filter((i) => i.treasure).reduce((s, i) => s + i.qty * i.weight, 0);
    const max = enc.weight.at(-1)?.max ?? Infinity;
    if (treasure > max) problems.push(`${treasure} coins of treasure (max ${max}): can't move`);
    return { ...base, speed: treasure > max ? 0 : free, ladenSpeed: laden, headroom: null };
  }

  // Weight.
  const band = enc.weight.find((b) => weight <= b.max);
  const max = enc.weight.at(-1)?.max ?? Infinity;
  if (!band) problems.push(`${weight} coins carried (max ${max}): can't move`);
  return {
    ...base,
    speed: band ? band.speed : 0,
    headroom: band && band !== enc.weight.at(-1) ? band.max - weight : null,
  };
}

/** The bulk of the heaviest armour worn ("none" when unarmoured). */
export function armourBulk(pc: PC, catalog: CatalogItem[]): string {
  const order = ["none", "light", "medium", "heavy"];
  let best = "none";
  for (const i of pc.items) {
    if (i.where !== "equipped") continue;
    const bulk = catalog.find((c) => c.name === i.ref)?.bulk?.toLowerCase();
    if (bulk && order.indexOf(bulk) > order.indexOf(best)) best = bulk;
  }
  return best;
}

/** AC from worn gear: the best armour's AC (10 unarmoured), plus a shield,
 *  plus the DEX modifier, plus any other bonus recorded on the character. */
export function computeAc(pc: PC, catalog: CatalogItem[]): number {
  let armour = 10;
  let shield = 0;
  for (const i of pc.items) {
    if (i.where !== "equipped") continue;
    const c = catalog.find((x) => x.name === i.ref);
    if (!c || c.kind !== "armour" || !c.ac) continue;
    const ac = parseInt(c.ac.replace("+", ""), 10);
    if (c.ac.startsWith("+")) shield = Math.max(shield, ac);
    else armour = Math.max(armour, ac);
  }
  return armour + shield + abilityMod(pc.scores.dex) + pc.acBonus;
}

/** One-line summary: "777 coins → Speed 20 (23 to spare)". */
export function describeLoad(load: Load): string {
  const speed = load.speed > 0 ? `Speed ${load.speed}` : "can't move";
  if (load.method === "slots") {
    const cap = load.stowedCapacity ? `/${load.stowedCapacity}` : "";
    return `${load.equippedSlots} equipped, ${load.stowedSlots}${cap} stowed slots → ${speed}`;
  }
  if (load.method === "basic") {
    const laden =
      load.ladenSpeed !== undefined && load.speed > 0
        ? ` (${load.ladenSpeed} hauling treasure)`
        : "";
    return `armour and treasure → ${speed}${laden}`;
  }
  const spare = load.headroom !== null ? ` (${load.headroom} to spare)` : "";
  return `${load.weight} coins → ${speed}${spare}`;
}
