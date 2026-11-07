import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParsedClass } from "../src/parse/class.ts";
import type { CatalogItem } from "../src/parse/gear.ts";
import type { ParsedKindred } from "../src/parse/kindred.ts";
import { computeAc, computeLoad } from "../src/party/encumbrance.ts";
import { pcFromSheet } from "../src/party/import.ts";
import { addItem, findItem, makeItem, removeItem, resolveItem } from "../src/party/items.ts";
import { emptyRules, type PartyRules } from "../src/party/rules.ts";
import { grantRune, rollRuneGrant, runeStatus, useRune } from "../src/party/runes.ts";
import {
  blankPc,
  findMember,
  freshParty,
  loadParty,
  type PC,
  saveParty,
} from "../src/party/store.ts";
import { awardParty, canLevel, grantXp, levelUp, xpModifier } from "../src/party/xp.ts";

// An invented catalog and rules set: none of these items, numbers, kindreds,
// or classes come from any book.
const catalog: CatalogItem[] = [
  { name: "Knapsack", kind: "container", weight: 40, section: "CONTAINERS" },
  { name: "Sling bag", kind: "container", weight: 5, section: "CONTAINERS" },
  { name: "Crate (pine)", kind: "container", weight: 60, section: "CONTAINERS" },
  { name: "Cord (40′ long)", kind: "gear", weight: 80, section: "TOOLS" },
  { name: "Cord ladder (20′ long)", kind: "gear", weight: 150, section: "TOOLS" },
  { name: "Wicks (5)", kind: "gear", weight: 15, each: 3, section: "LIGHT" },
  { name: "Biscuits (dry, 1 day)", kind: "gear", weight: 15, section: "FOOD" },
  { name: "Thimble", kind: "gear", weight: 1, section: "TOOLS" },
  { name: "Smock, plain", kind: "clothing", weight: 25, section: "CLOTHING" },
  { name: "Darts (sheaf of 12)", kind: "ammo", weight: 12, section: "AMMUNITION" },
  { name: "Hide", kind: "armour", weight: 150, ac: "11", bulk: "Light", section: "ARMOUR" },
  { name: "Scalework", kind: "armour", weight: 450, ac: "14", bulk: "Medium", section: "ARMOUR" },
  { name: "Bulwark", kind: "armour", weight: 120, ac: "+1", bulk: "None", section: "ARMOUR" },
  { name: "Cleaver", kind: "weapon", weight: 40, damage: "1d6", qualities: "Melee", section: "W" },
  {
    name: "Greatmaul",
    kind: "weapon",
    weight: 150,
    damage: "1d10",
    qualities: "Melee, Two-handed",
    section: "W",
  },
  {
    name: "Hornbow",
    kind: "weapon",
    weight: 30,
    damage: "1d6",
    qualities: "Missile (60′), Two-handed",
    section: "W",
  },
  { name: "Orb", kind: "treasure", weight: 10, section: "TREASURE" },
];

const klass: ParsedClass = {
  id: "warden",
  name: "Warden",
  hitDie: "1d6",
  armour: "Any",
  weapons: "Any",
  primeAbilities: ["wis", "con"],
  attack: 0,
  nextLevelXp: 1000,
  saves: { doom: 12, ray: 13, hold: 14, blast: 15, spell: 16 },
  skills: {},
  languages: [],
  traits: [],
  startingEquipment: null,
  spellBooks: [],
  advancement: [
    {
      level: 1,
      xp: 0,
      hitPoints: "1d6",
      attack: 0,
      saves: { doom: 12, ray: 13, hold: 14, blast: 15, spell: 16 },
      extras: { Charms: "1" },
    },
    {
      level: 2,
      xp: 1000,
      hitPoints: "+1d6",
      attack: 1,
      saves: { doom: 11, ray: 12, hold: 13, blast: 14, spell: 15 },
      extras: { Charms: "2" },
    },
    {
      level: 3,
      xp: 2000,
      hitPoints: "+2",
      attack: 1,
      saves: { doom: 11, ray: 12, hold: 13, blast: 14, spell: 15 },
      extras: { Charms: "2" },
    },
  ],
};

const kindred = { id: "wisp", name: "Wisp", traits: [] } as unknown as ParsedKindred;

