import { ensureBuilt } from "../build.ts";
import { loadData } from "../data.ts";
import { childrenOf, findMonsters, monsterCount, monsterPickerRows, openDb } from "../db.ts";
import { canPick, pickWithFzf } from "../fzf.ts";
import { pdfPath } from "../pdf/config.ts";
import { openPdfPage } from "../pdf/open.ts";
import type { Monster } from "../schema.ts";

export function cmdMon(args: string[]): void {
  const open = args.includes("--open") || args.includes("-o");
  const q = args
    .filter((a) => !a.startsWith("-"))
    .join(" ")
    .toLowerCase()
    .trim();

  // Prefer the Monster Book index if configured; fall back to homebrew JSON.
  let monstersPdf: string | undefined;
  try {
    monstersPdf = pdfPath("monsters");
  } catch {
    monstersPdf = undefined;
  }

  let matches: Monster[];
  let term = q;
  const db = monstersPdf ? openDb() : undefined;
  if (monstersPdf && db) {
    ensureBuilt(db, "monsters", monstersPdf);
    if (!term) {
      if (!canPick()) {
        console.error(`usage: dw mon <name>  (${monsterCount(db)} monsters indexed)`);
        process.exit(1);
      }
      // Rows are "Name<tab>↳ sub-creatures"; field 1 is the real name, so the
      // preview and the returned selection both read the tab-delimited first field.
      const picked = pickWithFzf(monsterPickerRows(db), "dw mon {1}", ["--delimiter", "\t"]);
      if (!picked) return; // cancelled
      term = picked.split("\t")[0].toLowerCase();
    }
    matches = findMonsters(db, term);
  } else {
    const all = [...loadData().monsters.values()];
    if (!term) {
      console.error(`usage: dw mon <name>. Known: ${all.map((m) => m.name).join(", ") || "none"}`);
      process.exit(1);
    }
    matches = all.filter((m) => m.id.includes(term) || m.name.toLowerCase().includes(term));
  }

  if (matches.length === 0) {
    console.error(`No monster matching "${q}".`);
    process.exit(1);
  }
  // Only flag ambiguity when the top hit is not an exact name/id match — a
  // precise pick (e.g. from the fzf picker) resolves cleanly without the noise.
  const exact = matches[0].name.toLowerCase() === term || matches[0].id === term;
  if (matches.length > 1 && !exact) {
    console.log(`Multiple matches (showing first): ${matches.map((m) => m.name).join(", ")}`);
  }
  const m = matches[0];
  if (open && monstersPdf && m.page && openPdfPage(monstersPdf, m.page)) {
    console.error(`Opened ${m.name} (Monster Book p.${m.page}).`);
    return;
  }
  print(m, db ? childrenOf(db, m.name) : []);
}

function line(label: string, v: unknown): void {
  if (v !== undefined && v !== "") console.log(`  ${label.padEnd(10)} ${v}`);
}

// Greedy word-wrap to a column width, for readable multi-line flavour text.
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
  if (cur) out.push(cur);
  return out;
}

// `nested` renders a child stat block under its parent: it drops the redundant
// "Part of …" line and the trailing blank so blocks stack tightly.
function print(m: Monster, children: Monster[] = [], nested = false): void {
  const tags = [m.level ? `Level ${m.level}` : "", m.category, m.intelligence, m.alignment]
    .filter(Boolean)
    .join(" · ");
  console.log(`\n${m.name}${tags ? `\n${tags}` : ""}`);
  if (m.parent && !nested) console.log(`Part of ${m.parent}`);
  if (m.description) {
    console.log();
    for (const ln of wrap(m.description, 72)) console.log(`  ${ln}`);
    console.log();
  }

  line("AC", m.ac);
  line("HP", m.hd);
  line("Saves", m.saves);
  line("Attacks", m.attacks);
  line("Speed", m.movement);
  line("Morale", m.morale);
  line("XP", m.xp);
  line("No. App.", m.numberAppearing);
  line("Hoard", m.treasure);
  for (const s of m.special ?? []) {
    const [first, ...rest] = wrap(s, 70);
    console.log(`  - ${first}`);
    for (const ln of rest) console.log(`    ${ln}`); // hanging indent under the text
  }
  if (m.notes) console.log(`  ${m.notes}`);
  for (const child of children) {
    console.log(`\n  ${"─".repeat(48)}`);
    print(child, [], true);
  }
  if (!nested) console.log();
}
