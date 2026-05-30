import { roll } from "../dice.ts";
import type { EquipmentOption, ParsedClass, SpellBook } from "../parse/class.ts";
import type { GlamourEntry } from "../parse/glamour.ts";
import type { KnackEntry } from "../parse/knack.ts";
import type { KindredPhysical, ParsedKindred } from "../parse/kindred.ts";
import { parseStatBlock, structureTrait, type Trait } from "../parse/traits.ts";
import { abilityMod } from "../rules.ts";
import { pick } from "../util.ts";

const ABILITIES = ["str", "int", "wis", "dex", "con", "cha"] as const;
type Ability = (typeof ABILITIES)[number];

const ABILITY_LABEL: Record<Ability, string> = {
  str: "Strength",
  int: "Intelligence",
  wis: "Wisdom",
  dex: "Dexterity",
  con: "Constitution",
  cha: "Charisma",
};

// Ascending AC by armour. Mechanics, not flavour.
const ARMOUR_AC: Record<string, number> = { none: 10, leather: 12, chainmail: 14, plate: 16 };

interface Loadout {
  armour: string; // display name
  ac: number; // total AC: armour + shield + Dex + kindred bonus
  baseAc: number; // AC from the worn equipment alone (armour + shield)
  shield: boolean;
}

/** Pick a sensible default loadout: the heaviest armour the class allows, plus a
 *  shield if permitted. The player can swap to their rolled starting gear. */
