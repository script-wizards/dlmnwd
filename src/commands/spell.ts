import { ensureBuilt } from "../build.ts";
import { findSpellRow, openDb, spellNames } from "../db.ts";
import { canPick, pickWithFzf } from "../fzf.ts";
import { pdfPath } from "../pdf/config.ts";
import { openPdfPage } from "../pdf/open.ts";

export function cmdSpell(args: string[]): void {
  const db = openDb();
  const playersPdf = pdfPath("players");
  ensureBuilt(db, "players", playersPdf);

  const open = args.includes("--open") || args.includes("-o");
  let query = args
    .filter((a) => !a.startsWith("-"))
    .join(" ")
    .trim();
  if (!query) {
    if (!canPick()) {
      console.error("usage: dw spell <name>");
      process.exit(1);
    }
    const picked = pickWithFzf(spellNames(db), "dw spell {}");
    if (!picked) return;
    query = picked;
  }

  const spell = findSpellRow(db, query);
  if (!spell) {
    console.error(`No spell matching "${query}" in the Player's Book.`);
    process.exit(1);
  }

  if (open && openPdfPage(playersPdf, spell.page)) {
    console.error(`Opened ${spell.name} (Player's Book p.${spell.page}).`);
    return;
  }

  const tag = [spell.tradition, spell.rank ? `Rank ${spell.rank}` : ""].filter(Boolean).join(" ");
  console.log(`\n${spell.name}${tag ? `   (${tag})` : ""}`);
  if (spell.prayerName) console.log(`  Prayer:   ${spell.prayerName}`);
  if (spell.duration) console.log(`  Duration: ${spell.duration}`);
  if (spell.range) console.log(`  Range:    ${spell.range}`);

  // Each body line is one logical paragraph (list item, label, or prose); wrap
  // it to a readable width, hanging the continuation under a "1." list marker.
  console.log();
  for (const para of spell.body.split("\n")) {
    const marker = para.match(/^\d+\.\s+/);
    const indent = marker ? " ".repeat(marker[0].length) : "";
    const [first, ...rest] = wrap(para, 76);
    console.log(first ?? "");
    for (const line of rest) console.log(indent + line);
  }

  console.log(`\n  Source: Player's Book, PDF p.${spell.page}`);
}

// Greedy word-wrap to a column width.
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if (cur && cur.length + 1 + word.length > width) {
      out.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  out.push(cur);
  return out;
}
