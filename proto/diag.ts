import { readFileSync } from "node:fs";
import { pdfPath } from "../src/pdf/config.ts";
import { extractPagesEmulated } from "../src/pdf/emulate.ts";
import { extractPages } from "../src/pdf/extract.ts";

const PDF = pdfPath("players");
const ground = extractPages(PDF);
const emulated = await extractPagesEmulated(new Uint8Array(readFileSync(PDF)));

function showRegion(label: string, pages: string[], marker: string, lines = 28) {
  const p = pages.findIndex((t) => t.includes(marker));
  console.log(`\n########## ${label}  (page idx ${p}, marker "${marker}") ##########`);
  if (p < 0) return;
  const ls = pages[p].split("\n");
  const start = ls.findIndex((l) => l.includes(marker));
  for (let i = start; i < Math.min(ls.length, start + lines); i++) {
    console.log(`${String(i).padStart(3)}|${ls[i]}`);
  }
}

showRegion("PDFTOTEXT — ELF NAMES", ground, "ELF NAMES");
showRegion("EMULATED  — ELF NAMES", emulated, "ELF NAMES");
