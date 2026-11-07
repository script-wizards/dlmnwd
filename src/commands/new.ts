import { writeFileSync } from "node:fs";
import { ensureBuilt } from "../build.ts";
import {
  allClasses,
  allClassIds,
  allKindredIds,
  allKindreds,
  findClass,
  findKindred,
  findSpellRow,
  getLookupTable,
  openDb,
  type SpellRow,
  spellNames,
} from "../db.ts";
import { type Character, generate, toMarkdown } from "../gen/character.ts";
import { parseGlamourDetails, parseGlamoursTable } from "../parse/glamour.ts";
import { parseKnacks } from "../parse/knack.ts";
import { parseSymbioticFlesh } from "../parse/symbiotic-flesh.ts";
import { extractPages } from "../pdf/extract.ts";
import { pdfPath } from "../pdf/config.ts";
import { canBeAlignment, canBeClass, normalizeAlignment, rollKindredClass } from "../rules.ts";
import { computeAc } from "../party/encumbrance.ts";
import { addItem, makeItem } from "../party/items.ts";
import type { PartyRules } from "../party/rules.ts";
import { grantRune } from "../party/runes.ts";
import { blankPc, type PC, saveParty } from "../party/store.ts";
import { pick } from "../util.ts";
import { partyContext } from "./party.ts";

export function cmdNew(args: string[]): void {
  const character = rollCharacter(args);
  const out = flag(args, "--out");
  const md = toMarkdown(character);
  const { kindred, klass } = character;

  if (args.includes("--party")) {
    const { party, rules } = partyContext();
    const pc = characterToPc(character, rules);
    party.members.push(pc);
    saveParty(party);
    console.error(`Added ${character.name} (${kindred.name} ${klass.name}) to the party.`);
  }
  if (out) {
    writeFileSync(out, md);
    console.error(`Wrote ${character.name} (${kindred.name} ${klass.name}) to ${out}`);
  } else if (!args.includes("--party")) {
    process.stdout.write(md);
  }
}

/** Roll a level-1 character from `dw new`-style args (kindred, class, flags). */
export function rollCharacter(args: string[]): Character {
  const positional = args.filter((a) => !a.startsWith("--"));
  const name = flag(args, "--name");
  const player = flag(args, "--player");
  const alignmentRaw = flag(args, "--alignment");
  const alignment = alignmentRaw ? normalizeAlignment(alignmentRaw) : undefined;
  if (alignmentRaw && !alignment) {
    console.error(`Invalid alignment "${alignmentRaw}". Use: Lawful, Neutral, or Chaotic.`);
    process.exit(1);
  }

  const db = openDb();
  ensureBuilt(db, "players", pdfPath("players"));

  const [kindredId, classId] = positional;
  const chosenKindred = isRandom(kindredId) ? null : findKindred(db, kindredId);
  const chosenClass = isRandom(classId) ? null : findClass(db, classId);
  if ((!isRandom(kindredId) && !chosenKindred) || (!isRandom(classId) && !chosenClass)) {
    console.error(
      `usage: dw new [kindred] [class] [--name="X"] [--player="Y"] [--out=file.md] [--alignment=Lawful|Neutral|Chaotic]\n` +
        `  omit either, or pass "random", to roll it\n` +
        `  kindreds: ${allKindredIds(db).join(", ")}\n` +
        `  classes:  ${allClassIds(db).join(", ")}`,
    );
    process.exit(1);
  }

  if (chosenClass && alignment && !canBeAlignment(chosenClass.id, alignment)) {
    console.error(`${chosenClass.name}s may not be Chaotic.`);
    process.exit(1);
  }

  if (chosenKindred && chosenClass && !canBeClass(chosenKindred.kindredType, chosenClass.id)) {
    console.error(
      `${chosenKindred.name} (${chosenKindred.kindredType}) cannot be a ${chosenClass.name}. Non-mortals cannot be clerics or friars.`,
    );
    process.exit(1);
  }

  const rolled = rollKindredClass(allKindreds(db), allClasses(db), {
    kindred: chosenKindred,
    klass: chosenClass,
    alignment,
  });
  if (!rolled) {
    console.error("No kindred and class satisfy those constraints.");
    process.exit(1);
  }
  const { kindred, klass } = rolled;

  const adventuringItems = getLookupTable(db, "players", "adventuring_items");

  // Build a spell lookup map for the magician's starting spell book.
  const spellRows = new Map<string, SpellRow>();
  const allSpells = spellNames(db);
  for (const spellName of allSpells) {
    const row = findSpellRow(db, spellName);
    if (row) spellRows.set(spellName.toLowerCase(), row);
  }

  // Parse glamours table and descriptions for enchanters/elves/grimalkins.
  const pages = extractPages(pdfPath("players"));
  const glamoursTable = parseGlamoursTable(pages);
  const glamourDetails = parseGlamourDetails(pages, glamoursTable);
  const knacks = parseKnacks(pages);
  const symbioticFlesh = parseSymbioticFlesh(pages);

  return generate(kindred, klass, {
    name,
    player,
    alignment,
    adventuringItems,
    spellRows,
    glamoursTable,
    glamourDetails,
    knacks,
    symbioticFlesh,
  });
}

