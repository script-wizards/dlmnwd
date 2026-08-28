// Client-side Dolmenwood character generator. The whole pipeline (parse the
// user's PDF, build the kindred/class data, roll a character) runs in the
// browser, so the book content never leaves the machine. Same parsers as the
// CLI, fed by the pdf.js layout emulator instead of pdftotext. The sheet
// rendering lives in sheet.ts (shared with the mock page).

// Importing the worker module runs pdf.js on the main thread (it sets
// globalThis.pdfjsWorker on import), so there is no separate worker file to
// fetch. That keeps the app bundleable into a single self-contained HTML that
// still parses PDFs, at the cost of a brief pause while a book is read.
import "pdfjs-dist/legacy/build/pdf.worker.min.mjs";

import { generate, type SpellDetail, toMarkdown } from "../src/gen/character.ts";
import { parseAdventuringItems } from "../src/parse/equipment.ts";
import { parseGlamourDetails, parseGlamoursTable } from "../src/parse/glamour.ts";
import { type KnackEntry, parseKnacks } from "../src/parse/knack.ts";
import { parseSymbioticFlesh } from "../src/parse/symbiotic-flesh.ts";
import { parseSpells } from "../src/parse/spell.ts";
import { extractPagesEmulated } from "../src/pdf/emulate.ts";
import { type ParsedClass, parseClasses } from "../src/parse/class.ts";
import { type ParsedKindred, parseKindreds } from "../src/parse/kindred.ts";
import type { GlamourEntry } from "../src/parse/glamour.ts";
import { canBeAlignment, canBeClass, rollKindredClass } from "../src/rules.ts";
import { renderEmpty, renderSheet } from "./sheet.ts";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const fileInput = $<HTMLInputElement>("file");
const pick = $<HTMLButtonElement>("pick");
const status = $<HTMLParagraphElement>("status");
const kindredSel = $<HTMLSelectElement>("kindred");
const classSel = $<HTMLSelectElement>("class");
const alignmentSel = $<HTMLSelectElement>("alignment");
const nameInput = $<HTMLInputElement>("name");
const playerInput = $<HTMLInputElement>("player");
const generateBtn = $<HTMLButtonElement>("generate");
const printBtn = $<HTMLButtonElement>("print");
const downloadBtn = $<HTMLButtonElement>("download");
const sheet = $<HTMLElement>("sheet");

// The rite's fields stay visible but inert until a book is offered.
const riteFields = [kindredSel, classSel, alignmentSel, nameInput, playerInput, generateBtn];
function setRiteEnabled(on: boolean): void {
  for (const el of riteFields) el.disabled = !on;
}

let kindreds: ParsedKindred[] = [];
let classes: ParsedClass[] = [];
let adventuringItems: string[] = [];
let glamoursTable: string[] = [];
let glamourDetails: Map<string, GlamourEntry> = new Map();
let knacks: KnackEntry[] = [];
let symbioticFlesh: string[] = [];
// Spell details keyed by lowercased name, parsed straight from the PDF pages —
// the browser has no SQLite, so this stands in for the CLI's spell DB lookup.
let spellRows: Map<string, SpellDetail> = new Map();
let lastMarkdown = "";
let lastName = "character";

// ── load & parse ──────────────────────────────────────────────────────────
pick.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  // Clear the value so picking the same file again still fires `change`.
  fileInput.value = "";
  if (file) void load(file);
});

function setStatus(msg: string, kind: "info" | "error" = "info"): void {
  status.textContent = msg;
  status.dataset.kind = kind;
}

const opt = (value: string, label: string): HTMLOptionElement => {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
};

// The empty value in either dropdown means "roll it for me".
const RANDOM = "";
const randomOpt = (): HTMLOptionElement => opt(RANDOM, "Random");

/** Rebuild the class dropdown, graying out classes the selected kindred can't take. */
function updateClassOptions(): void {
  const kindred = kindreds.find((k) => k.id === kindredSel.value);
  const prev = classSel.value;
  classSel.replaceChildren(randomOpt());
  for (const c of classes) {
    const allowed = kindred ? canBeClass(kindred.kindredType, c.id) : true;
    const o = opt(c.id, c.name);
    if (!allowed) o.disabled = true;
    classSel.append(o);
  }
  // Preserve the selection if still valid, else fall back to a random class.
  classSel.value = [...classSel.options].some((o) => o.value === prev && !o.disabled)
    ? prev
    : RANDOM;
  updateAlignmentOptions();
}

/** Toggle the Chaotic alignment option's disabled state based on the class. A
 *  random class stays compatible with Chaotic: the roll skips the classes that
 *  forbid it. */
