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
import { generate, toMarkdown } from "../gen/character.ts";
import { parseGlamourDetails, parseGlamoursTable } from "../parse/glamour.ts";
import { parseKnacks } from "../parse/knack.ts";
import { parseSymbioticFlesh } from "../parse/symbiotic-flesh.ts";
import { extractPages } from "../pdf/extract.ts";
import { pdfPath } from "../pdf/config.ts";
import { canBeAlignment, canBeClass, normalizeAlignment, rollKindredClass } from "../rules.ts";

export function cmdNew(args: string[]): void {
  const positional = args.filter((a) => !a.startsWith("--"));
  const name = flag(args, "--name");
  const player = flag(args, "--player");
  const out = flag(args, "--out");
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

  const character = generate(kindred, klass, {
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
  const md = toMarkdown(character);

  if (out) {
    writeFileSync(out, md);
    console.error(`Wrote ${character.name} (${kindred.name} ${klass.name}) to ${out}`);
  } else {
    process.stdout.write(md);
  }
}

function isRandom(arg: string | undefined): boolean {
  return !arg || arg.toLowerCase() === "random";
}

function flag(args: string[], key: string): string | undefined {
  const hit = args.find((a) => a.startsWith(`${key}=`));
  return hit ? hit.slice(key.length + 1) : undefined;
}
