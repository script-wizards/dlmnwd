// The party: the player characters a table is running, persisted as one JSON
// file on this machine. This is campaign state the user creates, not something
// derived from the books, so it lives in the user's data directory rather than
// the cache: $DW_PARTY → $XDG_DATA_HOME/dw/party.json → ~/.local/share/dw/party.json.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const ABILITIES = ["str", "int", "wis", "dex", "con", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export type Where = "equipped" | "stowed";

export interface InvItem {
  /** As the player wrote it (or the catalog name when added by lookup). */
  name: string;
  /** The equipment-list entry it resolved to, when it did. */
  ref?: string;
  qty: number;
  /** Weight in coins of one unit. */
  weight: number;
  /** Gear slots one unit occupies (slot encumbrance). */
  slots: number;
  where: Where;
  /** Counts as treasure (basic encumbrance), e.g. a gem or a potion. */
  treasure?: boolean;
  /** Bulky (two hands to carry): can't be stowed in a container. */
  bulky?: boolean;
  note?: string;
}

export interface Coins {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}

export const COIN_KINDS = ["pp", "gp", "sp", "cp"] as const;
export type CoinKind = (typeof COIN_KINDS)[number];

export interface KnownRune {
  name: string;
  magnitude: string;
  /** Usage multiplier: a duplicate grant doubles the uses allowed. */
  times: number;
  /** Each use, stamped with the party day and the caster's level at the time. */
  uses: { day: number; level: number }[];
}

export interface Saves {
  doom: number;
  ray: number;
  hold: number;
  blast: number;
  spell: number;
}

export interface PC {
  name: string;
  player: string;
  kindred: string; // kindred id
  class: string; // class id
  level: number;
  xp: number;
  alignment: string;
  background: string;
  moonSign: string;
  affiliation: string;
  scores: Record<Ability, number>;
  hp: number;
  maxHp: number;
  /** AC on top of worn armour + shield + DEX (natural armour, magic, …). */
  acBonus: number;
  attack: number;
  saves: Saves;
  magicResistance: number;
  skills: Record<string, number>;
  languages: string[];
  items: InvItem[];
  coins: Coins;
  /** Coins held somewhere safe (not carried, no encumbrance). */
  banked: Coins;
  glamours: string[];
  runes: KnownRune[];
  spells: string[];
  knacks: string[];
  notes: string[];
  /** An adventurer retainer: counts for XP division, earns half. */
  retainer: boolean;
  status: "active" | "retired" | "dead";
}

export type EncMethod = "weight" | "slots" | "basic";
export const ENC_METHODS: EncMethod[] = ["weight", "slots", "basic"];

export interface Party {
  version: 1;
  encumbrance: EncMethod;
  /** Days elapsed in the campaign; rune usage periods count against it. */
  day: number;
  members: PC[];
}

export function emptyCoins(): Coins {
  return { cp: 0, sp: 0, gp: 0, pp: 0 };
}

export function freshParty(): Party {
  return { version: 1, encumbrance: "weight", day: 1, members: [] };
}

/** A blank PC with every field present, for importers to fill in. */
export function blankPc(name: string): PC {
  return {
    name,
    player: "",
    kindred: "",
    class: "",
    level: 1,
    xp: 0,
    alignment: "",
    background: "",
    moonSign: "",
    affiliation: "",
    scores: { str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 },
    hp: 1,
    maxHp: 1,
    acBonus: 0,
    attack: 0,
    saves: { doom: 0, ray: 0, hold: 0, blast: 0, spell: 0 },
    magicResistance: 0,
    skills: {},
    languages: [],
    items: [],
    coins: emptyCoins(),
    banked: emptyCoins(),
    glamours: [],
    runes: [],
    spells: [],
    knacks: [],
    notes: [],
    retainer: false,
    status: "active",
  };
}

export function partyPath(): string {
  const env = process.env.DW_PARTY?.trim();
  if (env) return env;
  const base = process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
  return join(base, "dw", "party.json");
}

export function loadParty(): Party {
  const path = partyPath();
  if (!existsSync(path)) return freshParty();
  let raw: Partial<Party>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    // Never silently replace a party file we can't read: it is the user's data.
    throw new Error(
      `Party file ${path} is not valid JSON (${(e as Error).message}); fix or move it.`,
      { cause: e },
    );
  }
  if (!Array.isArray(raw.members)) throw new Error(`Party file ${path} has no members list.`);
  return {
    ...freshParty(),
    ...raw,
    // Fill fields added after a PC was saved, so older files keep working.
    members: raw.members.map((m) => Object.assign(blankPc(m.name), m)),
  };
}

/** Write atomically (temp file + rename) so a crash can't truncate the party. */
export function saveParty(party: Party): void {
  const path = partyPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(party, null, 2) + "\n");
  renameSync(tmp, path);
}

/** Find a member by name: exact, then prefix, then substring (case-insensitive),
 *  matching whole name or any word of it. Throws on no match or an ambiguity. */
export function findMember(party: Party, query: string): PC {
  const q = query.trim().toLowerCase();
  const all = party.members;
  const tiers = [
    all.filter((m) => m.name.toLowerCase() === q),
    all.filter(
      (m) =>
        m.name.toLowerCase().startsWith(q) ||
        m.name
          .toLowerCase()
          .split(/\s+/)
          .some((w) => w.startsWith(q)),
    ),
    all.filter((m) => m.name.toLowerCase().includes(q)),
  ];
  for (const hits of tiers) {
    if (hits.length === 1) return hits[0];
    if (hits.length > 1)
      throw new Error(
        `"${query}" matches ${hits.map((m) => m.name).join(", ")}; be more specific.`,
      );
  }
  const names = all.map((m) => m.name).join(", ") || "(the party is empty)";
  throw new Error(`No party member matches "${query}". Members: ${names}`);
}

export function activeMembers(party: Party): PC[] {
  return party.members.filter((m) => m.status === "active");
}