function defaultLoadout(klass: ParsedClass, furArmourBonus: number, dexMod: number): Loadout {
  const allows = klass.armour.toLowerCase();
  let armourKey = "none";
  if (/heavy|\bany\b/.test(allows)) armourKey = "plate";
  else if (/medium/.test(allows)) armourKey = "chainmail";
  else if (/light/.test(allows)) armourKey = "leather";

  const shield = /shield/.test(allows) && !/no shields?/.test(allows);
  // A natural-armour bonus applies only with light or no armour.
  const fur =
    furArmourBonus && (armourKey === "none" || armourKey === "leather") ? furArmourBonus : 0;
  const baseAc = ARMOUR_AC[armourKey] + (shield ? 1 : 0);
  const ac = baseAc + dexMod + fur;

  const name = armourKey === "none" ? "No armour" : capitalize(armourKey);
  return { armour: shield ? `${name} + shield` : name, ac, baseAc, shield };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Roll a d6 and pick the matching option from the table. */
function rollOption(options: EquipmentOption[]): string {
  if (options.length === 0) return "";
  const die = roll("1d6").total;
  for (const opt of options) {
    if (opt.roll.includes("-")) {
      const [lo, hi] = opt.roll.split("-").map((n) => parseInt(n, 10));
      if (die >= lo && die <= hi) return opt.item;
    } else if (parseInt(opt.roll, 10) === die) {
      return opt.item;
    }
  }
  return options[options.length - 1].item;
}

/** Roll the class's starting equipment. Falls back to the default loadout
 *  (heaviest armour + shield) when the PDF parse didn't produce a table. */
function rollEquipment(
  klass: ParsedClass,
  furArmourBonus: number,
  dexMod: number,
): { loadout: Loadout; weapons: string[]; classItems: string[] } {
  const se = klass.startingEquipment;
  if (!se) {
    return {
      loadout: defaultLoadout(klass, furArmourBonus, dexMod),
      weapons: [],
      classItems: [],
    };
  }

  const armourRoll = rollOption(se.armour);
  const weapon1 = rollOption(se.weapons);
  // Roll a second weapon (the table says "roll 1d6 twice"); deduplicate.
  let weapon2 = rollOption(se.weapons);
  if (weapon2 === weapon1) weapon2 = "";

  const weapons = [weapon1, weapon2].filter(Boolean);

  // Compute AC from the rolled armour.
  const loadout = parseRolledArmour(armourRoll, furArmourBonus, dexMod);

  return { loadout, weapons, classItems: se.classItems };
}

/** Map a rolled armour string to a Loadout with AC. */
function parseRolledArmour(armour: string, furArmourBonus: number, dexMod: number): Loadout {
  const a = armour.toLowerCase();
  let armourKey = "none";
  if (/plate/.test(a)) armourKey = "plate";
  else if (/chain/.test(a)) armourKey = "chainmail";
  else if (/leather/.test(a)) armourKey = "leather";

  const shield = /shield/.test(a);
  const fur =
    furArmourBonus && (armourKey === "none" || armourKey === "leather") ? furArmourBonus : 0;
  const baseAc = ARMOUR_AC[armourKey] + (shield ? 1 : 0);
  const ac = baseAc + dexMod + fur;

  const name = armour === "None" || armour === "" ? "No armour" : armour;
  return { armour: name, ac, baseAc, shield };
}

// Number of glamours known at level 1 by class.
const CLASS_GLAMOURS: Record<string, number> = {
  enchanter: 1,
};

// Kindreds that get a free glamour.
const KINDRED_GLAMOUR_KINDREDS = new Set(["elf", "grimalkin"]);

// Kindreds that know a rolled knack at level 1.
const KINDRED_KNACK_KINDREDS = new Set(["mossling"]);

// Kindreds that roll a Symbiotic Flesh infestation at each level (from level 1).
const KINDRED_SYMBIOTIC_FLESH_KINDREDS = new Set(["mossling"]);

/** A level-1 character's rolled physical description. */
export interface Physique {
  age: string;
  height: string;
  weight: string;
  lifespan: string;
}

/** Roll a "base + NdX [× M] unit" expression to a concrete value. A "× M"
 *  multiplier applies to the dice term; an expression with no dice is returned
 *  verbatim. */
function rollLinear(expr: string): string {
  const t = expr.trim();
  if (!/\d*d\d+/.test(t)) return t;
  const unit = t.match(/(years?|lbs?)\s*$/i)?.[0].trim() ?? "";
  const core = t.replace(/(years?|lbs?)\s*$/i, "").trim();
  const dice = core.match(/\d*d\d+/)?.[0] ?? "";
  const mult = core.match(/[×x]\s*(\d+)/);
  const total = mult
    ? parseInt(
        core
          .replace(/\d*d\d+/, "")
          .replace(/[×x]\s*\d+/, "")
          .replace(/\+/g, "")
          .trim() || "0",
        10,
      ) +
      roll(dice).total * parseInt(mult[1], 10)
    : roll(core).total;
  return unit ? `${total} ${unit}` : `${total}`;
}

/** Roll a feet/inches height expression to a concrete height, keeping the size
 *  class. Gendered variants resolve to the one matching the rolled name's gender
 *  (or a random variant when gender is unknown). */
function rollHeight(expr: string, gender: Gender): string {
  let t = expr.trim();
  if (/\b(?:Male|Female):/i.test(t)) {
    // Split on the whitespace before each label; a plain lookahead would fire on
    // the "male" inside "Female".
    const parts = t.split(/\s+(?=(?:Male|Female):)/i).filter(Boolean);
    const chosen =
      (gender && parts.find((p) => new RegExp(`^${gender}:`, "i").test(p))) || pick(parts);
    t = chosen.replace(/^(?:Male|Female):\s*/i, "");
  }
  const size = t.match(/\(([^)]+)\)/)?.[1] ?? null;
  const feet = parseInt(t.match(/(\d+)′/)?.[1] ?? "0", 10);
  const baseInches = parseInt(t.split(/\d*d\d+/)[0].match(/′\s*(\d+)″/)?.[1] ?? "0", 10);
  const dice = t.match(/\d*d\d+/)?.[0];
  const inches = feet * 12 + baseInches + (dice ? roll(dice).total : 0);
  const h = `${Math.floor(inches / 12)}′${inches % 12}″`;
  return size ? `${h} (${size})` : h;
}

// Physical appearance persona fields belong with the rolled body stats; the
// rest read best in this order. Shared with the sheet renderer.
export const APPEARANCE_FIELDS = ["head", "face", "body"];
export const PERSONA_ORDER = ["speech", "demeanour", "dress", "desires", "beliefs"];

/** One-line physique summary (rolled body stats + appearance persona fields),
 *  empty fields dropped. */