function updateAlignmentOptions(): void {
  const klass = classes.find((c) => c.id === classSel.value);
  const chaoticOpt = [...alignmentSel.options].find((o) => o.value === "Chaotic");
  if (!chaoticOpt) return;
  const allowed = klass ? canBeAlignment(klass.id, "Chaotic") : true;
  chaoticOpt.disabled = !allowed;
  if (!allowed && alignmentSel.value === "Chaotic") {
    alignmentSel.value = "Neutral";
  }
}

kindredSel.addEventListener("change", updateClassOptions);
classSel.addEventListener("change", updateAlignmentOptions);

async function load(file: File): Promise<void> {
  setStatus(`Reading ${file.name}…`);
  // Reset any prior rite so a failed/partial load can't leave a stale sheet,
  // download button, or markdown around.
  setRiteEnabled(false);
  downloadBtn.hidden = true;
  printBtn.hidden = true;
  renderEmpty(sheet);
  lastMarkdown = "";
  pick.disabled = true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pages = await extractPagesEmulated(bytes);

    classes = parseClasses(pages);
    kindreds = parseKindreds(pages);
    adventuringItems = parseAdventuringItems(pages);
    glamoursTable = parseGlamoursTable(pages);
    glamourDetails = parseGlamourDetails(pages, glamoursTable);
    knacks = parseKnacks(pages);
    symbioticFlesh = parseSymbioticFlesh(pages);
    spellRows = new Map(
      parseSpells(pages).map((s) => [
        s.name.toLowerCase(),
        {
          name: s.name,
          tradition: s.tradition ?? null,
          rank: s.rank ?? null,
          duration: s.duration ?? null,
          range: s.range ?? null,
          body: s.body,
          page: s.source.page,
        },
      ]),
    );

    if (kindreds.length === 0 || classes.length === 0) {
      setStatus("No kindreds or classes found. Is this the Dolmenwood Player's Book?", "error");
      return;
    }

    kindredSel.replaceChildren(randomOpt(), ...kindreds.map((k) => opt(k.id, k.name)));
    updateClassOptions();
    setRiteEnabled(true);
    setStatus(`Loaded ${kindreds.length} kindreds, ${classes.length} classes.`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    setStatus(`Couldn't read that PDF: ${detail}`, "error");
  } finally {
    pick.disabled = false;
  }
}

// ── generate & download ────────────────────────────────────────────────────
generateBtn.addEventListener("click", () => {
  const rolled = rollKindredClass(kindreds, classes, {
    kindred: kindreds.find((k) => k.id === kindredSel.value),
    klass: classes.find((c) => c.id === classSel.value),
    alignment: alignmentSel.value,
  });
  if (!rolled) {
    setStatus("No kindred and class satisfy those constraints.", "error");
    return;
  }
  const { kindred, klass } = rolled;

  const character = generate(kindred, klass, {
    name: nameInput.value.trim() || undefined,
    player: playerInput.value.trim() || undefined,
    alignment: alignmentSel.value,
    adventuringItems,
    spellRows,
    glamoursTable,
    glamourDetails,
    knacks,
    symbioticFlesh,
  });
  lastMarkdown = toMarkdown(character);
  lastName = character.name;
  renderSheet(sheet, character);
  printBtn.hidden = false;
  downloadBtn.hidden = false;
});

printBtn.addEventListener("click", () => window.print());

// ── theme ──────────────────────────────────────────────────────────────────
// The head script in index.html applies the stored choice before first paint;
// this only cycles auto → dark → light and keeps the control's label in sync.
const themeBtn = $<HTMLButtonElement>("theme");
type Theme = "auto" | "dark" | "light";
const nextTheme: Record<Theme, Theme> = { auto: "dark", dark: "light", light: "auto" };

function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "dark" || t === "light" ? t : "auto";
}

function applyTheme(theme: Theme): void {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  themeBtn.textContent = `theme:${theme}`;
  themeBtn.setAttribute("aria-label", `Color theme: ${theme}`);
  try {
    if (theme === "auto") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {}
}

applyTheme(currentTheme());
themeBtn.addEventListener("click", () => applyTheme(nextTheme[currentTheme()]));

downloadBtn.addEventListener("click", () => {
  if (!lastMarkdown) return;
  const safe = lastName.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "character";
  const url = URL.createObjectURL(new Blob([lastMarkdown], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.md`;
  a.click();
  // Revoke on the next macrotask so the download navigation has started; some
  // browsers cancel the download if the URL is revoked synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

// Paint the demo character on first load — shows what the tool produces,
// inviting the user to load their own PDF.
import { demoCharacter } from "./demo.ts";
renderSheet(sheet, demoCharacter);