function rules(): PartyRules {
  const r = emptyRules();
  r.catalog = catalog;
  r.classes = [klass];
  r.kindreds = [kindred];
  r.kindredXp = { wisp: 10 };
  r.glamours = ["Shimmer Veil", "Hush"];
  r.enc = {
    ...r.enc,
    weight: [
      { max: 300, speed: 40 },
      { max: 500, speed: 30 },
      { max: 900, speed: 20 },
      { max: 1200, speed: 10 },
    ],
    slots: [
      { equipped: 2, stowed: 6, speed: 40 },
      { equipped: 5, stowed: 9, speed: 30 },
      { equipped: 8, stowed: 12, speed: 10 },
    ],
    slotsPerContainer: 8,
    stowContainers: ["knapsack", "sling bag"],
    basic: { none: [40, 30], light: [30, 20], medium: [20, 10], heavy: [20, 10] },
    zeroSlot: ["thimble", "knapsack", "sling bag"],
    bulky: ["crate"],
    coinsPerSlot: 50,
    trinketWeight: 5,
  };
  r.runes = {
    runes: [
      { name: "Mote of Dew", magnitude: "faint" },
      { name: "Lantern Bridge", magnitude: "bright" },
    ],
    usage: {
      faint: [
        { minLevel: 1, maxLevel: 3, text: "Once per day", freq: { count: 1, period: "day" } },
        { minLevel: 4, maxLevel: null, text: "Twice per day", freq: { count: 2, period: "day" } },
      ],
      bright: [
        { minLevel: 1, maxLevel: 3, text: "Once per Level", freq: { count: 1, period: "level" } },
        { minLevel: 4, maxLevel: null, text: "Once per week", freq: { count: 1, period: "week" } },
      ],
    },
    granted: [
      { min: null, max: 20, text: "1 faint rune", magnitude: "faint" },
      { min: 21, max: null, text: "nothing", magnitude: null },
    ],
    levelBonus: [{ minLevel: 2, maxLevel: null, bonus: 1 }],
  };
  return r;
}

function hero(): PC {
  const pc = blankPc("Brindle Oakhew");
  pc.kindred = "wisp";
  pc.class = "warden";
  pc.scores = { str: 10, int: 10, wis: 14, dex: 13, con: 16, cha: 9 };
  return pc;
}

test("resolves free text to catalog entries with quantities", () => {
  expect(resolveItem(catalog, "cord").item?.name).toBe("Cord (40′ long)");
  expect(resolveItem(catalog, "Cord (40') x2")).toMatchObject({ qty: 2, label: "Cord (40')" });
  expect(resolveItem(catalog, "3 cords").qty).toBe(3);
  // "(N)" on a non-bundle is a quantity, and comes off the label.
  expect(resolveItem(catalog, "Biscuits (2)")).toMatchObject({ qty: 2, label: "Biscuits" });
  // On a bundle it's the count left in it; on armour it's the AC.
  expect(resolveItem(catalog, "Darts (7)")).toMatchObject({ qty: 1, note: "7 left" });
  expect(resolveItem(catalog, "Wicks (5)")).toMatchObject({ qty: 1 });
  // A count of pieces of a bundle is counted in bundles.
  expect(resolveItem(catalog, "12 darts")).toMatchObject({ qty: 1 });
  expect(resolveItem(catalog, "30 darts")).toMatchObject({ qty: 3, note: "30 pieces" });
  expect(resolveItem(catalog, "Hide (11)")).toMatchObject({ qty: 1, item: { name: "Hide" } });
  // Dice in parens are dropped; word order and plurals don't matter.
  expect(resolveItem(catalog, "Cleaver (1d6)").item?.name).toBe("Cleaver");
  expect(resolveItem(catalog, "plain smock").item?.name).toBe("Smock, plain");
  // A loose match keeps the player's description.
  expect(resolveItem(catalog, "orb of the drowned king")).toMatchObject({ loose: true });
  expect(resolveItem(catalog, "thimble, needle, thread").item).toBeNull();
  expect(resolveItem(catalog, "unknown widget").item).toBeNull();
});

test("makes items with weight, slots and a default place", () => {
  const r = rules();
  const m = (q: string) => makeItem(catalog, r.enc, q).inv;
  expect(m("greatmaul")).toMatchObject({ weight: 150, slots: 2, where: "equipped" });
  expect(m("hornbow")).toMatchObject({ slots: 1, where: "equipped" }); // missile, though two-handed
  expect(m("scalework").slots).toBe(2);
  expect(m("bulwark").slots).toBe(1);
  expect(m("thimble").slots).toBe(0);
  expect(m("knapsack")).toMatchObject({ slots: 0, where: "stowed" });
  expect(m("smock").slots).toBe(0);
  expect(m("crate")).toMatchObject({ slots: 2, bulky: true, where: "equipped" });
  expect(m("orb")).toMatchObject({ treasure: true });
  expect(m("orb of the drowned king").name).toBe("orb of the drowned king");
});