export function physiqueSummary(
  physique: Physique | undefined,
  persona: Record<string, string>,
): string {
  return [
    physique?.age && `Age ${physique.age}`,
    physique?.height && `Height ${physique.height}`,
    physique?.weight && `Weight ${physique.weight}`,
    physique?.lifespan && `Lifespan ${physique.lifespan}`,
    ...APPEARANCE_FIELDS.map((f) => persona[f] && `${capitalize(f)} ${persona[f]}`),
  ]
    .filter(Boolean)
    .join(", ");
}

/** A rolled name's gender, when the name table is gendered (human); null for a
 *  unisex name or an ungendered kindred. */
type Gender = "Male" | "Female" | null;

/** Roll the kindred's physical stat block for a level-1 PC. Height follows the
 *  rolled name's gender where the kindred has gendered heights. */
function buildPhysique(
  physical: KindredPhysical | undefined,
  gender: Gender,
): Physique | undefined {
  if (!physical) return undefined;
  return {
    age: physical.age ? rollLinear(physical.age) : "",
    height: physical.height ? rollHeight(physical.height, gender) : "",
    weight: physical.weight ? rollLinear(physical.weight) : "",
    lifespan: physical.lifespan ? rollLinear(physical.lifespan) : "",
  };
}

/**
 * Build the spells and glamours a level-1 character knows. Magicians get full
 * spell details looked up from the parsed spell index for their starting spell
 * book; enchanters and kindreds with innate glamours roll from the glamours
 * table, with descriptions attached when available.
 */
function buildMagic(
  klass: ParsedClass,
  kindred: ParsedKindred,
  spellBook: SpellBook | null,
  opts: {
    spellRows?: ReadonlyMap<string, SpellDetail>;
    glamoursTable?: string[];
    glamourDetails?: Map<string, GlamourEntry>;
    knacks?: KnackEntry[];
  },
): Magic {
  // Magician: list every spell in the starting spell book, filling in full
  // details from the index where available and falling back to name-only when a
  // spell isn't in the index (so nothing silently vanishes from the sheet).
  const spells: SpellDetail[] = [];
  if (spellBook) {
    for (const spellName of spellBook.spells) {
      const row = opts.spellRows?.get(spellName.toLowerCase());
      spells.push(
        row
          ? {
              name: row.name,
              tradition: row.tradition,
              rank: row.rank,
              duration: row.duration,
              range: row.range,
              body: row.body,
              page: row.page,
            }
          : {
              name: spellName,
              tradition: null,
              rank: null,
              duration: null,
              range: null,
              body: "",
              page: 0,
            },
      );
    }
  }

  // Glamours: enchanters get class glamours, elves/grimalkins get a kindred glamour.
  const glamours: GlamourEntry[] = [];
  const glamourCount =
    (CLASS_GLAMOURS[klass.id] ?? 0) + (KINDRED_GLAMOUR_KINDREDS.has(kindred.id) ? 1 : 0);

  if (glamourCount > 0 && opts.glamoursTable && opts.glamoursTable.length > 0) {
    for (let i = 0; i < glamourCount; i++) {
      const name = pick(opts.glamoursTable);
      const details = opts.glamourDetails?.get(name.toLowerCase());
      glamours.push(details ?? { name, duration: null, range: null, body: null });
    }
  }

  // Knacks: a knack-kindred knows one, rolled from the table.
  const knacks: KnackEntry[] = [];
  if (KINDRED_KNACK_KINDREDS.has(kindred.id) && opts.knacks && opts.knacks.length > 0) {
    knacks.push(pick(opts.knacks));
  }

  return { spells, glamours, knacks };
}

// General starting items every character receives (step 8). These are standard
// dungeon-crawl gear, not setting-specific creative content.
const GENERAL_ITEMS = ["Common clothes", "Backpack with rations, waterskin, and tinder box"];

export interface SpellDetail {
  name: string;
  tradition: string | null;
  rank: number | null;
  duration: string | null;
  range: string | null;
  body: string;
  page: number;
}

export interface Magic {
  /** Full spell details for the magician's starting spell book. */
  spells: SpellDetail[];
  /** Rolled glamours (for enchanters, elves, grimalkins). */
  glamours: GlamourEntry[];
  /** Rolled knacks (mosslings). */
  knacks: KnackEntry[];
}