/** Turn a freshly rolled character into a party member, resolving the rolled
 *  gear against the book's equipment lists. */
export function characterToPc(c: Character, rules: PartyRules): PC {
  const pc = blankPc(c.name);
  Object.assign(pc, {
    player: c.player,
    kindred: c.kindred.id,
    class: c.klass.id,
    alignment: c.alignment,
    background: c.background ?? "",
    scores: { ...c.scores },
    hp: c.hp,
    maxHp: c.hp,
    attack: c.klass.attack,
    saves: { ...c.klass.saves },
    magicResistance: c.magicResistance,
    skills: { ...c.skills },
    languages: [...c.languages],
    glamours: c.magic.glamours.map((g) => g.name),
    knacks: c.magic.knacks.map((k) => k.name),
    spells: c.magic.spells.map((s) => s.name),
  });
  pc.coins.gp = c.gold;
  const { catalog, enc } = rules;
  const add = (text: string) => {
    if (text.trim()) addItem(pc, makeItem(catalog, enc, text).inv);
  };
  // "Leather armour + shield" → the armour and the shield.
  for (const part of c.loadout.armour.split(/\s*\+\s*/))
    if (!/^no armour$/i.test(part) && !/^none$/i.test(part)) add(part);
  for (const w of c.weapons) for (const part of w.split(/\s*\+\s*/)) add(part);
  for (const g of [...c.classItems, ...c.generalItems, ...c.adventuringItems]) {
    // "Backpack with rations, waterskin, and tinder box" is several things.
    for (const part of g.split(/\s*(?:,|\bwith\b|\band\b)\s*/)) add(part);
  }
  if (c.spellBook) add(`Spell book (${c.spellBook.name})`);
  // A class that starts with a random rune of some magnitude gets one now.
  const magnitude = c.klass.startingRune;
  const pool = rules.runes.runes.filter((r) => r.magnitude === magnitude);
  if (magnitude && pool.length > 0) grantRune(pc, pick(pool));
  if (c.trinket)
    pc.items.push({
      name: c.trinket,
      qty: 1,
      weight: enc.trinketWeight,
      slots: 0,
      where: "stowed",
      note: "tiny",
    });
  // Keep the generator's AC (it knows kindred armour bonuses); the difference
  // from worn gear is a standing bonus.
  pc.acBonus = c.loadout.ac - computeAc(pc, catalog);
  return pc;
}

function isRandom(arg: string | undefined): boolean {
  return !arg || arg.toLowerCase() === "random";
}

function flag(args: string[], key: string): string | undefined {
  const hit = args.find((a) => a.startsWith(`${key}=`));
  return hit ? hit.slice(key.length + 1) : undefined;
}
