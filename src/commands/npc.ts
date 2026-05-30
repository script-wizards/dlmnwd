import { ensureBuilt } from "../build.ts";
import { allKindredIds, findKindred, openDb } from "../db.ts";
import { loadData } from "../data.ts";
import type { ParsedKindred } from "../parse/kindred.ts";
import { type Book, pdfPath } from "../pdf/config.ts";
import { pick } from "../util.ts";

export function cmdNpc(args: string[]): void {
  const id = args[0]?.toLowerCase();

  // Prefer real kindred data parsed from the configured Player's Book.
  let playersPdf: string | undefined;
  try {
    playersPdf = pdfPath("players");
  } catch {
    playersPdf = undefined;
  }

  if (playersPdf) {
    const db = openDb();
    ensureBuilt(db, "players" as Book, playersPdf);
    const known = allKindredIds(db);
    if (!id || !known.includes(id)) {
      console.error(`usage: dw npc <kindred>. Available: ${known.join(", ")}`);
      process.exit(1);
    }
    printNpc(findKindred(db, id)!);
    return;
  }

  // Fall back to homebrew/sample JSON when no PDF is configured.
  const data = loadData();
  const known = [...data.kindreds.keys()].join(", ") || "none";
  const k = id ? data.kindreds.get(id) : undefined;
  if (!k) {
    console.error(`usage: dw npc <kindred>. Available: ${known}`);
    process.exit(1);
  }
  const first = k.names?.first ? pick(k.names.first) : "";
  const surname = k.names?.surname ? pick(k.names.surname) : "";
  console.log(`${[first, surname].filter(Boolean).join(" ") || "(unnamed)"} (${k.name})`);
  for (const [field, opts] of Object.entries(k.persona ?? {})) {
    if (opts && opts.length) console.log(`  ${field}: ${pick(opts)}`);
  }
}

function printNpc(k: ParsedKindred): void {
  console.log(`${rollName(k)} (${k.name})`);
  for (const [field, opts] of Object.entries(k.persona)) {
    if (opts.length > 0) console.log(`  ${field}: ${pick(opts)}`);
  }
}

/** Roll a name: a given/first name plus a surname if the table has one. */
function rollName(k: ParsedKindred): string {
  if (k.nameRows.length === 0) return "(unnamed)";
  const surnameCol = k.nameColumns.findIndex((c) => /surname/i.test(c));
  const givenCols = k.nameColumns.map((_, i) => i).filter((i) => i !== surnameCol);

  const given = givenCols.length > 0 ? cell(k, pick(givenCols)) : "";
  const surname = surnameCol >= 0 ? cell(k, surnameCol) : "";
  return [given, surname].filter(Boolean).join(" ") || "(unnamed)";
}

function cell(k: ParsedKindred, col: number): string {
  const row = pick(k.nameRows);
  return (row[col] ?? "").trim();
}