export interface Character {
  name: string;
  /** "Male"/"Female" when a gendered name column was rolled; "" otherwise. */
  gender: string;
  player: string;
  kindred: ParsedKindred;
  klass: ParsedClass;
  scores: Record<Ability, number>;
  scoresAdjusted: boolean;
  hp: number;
  loadout: Loadout;
  magicResistance: number;
  languages: string[];
  extraLanguages: number;
  skills: Record<string, number>; // merged Listen/Search/Survival + class skills
  persona: Record<string, string>;
  alignment: string;
  background: string | null;
  gold: number;
  generalItems: string[];
  adventuringItems: string[];
  trinket: string | null;
  weapons: string[];
  classItems: string[];
  spellBook: SpellBook | null;
  magic: Magic;
  /** Rolled physical description (age, height, weight, lifespan); undefined when
   *  the kindred stat block wasn't parsed. */
  physique?: Physique;
  /** Rolled level-1 Symbiotic Flesh infestation (mosslings); undefined otherwise
   *  or when the d20 table couldn't be read. */
  symbioticFlesh?: string;
  speed: number;
}

/** The kindred traits with any rolled random trait resolved inline — currently
 *  the mossling's Symbiotic Flesh infestation, shown as its level-1 result. Both
 *  renderers use this so the concrete roll sits under the trait that explains it. */
export function resolvedKindredTraits(c: Character): Trait[] {
  if (!c.symbioticFlesh) return c.kindred.traits;
  return c.kindred.traits.map((t) =>
    /^symbiotic flesh$/i.test(t.name)
      ? { ...t, text: `${t.text}\nAt Level 1: ${c.symbioticFlesh}` }
      : t,
  );
}

// Listen, Search, and Survival default to a target of 6 for every character; a
// Kindred or Class can only lower them (Player's Book). Specialised class skills
// (Stalking, Decipher Doc, etc.) add to the list at their own targets.
const DEFAULT_SKILLS: Record<string, number> = { Listen: 6, Search: 6, Survival: 6 };

/** Pull "Skill Target of N for X[, Y and Z]" grants out of trait prose. */
function skillTargetsFromTraits(traits: { name: string; text: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of traits) {
    for (const m of t.text.matchAll(/Skill Target of (\d+) for ([^.]+?)\./g)) {
      const target = Number(m[1]);
      // Drop any "when foraging" qualifier, then split "Listen and Search".
      for (const raw of m[2].split(/ when /i)[0].split(/,|\band\b/)) {
        const name = raw.trim();
        // Title-case skill names, one or more words ("Listen", "Monster Lore").
        if (/^[A-Z][A-Za-z]+(?: [A-Z][A-Za-z'-]+)*$/.test(name)) {
          out[name] = Math.min(out[name] ?? target, target);
        }
      }
    }
  }
  return out;
}

/** The character's skill targets: defaults, lowered by kindred and class. */
function mergeSkillTargets(kindred: ParsedKindred, klass: ParsedClass): Record<string, number> {
  const out: Record<string, number> = { ...DEFAULT_SKILLS };
  const sources = [
    klass.skills,
    skillTargetsFromTraits(kindred.traits),
    skillTargetsFromTraits(klass.traits),
  ];
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) out[k] = Math.min(out[k] ?? v, v);
  }
  return out;
}

/**
 * Step 4: adjust ability scores. Lower non-prime abilities (min 9) to raise
 * prime abilities (max 13). Every 2 points lowered grants 1 point to a prime.
 * Lowers from the highest non-prime first (least impact), raises the lowest
 * prime first (biggest benefit). Returns the adjusted scores and whether any
 * change was made.
 */
