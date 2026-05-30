import { ensureBuilt } from "../build.ts";
import { allClassIds, allKindredIds, hexList, monsterNames, openDb, spellNames } from "../db.ts";
import { type Book, pdfPath } from "../pdf/config.ts";

const CATEGORIES = ["monsters", "spells", "hexes", "kindreds", "classes"] as const;
type Category = (typeof CATEGORIES)[number];

// Which book each category is parsed from.
const SOURCE: Record<Category, Book> = {
  monsters: "monsters",
  spells: "players",
  hexes: "campaign",
  kindreds: "players",
  classes: "players",
};

/** Print the names/ids in a category, one per line. Powers fzf and completion. */
export function cmdList(args: string[]): void {
  const category = args[0] as Category;
  if (!CATEGORIES.includes(category)) {
    console.error(`usage: dw list <${CATEGORIES.join("|")}>`);
    process.exit(1);
  }

  const db = openDb();
  ensureBuilt(db, SOURCE[category], pdfPath(SOURCE[category]));

  const lines = {
    monsters: () => monsterNames(db),
    spells: () => spellNames(db),
    hexes: () => hexList(db),
    kindreds: () => allKindredIds(db),
    classes: () => allClassIds(db),
  }[category]();

  for (const l of lines) console.log(l);
}
