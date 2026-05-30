import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Repo root, derived from this module's location (src/pdf/config.ts), so paths
// resolve no matter which directory `dw` is invoked from.
const REPO_ROOT = join(import.meta.dir, "..", "..");

// The user supplies their own legally-owned PDFs. We never bundle, store, or
// commit book content; we only read from a file they drop in or point us at.
export type Book = "players" | "monsters" | "campaign";

const ENV_VAR: Record<Book, string> = {
  players: "DW_PLAYERS_PDF",
  monsters: "DW_MONSTERS_PDF",
  campaign: "DW_CAMPAIGN_PDF",
};

// Filename hints used to auto-detect which book a dropped-in PDF is.
const HINT: Record<Book, { word: string; re: RegExp }> = {
  players: { word: "player", re: /player/i },
  monsters: { word: "monster", re: /monster|bestiary/i },
  campaign: { word: "campaign", re: /campaign/i },
};

/** Folders scanned for book PDFs, in priority order. */
export function bookDirs(): string[] {
  return [
    process.env.DW_BOOKS,
    "books", // relative to the current directory
    join(REPO_ROOT, "books"), // the repo's own books/, works from anywhere
    join(homedir(), ".config", "dw", "books"),
  ].filter((d): d is string => Boolean(d));
}

/** Resolve the path to a book's PDF, or throw with setup guidance. */
export function pdfPath(book: Book): string {
  // 1) Explicit per-book override.
  const fromEnv = process.env[ENV_VAR[book]];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  // 2) Auto-discovery: a PDF whose filename matches the book, in a known folder.
  const { re } = HINT[book];
  for (const dir of bookDirs()) {
    if (!existsSync(dir)) continue;
    const match = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".pdf") && re.test(f));
    if (match) return join(dir, match);
  }

  throw new Error(
    `No PDF found for the ${book} book. Either:\n` +
      `  • drop your legally-owned PDF (filename containing "${HINT[book].word}") into ./books/ or ~/.config/dw/books/, or\n` +
      `  • set ${ENV_VAR[book]} to its path.\n` +
      `No Dolmenwood content is bundled; you must supply your own books.`,
  );
}