function adjustAbilityScores(
  scores: Record<Ability, number>,
  primes: Ability[],
): { scores: Record<Ability, number>; adjusted: boolean } {
  const result = { ...scores };
  const isPrime = (a: Ability) => primes.includes(a);

  const pool = ABILITIES.filter((a) => !isPrime(a)).reduce(
    (sum, a) => sum + Math.max(0, result[a] - 9),
    0,
  );
  const capacity = ABILITIES.filter((a) => isPrime(a)).reduce(
    (sum, a) => sum + Math.max(0, 13 - result[a]),
    0,
  );
  const toAdd = Math.min(Math.floor(pool / 2), capacity);
  if (toAdd === 0) return { scores: result, adjusted: false };

  // Lower non-prime abilities: take from the highest first.
  let needToLower = toAdd * 2;
  for (const ab of ABILITIES.filter((x) => !isPrime(x)).toSorted((x, y) => result[y] - result[x])) {
    if (needToLower <= 0) break;
    const surplus = result[ab] - 9;
    if (surplus <= 0) continue; // already at or below the floor, can't lower
    const canTake = Math.min(surplus, needToLower);
    result[ab] -= canTake;
    needToLower -= canTake;
  }

  // Raise prime abilities: give to the lowest first.
  let toRaise = toAdd;
  for (const ab of ABILITIES.filter((x) => isPrime(x)).toSorted((x, y) => result[x] - result[y])) {
    if (toRaise <= 0) break;
    const canGive = Math.min(13 - result[ab], toRaise);
    result[ab] += canGive;
    toRaise -= canGive;
  }

  return { scores: result, adjusted: true };
}

/** Roll up to 4 adventuring items from the d20 table (with repeats allowed). */
function rollAdventuringItems(table: string[]): string[] {
  if (table.length === 0) return [];
  const count = 4;
  return Array.from({ length: count }, () => pick(table));
}

export function generate(
  kindred: ParsedKindred,
  klass: ParsedClass,
  opts: {
    name?: string;
    player?: string;
    alignment?: string;
    adventuringItems?: string[];
    spellRows?: ReadonlyMap<string, SpellDetail>;
    glamoursTable?: string[];
    glamourDetails?: Map<string, GlamourEntry>;
    knacks?: KnackEntry[];
    symbioticFlesh?: string[];
  } = {},
): Character {
  const raw = Object.fromEntries(ABILITIES.map((a) => [a, roll("3d6").total])) as Record<
    Ability,
    number
  >;
  const { scores, adjusted: scoresAdjusted } = adjustAbilityScores(raw, klass.primeAbilities);

  const hp = Math.max(1, roll(klass.hitDie).total + abilityMod(scores.con));
  const { loadout, weapons, classItems } = rollEquipment(
    klass,
    kindred.furArmourBonus ?? 0,
    abilityMod(scores.dex),
  );
  // Apply any kindred armour-name swaps (e.g. small folk replace metal armour
  // with a fitted equivalent; the AC is unchanged).
  for (const [metal, swap] of Object.entries(kindred.armourSwaps ?? {})) {
    loadout.armour = loadout.armour.replace(new RegExp(`${metal}(?:\\s*mail)?`, "i"), swap);
  }

  const persona = Object.fromEntries(
    Object.entries(kindred.persona).map(([field, opts2]) => [field, pick(opts2)]),
  );

  const gold = roll("3d6").total;
  const adventuringItems = rollAdventuringItems(opts.adventuringItems ?? []);
  const trinket = kindred.trinkets.length > 0 ? pick(kindred.trinkets) : null;
  const background = kindred.backgrounds.length > 0 ? pick(kindred.backgrounds) : null;
  const alignment = opts.alignment ?? "Neutral";
  const spellBook = klass.spellBooks.length > 0 ? pick(klass.spellBooks) : null;

  // Build the magic section.
  const magic = buildMagic(klass, kindred, spellBook, opts);

  // A mossling's flesh sprouts one random infestation per level; roll level 1's.
  const symbioticFlesh =
    KINDRED_SYMBIOTIC_FLESH_KINDREDS.has(kindred.id) && opts.symbioticFlesh?.length === 20
      ? pick(opts.symbioticFlesh)
      : undefined;

  // A supplied name has no known gender; a rolled one may (human name columns).
  const named = opts.name ? { name: opts.name, gender: null as Gender } : rollName(kindred);

  return {
    name: named.name,
    gender: named.gender ?? "",
    player: opts.player ?? "",
    kindred,
    klass,
    scores,
    scoresAdjusted,
    hp,
    loadout,
    magicResistance: kindred.magicResistance ?? 0,
    languages: [...new Set([...kindred.nativeLanguages, ...klass.languages])],
    extraLanguages: Math.max(0, abilityMod(scores.int)),
    skills: mergeSkillTargets(kindred, klass),
    persona,
    alignment,
    background,
    gold,
    generalItems: GENERAL_ITEMS,
    adventuringItems,
    trinket,
    weapons,
    classItems,
    spellBook,
    magic,
    physique: buildPhysique(kindred.physical, named.gender),
    symbioticFlesh,
    speed: 40,
  };
}

