import { build, configuredBooks } from "../build.ts";
import { isFresh, openDb } from "../db.ts";
import type { Book } from "../pdf/config.ts";

export function cmdBuild(args: string[]): void {
  const force = args.includes("--force") || args.includes("-f");
  const names = args.filter((a) => !a.startsWith("-")) as Book[];

  let targets = configuredBooks();
  if (names.length) targets = targets.filter((t) => names.includes(t.book));
  if (targets.length === 0) {
    console.error("No configured books to build. Set DW_PLAYERS_PDF (etc.) or use dw.config.json.");
    process.exit(1);
  }

  const db = openDb();
  for (const { book, path } of targets) {
    if (!force && isFresh(db, book, path)) {
      console.log(`${book}: up to date`);
      continue;
    }
    const { pages, spells, kindreds, classes, monsters, subCreatures, hexes } = build(
      db,
      book,
      path,
    );
    const extra = [
      spells > 0 ? `${spells} spells` : "",
      kindreds > 0 ? `${kindreds} kindreds` : "",
      classes > 0 ? `${classes} classes` : "",
      monsters > 0 ? `${monsters} monsters` : "",
      subCreatures > 0 ? `${subCreatures} sub-creatures` : "",
      hexes > 0 ? `${hexes} hexes` : "",
    ].filter(Boolean);
    const suffix = extra.length > 0 ? `, ${extra.join(", ")}` : "";
    console.log(`${book}: indexed ${pages} pages${suffix}`);
  }
}
