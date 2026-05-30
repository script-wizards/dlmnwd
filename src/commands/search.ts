import { ensureAllConfigured } from "../build.ts";
import { openDb, searchPages } from "../db.ts";

export function cmdSearch(args: string[]): void {
  const limitFlag = args.find((a) => a.startsWith("--limit="));
  const limit = limitFlag ? parseInt(limitFlag.split("=")[1], 10) : 8;
  const query = args
    .filter((a) => !a.startsWith("--"))
    .join(" ")
    .trim();
  if (!query) {
    console.error("usage: dw search <text>   [--limit=N]");
    process.exit(1);
  }

  const db = openDb();
  ensureAllConfigured(db);

  const hits = searchPages(db, query, limit);
  if (hits.length === 0) {
    console.log(`No matches for "${query}".`);
    return;
  }
  for (const h of hits) {
    console.log(`${h.book} p.${h.page}\n  ${h.snippet}\n`);
  }
}