/** Roll a name and report the gender its given-name column implies (Male/Female
 *  columns are gendered; a Unisex or Surname-only table yields null). The gender
 *  feeds the height roll so a female-named human gets the female height. */
function rollName(k: ParsedKindred): { name: string; gender: Gender } {
  if (k.nameRows.length === 0) return { name: "(unnamed)", gender: null };
  const surnameCol = k.nameColumns.findIndex((c) => /surname/i.test(c));
  const givenCols = k.nameColumns.map((_, i) => i).filter((i) => i !== surnameCol);

  let given = "";
  let gender: Gender = null;
  if (givenCols.length > 0) {
    const col = pick(givenCols);
    given = pick(k.nameRows)[col] ?? "";
    const label = k.nameColumns[col] ?? "";
    if (/^male$/i.test(label)) gender = "Male";
    else if (/^female$/i.test(label)) gender = "Female";
  }
  const surname = surnameCol >= 0 ? pick(k.nameRows)[surnameCol] : "";
  return { name: [given, surname].filter(Boolean).join(" ").trim() || "(unnamed)", gender };
}

function mod(score: number): string {
  const m = abilityMod(score);
  return m >= 0 ? `+${m}` : `${m}`;
}

function skillRows(skills: Record<string, number>): string {
  const entries = Object.entries(skills);
  if (entries.length === 0) return "_(no class skill targets parsed; see Player's Book)_";
  return ["| Skill | Target |", "|---|---|", ...entries.map(([k, v]) => `| ${k} | ${v} |`)].join(
    "\n",
  );
}

/** Persona bullets for the vault note: appearance fields live in Physique, the
 *  rest ordered to match the sheet, trinket last. */
function personaMarkdown(persona: Record<string, string>, trinket: string | null): string {
  const rank = (f: string): number => {
    const i = PERSONA_ORDER.indexOf(f.toLowerCase());
    return i < 0 ? PERSONA_ORDER.length : i;
  };
  const lines = Object.entries(persona)
    .filter(([f]) => !APPEARANCE_FIELDS.includes(f))
    .toSorted((a, b) => rank(a[0]) - rank(b[0]))
    .map(([field, value]) => `- **${field}:** ${value}`);
  if (trinket) lines.push(`- **Trinket:** ${trinket}`);
  return lines.join("\n");
}

function traitList(traits: Trait[]): string {
  if (traits.length === 0) return "_(none parsed; see Player's Book)_";
  return traits
    .map((t) => {
      const { lead, subs } = structureTrait(t.text);
      const rows = [`- **${t.name}.** ${lead}`];
      let nested = false;
      for (const s of subs) {
        if (s.kind === "subhead") {
          nested = true;
          rows.push(`  - _${s.body}_`);
        } else {
          const indent = nested ? "    " : "  ";
          const sb = s.kind === "statblock" ? parseStatBlock(s.body) : null;
          if (sb) {
            const stats = sb.stats.map((x) => `**${x.label}** ${x.value}`).join(", ");
            rows.push(`${indent}- ${[sb.typeLine, stats].filter(Boolean).join(" — ")}`);
          } else {
            rows.push(s.label ? `${indent}- **${s.label}:** ${s.body}` : `${indent}- ${s.body}`);
          }
        }
      }
      return rows.join("\n");
    })
    .join("\n");
}

/** Render a vault-format PC markdown sheet. The default gear loadout is marked
 *  for the player to swap for their rolled starting equipment. */
