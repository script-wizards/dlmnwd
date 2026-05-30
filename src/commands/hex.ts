import { ensureBuilt } from "../build.ts";
import { loadData } from "../data.ts";
import { findHex, hexCount, hexList, openDb } from "../db.ts";
import { canPick, pickWithFzf } from "../fzf.ts";
import { pdfPath } from "../pdf/config.ts";
import { openPdfPage } from "../pdf/open.ts";
import type { Hex } from "../schema.ts";

export function cmdHex(args: string[]): void {
  // Hexes default to opening the PDF page (the keyed detail lives there); -t/--text
  // prints the quick terrain/encounter summary instead.
  const textOnly = args.includes("-t") || args.includes("--text");
  let id = args.find((a) => !a.startsWith("-"))?.trim();

  // Prefer the Campaign Book index if configured; fall back to homebrew JSON.
  let campaignPdf: string | undefined;
  try {
    campaignPdf = pdfPath("campaign");
  } catch {
    campaignPdf = undefined;
  }

  let hex: Hex | null = null;
  if (campaignPdf) {
    const db = openDb();
    ensureBuilt(db, "campaign", campaignPdf);
    if (!id) {
      if (!canPick()) {
        console.error(`usage: dw hex <id>  (${hexCount(db)} hexes indexed, e.g. 0101)`);
        process.exit(1);
      }
      const picked = pickWithFzf(hexList(db), "dw hex -t {1}"); // preview in text mode
      if (!picked) return;
      id = picked.split(/\s+/)[0]; // "0908  The Sample Lair" -> "0908"
    }
    hex = findHex(db, id);
  } else {
    const data = loadData();
    if (!id) {
      console.error(`usage: dw hex <id>. Known: ${[...data.hexes.keys()].join(", ") || "none"}`);
      process.exit(1);
    }
    hex = data.hexes.get(id) ?? null;
  }

  if (!hex) {
    console.error(`No hex "${id}".`);
    process.exit(1);
  }

  // Default action: open the page. Falls back to the text summary if it can't.
  if (!textOnly && campaignPdf && hex.page && openPdfPage(campaignPdf, hex.page)) {
    console.error(
      `Opened Hex ${hex.id} ${hex.name ?? ""} (Campaign Book p.${hex.page}). -t for text.`,
    );
    return;
  }
  print(hex);
}

function print(h: Hex): void {
  console.log(`\nHex ${h.id}${h.name ? `: ${h.name}` : ""}`);
  if (h.terrain) console.log(`  Terrain: ${h.terrain}`);
  if (h.region) console.log(`  Region:  ${h.region}`);
  if (h.entry) console.log(`\n  ${h.entry}`);
  if (h.lostEncounters) console.log(`\n  Lost/encounters: ${h.lostEncounters}`);
  if (h.foraging) console.log(`  Foraging: ${h.foraging}`);
  if (h.links?.length) console.log(`\n  Links: ${h.links.join(", ")}`);
  if (!h.terrain && !h.entry) {
    console.log("\n  (No keyed wilderness entry; detailed as a settlement in the Campaign Book.)");
  }
  console.log();
}