test("stacks, finds, and removes inventory", () => {
  const r = rules();
  const pc = hero();
  addItem(pc, makeItem(catalog, r.enc, "Cord (40')", { keepName: true }).inv);
  addItem(pc, makeItem(catalog, r.enc, "cord").inv); // same entry → stacks
  expect(pc.items).toHaveLength(1);
  expect(pc.items[0]).toMatchObject({ name: "Cord (40')", qty: 2 });
  addItem(pc, makeItem(catalog, r.enc, "cord ladder").inv);
  expect(findItem(pc, "ladder").name).toBe("Cord ladder (20′ long)");
  expect(() => findItem(pc, "cord")).toThrow(/matches/);
  expect(removeItem(pc, findItem(pc, "cord (40')"), 1)).toBe(1);
  expect(findItem(pc, "cord (40')").qty).toBe(1);
  removeItem(pc, findItem(pc, "ladder"));
  expect(pc.items).toHaveLength(1);
  expect(() => findItem(pc, "anvil")).toThrow(/isn't carrying/);
});

test("weight encumbrance: speed bands, headroom, and the maximum", () => {
  const r = rules();
  const pc = hero();
  addItem(pc, makeItem(catalog, r.enc, "scalework").inv); // 450
  pc.coins.gp = 30;
  let load = computeLoad(pc, "weight", r.enc, catalog);
  expect(load).toMatchObject({ weight: 480, speed: 30, headroom: 20 });
  pc.coins.gp = 800;
  load = computeLoad(pc, "weight", r.enc, catalog);
  expect(load.speed).toBe(0);
  expect(load.problems[0]).toMatch(/max 1200/);
  // Banked coins don't count.
  pc.banked.gp = 790;
  pc.coins.gp = 10;
  expect(computeLoad(pc, "weight", r.enc, catalog).speed).toBe(30);
});

test("slot encumbrance: equipped and stowed separately, containers, bulky", () => {
  const r = rules();
  const pc = hero();
  for (const q of ["scalework", "bulwark", "cleaver"]) addItem(pc, makeItem(catalog, r.enc, q).inv);
  addItem(pc, makeItem(catalog, r.enc, "biscuits", { qty: 7 }).inv); // 7 stowed
  let load = computeLoad(pc, "slots", r.enc, catalog);
  expect(load).toMatchObject({ equippedSlots: 4, stowedSlots: 7, stowedCapacity: 0 });
  expect(load.speed).toBe(30); // equipped 4 → 30; stowed 7 → 30
  expect(load.problems.join()).toMatch(/no backpack or sack/);
  addItem(pc, makeItem(catalog, r.enc, "knapsack").inv);
  pc.coins.sp = 51; // two slots of coins
  load = computeLoad(pc, "slots", r.enc, catalog);
  expect(load).toMatchObject({ stowedSlots: 9, stowedCapacity: 8 });
  expect(load.problems.join()).toMatch(/containers hold 8/);
  const crate = makeItem(catalog, r.enc, "crate").inv;
  crate.where = "stowed";
  addItem(pc, crate);
  expect(computeLoad(pc, "slots", r.enc, catalog).problems.join()).toMatch(/bulky/);
});

test("basic encumbrance goes by the heaviest armour worn", () => {
  const r = rules();
  const pc = hero();
  expect(computeLoad(pc, "basic", r.enc, catalog)).toMatchObject({ speed: 40, ladenSpeed: 30 });
  addItem(pc, makeItem(catalog, r.enc, "hide").inv);
  expect(computeLoad(pc, "basic", r.enc, catalog).speed).toBe(30);
  findItem(pc, "hide").where = "stowed";
  expect(computeLoad(pc, "basic", r.enc, catalog).speed).toBe(40);
});

test("AC comes from worn armour, shield, DEX, and a standing bonus", () => {
  const r = rules();
  const pc = hero(); // DEX 13 → +1
  expect(computeAc(pc, catalog)).toBe(11);
  addItem(pc, makeItem(catalog, r.enc, "scalework").inv);
  addItem(pc, makeItem(catalog, r.enc, "bulwark").inv);
  expect(computeAc(pc, catalog)).toBe(16);
  pc.acBonus = 2;
  expect(computeAc(pc, catalog)).toBe(18);
});

test("XP modifier: lowest prime ability plus kindred bonus", () => {
  const r = rules();
  const pc = hero(); // WIS 14, CON 16 → lowest 14 → +5 (default B/X band) + 10 kindred
  expect(xpModifier(pc, r)).toBe(15);
  pc.scores.wis = 7;
  expect(xpModifier(pc, r)).toBe(0); // −10 + 10
});

test("party XP is split evenly, then modified; retainers earn half", () => {
  const r = rules();
  const party = freshParty();
  const a = hero();
  const b = Object.assign(hero(), { name: "Quill Fennick", kindred: "", retainer: true });
  const c = Object.assign(hero(), { name: "Dead Dob", status: "dead" as const });
  party.members.push(a, b, c);
  const awards = awardParty(party, 2000, r);
  expect(awards.map((x) => [x.pc.name, x.share, x.gained])).toEqual([
    ["Brindle Oakhew", 1000, 1150],
    ["Quill Fennick", 1000, 525], // +5% prime, no kindred bonus, then halved
  ]);
  expect(c.xp).toBe(0);
  expect(awards[0].ready).toBe(true);
  expect(canLevel(a, klass)).toBe(true);
});

test("levelling up rolls HP with CON, takes the new row, and reports changes", () => {
  const pc = hero(); // CON 16 → +2
  pc.hp = pc.maxHp = 6;
  grantXp(pc, 1000, rules());
  const up = levelUp(pc, klass, { hp: 1 });
  expect(up).toMatchObject({ from: 1, to: 2, hpGained: 3, extras: { Charms: ["1", "2"] } });
  expect(pc).toMatchObject({ level: 2, maxHp: 9, hp: 9, attack: 1 });
  expect(pc.saves.doom).toBe(11);
  // A flat gain ignores CON.
  const flat = levelUp(pc, klass);
  expect(flat.hpGained).toBe(2);
  expect(() => levelUp(pc, klass)).toThrow(/no Level 4/);
  // HP from dice is never below 1.
  const weak = Object.assign(hero(), { scores: { ...hero().scores, con: 3 } });
  expect(levelUp(weak, klass, { hp: 1 }).hpGained).toBe(1);
});

test("rune uses follow magnitude, level, and the party day", () => {
  const r = rules();
  const pc = hero();
  const { rune } = grantRune(pc, r.runes.runes[0]);
  expect(runeStatus(rune, pc, 1, r.runes)).toMatchObject({ limit: 1, left: 1 });
  useRune(rune, pc, 1, r.runes);
  expect(() => useRune(rune, pc, 1, r.runes)).toThrow(/no uses/);
  expect(runeStatus(rune, pc, 2, r.runes).left).toBe(1); // a new day
  // A duplicate grant doubles the uses.
  expect(grantRune(pc, r.runes.runes[0]).duplicate).toBe(true);
  expect(runeStatus(rune, pc, 2, r.runes)).toMatchObject({ limit: 2, left: 2 });
  // Once per Level: refreshed by levelling, not by resting.
  const bright = grantRune(pc, r.runes.runes[1]).rune;
  useRune(bright, pc, 2, r.runes);
  expect(runeStatus(bright, pc, 9, r.runes).left).toBe(0);
  pc.level = 2;
  expect(runeStatus(bright, pc, 9, r.runes).left).toBe(1);
  // At level 4 the frequency becomes once per week.
  pc.level = 4;
  useRune(bright, pc, 10, r.runes);
  expect(runeStatus(bright, pc, 16, r.runes).left).toBe(0);
  expect(runeStatus(bright, pc, 17, r.runes).left).toBe(1);
});

test("the rune grant roll adds the level bonus", () => {
  const r = rules();
  for (let i = 0; i < 50; i++) {
    const g = rollRuneGrant(r.runes, 3);
    expect(g.bonus).toBe(1);
    expect(g.total).toBe(g.dice + 1);
    expect(g.entry?.magnitude).toBe("faint");
  }
});

test("imports a filled-in sheet's fields", () => {
  const fields: Record<string, string> = {
    Name: "Brindle Oakhew",
    "Kindred & Class": " Warden",
    "Kindred & Class Traits 1": "Wisp Abilities: Floating",
    Background: "Lamplighter",
    Alignment: "Neutral",
    Strength: "9",
    Intelligence: "11",
    Wisdom: "14",
    Dexterity: "13",
    Constitution: "16",
    Charisma: "8",
    "Max Hit Points": "7",
    "Hit Points": "5",
    Doom: "12",
    Ray: "13",
    Hold: "14",
    Blast: "15",
    Spell: "16",
    "Magic Resistance": "+1",
    "Armour Class": "14",
    Attack: "+0",
    Listen: "5",
    "Extra Skill 1": "Lamp Lore. 4",
    "Languages 1": "Woldspeak, Glimmer",
    "Languages 2": "1 additional",
    Level: "1",
    XP: "120",
    "Equipped Item 1": "Hide (11)",
    "Equipped Item Weight 1": "150",
    "Equipped Item 2": "Bulwark",
    "Equipped Item Weight 2": "0",
    "Stowed Item 1": "Cord (40') x2",
    "Stowed Item 2": "Biscuits (3)",
    "Stowed Item 3": "Lucky pebble pouch",
    "Stowed Item Weight 3": "7",
    "Tiny Items": "A bead that hums.",
    "Gold Pieces": "12",
    "Silver Pieces": "4",
    "Slot Encumbrance": "Yes",
    "Weight Encumbrance": "Off",
    "Other Notes":
      "Glamours: shimmer veil, Hush\r\nRune: Mote of dew\r\nAge: 40\r\nKnack: Lamp-wise",
  };
  const r = rules();
  const { pc, messages, encumbrance } = pcFromSheet(fields, r);
  expect(pc).toMatchObject({
    name: "Brindle Oakhew",
    kindred: "wisp",
    class: "warden",
    background: "Lamplighter",
    hp: 5,
    maxHp: 7,
    xp: 120,
    magicResistance: 1,
    languages: ["Woldspeak", "Glimmer"],
    skills: { Listen: 5, "Lamp Lore": 4 },
    coins: { gp: 12, sp: 4, cp: 0, pp: 0 },
    glamours: ["Shimmer Veil", "Hush"],
    knacks: ["Lamp-wise"],
    notes: ["Age: 40"],
  });
  expect(pc.runes).toEqual([{ name: "Mote of Dew", magnitude: "faint", times: 1, uses: [] }]);
  expect(pc.items.map((i) => [i.name, i.qty, i.weight, i.where])).toEqual([
    ["Hide (11)", 1, 150, "equipped"],
    ["Bulwark", 1, 120, "equipped"],
    ["Cord (40')", 2, 80, "stowed"],
    ["Biscuits", 3, 15, "stowed"],
    ["Lucky pebble pouch", 1, 7, "stowed"],
    ["A bead that hums.", 1, 5, "stowed"],
  ]);
  expect(messages.some((m) => /Bulwark: sheet says 0/.test(m))).toBe(true);
  expect(messages.some((m) => /Lucky pebble pouch.*isn't in the book/.test(m))).toBe(true);
  expect(encumbrance).toBe("slots");
  // Sheet AC 14 = hide 11 + bulwark 1 + DEX 1 + a standing +1.
  expect(pc.acBonus).toBe(1);
  expect(computeAc(pc, catalog)).toBe(14);
});

const dir = mkdtempSync(join(tmpdir(), "dw-party-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("saves and loads the party file, filling fields added later", () => {
  process.env.DW_PARTY = join(dir, "party.json");
  const party = freshParty();
  party.members.push(hero());
  saveParty(party);
  expect(loadParty().members[0].name).toBe("Brindle Oakhew");
  // An older file missing newer fields still loads.
  writeFileSync(process.env.DW_PARTY, JSON.stringify({ members: [{ name: "Old Timer", xp: 5 }] }));
  const old = loadParty();
  expect(old.encumbrance).toBe("weight");
  expect(old.members[0]).toMatchObject({ name: "Old Timer", xp: 5, items: [], runes: [] });
  // A corrupt file is an error, never silently replaced.
  writeFileSync(process.env.DW_PARTY, "{ not json");
  expect(() => loadParty()).toThrow(/not valid JSON/);
  delete process.env.DW_PARTY;
});

test("finds members by any unambiguous part of the name", () => {
  const party = freshParty();
  party.members.push(hero(), Object.assign(hero(), { name: "Bramble Oakhew" }));
  expect(findMember(party, "brindle").name).toBe("Brindle Oakhew");
  expect(findMember(party, "bram").name).toBe("Bramble Oakhew");
  expect(() => findMember(party, "oakhew")).toThrow(/matches/);
  expect(() => findMember(party, "zed")).toThrow(/No party member/);
});