export function toMarkdown(c: Character): string {
  const s = c.scores;
  const mr = c.magicResistance > 0 ? `+${c.magicResistance}` : "0";
  const langs = c.languages.join(", ");

  const abilityRows = ABILITIES.map((a) => `| ${ABILITY_LABEL[a]} | ${s[a]} | ${mod(s[a])} |`).join(
    "\n",
  );

  const gearRows = [
    `| Armour: ${c.loadout.armour} (AC ${c.loadout.baseAc}) | |`,
    ...c.weapons.map((w) => `| Weapon: ${w} | |`),
    ...c.classItems.map((g) => `| Class item: ${g} | |`),
    ...c.generalItems.map((g) => `| ${g} | |`),
    ...c.adventuringItems.map((g) => `| ${g} | |`),
    ...(c.trinket ? [`| Trinket: ${c.trinket} | |`] : []),
    ...(c.spellBook ? [`| Spell book: ${c.spellBook.name} | |`] : []),
    `| ${c.gold} gp | |`,
  ].join("\n");

  return `---
type: PC
race: ${c.kindred.id}
gender: ${c.gender}
class: ${c.klass.name}
level: 1
xp: 0
next_level: ${c.klass.nextLevelXp}
alignment: ${c.alignment}
background: ${c.background ?? ""}
faction:
affiliation:
moon_sign:
hp: ${c.hp}
max_hp: ${c.hp}
ac: ${c.loadout.ac}
attack: ${c.klass.attack}
speed: ${c.speed}
languages: [${langs}]
status: active
player: ${c.player}
---
#pc #${c.kindred.id} #${c.klass.id}

# ${c.name}

**Kindred & Class:** ${c.kindred.name} ${c.klass.name}
**Alignment:** ${c.alignment}${c.background ? `\n**Background:** ${c.background}` : ""}${
    physiqueSummary(c.physique, c.persona)
      ? `\n**Physique:** ${physiqueSummary(c.physique, c.persona)}`
      : ""
  }

## Ability Scores

${c.scoresAdjusted ? "_(adjusted: prime abilities raised)_\n" : ""}| Ability | Score | Mod |
|---|---|---|
${abilityRows}

## Save Targets

| Doom | Ray | Hold | Blast | Spell | Magic Resistance |
|---|---|---|---|---|---|
| ${c.klass.saves.doom} | ${c.klass.saves.ray} | ${c.klass.saves.hold} | ${c.klass.saves.blast} | ${c.klass.saves.spell} | ${mr} |

## Skill Targets

${skillRows(c.skills)}

## ${c.kindred.name} Abilities

${traitList(resolvedKindredTraits(c))}

## ${c.klass.name} Abilities

${traitList(c.klass.traits)}

## Equipment

Weapons: ${c.klass.weapons}

| Item | Weight |
|---|---|
${gearRows}

${magicToMarkdown(c.magic)}## Persona

${personaMarkdown(c.persona, c.trinket)}

## Appearances

\`\`\`dataview
LIST FROM #session WHERE contains(characters, "${c.name}")
\`\`\`
`;
}

function magicToMarkdown(magic: Magic): string {
  if (magic.spells.length === 0 && magic.glamours.length === 0 && magic.knacks.length === 0)
    return "";

  const parts: string[] = [];

  if (magic.spells.length > 0) {
    parts.push("## Spells\n");
    for (const spell of magic.spells) {
      parts.push(
        `**${spell.name}**${spell.tradition ? ` (${spell.tradition}${spell.rank ? ` Rank ${spell.rank}` : ""})` : ""}`,
      );
      if (spell.duration) parts.push(`  - **Duration:** ${spell.duration}`);
      if (spell.range) parts.push(`  - **Range:** ${spell.range}`);
      if (spell.body) parts.push(`  - ${spell.body}`);
      parts.push("");
    }
  }

  if (magic.glamours.length > 0) {
    parts.push("## Glamours\n");
    for (const g of magic.glamours) {
      parts.push(`**${g.name}**`);
      if (g.duration) parts.push(`  - **Duration:** ${g.duration}`);
      if (g.range) parts.push(`  - **Range:** ${g.range}`);
      if (g.body) parts.push(`  - ${g.body}`);
      parts.push("");
    }
  }

  if (magic.knacks.length > 0) {
    parts.push("## Knacks\n");
    parts.push(traitList(magic.knacks));
    parts.push("");
  }

  return `${parts.join("\n")}\n`;
}
