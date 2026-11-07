// Turn the filled-in fields of a fillable character sheet into a party member.
// Field names are the sheet's plain labels ("Strength", "Equipped Item 3",
// "Other Notes"); the kindred and class are recognised from the names the book
// itself defines. Pure: the fields and rules are passed in.

import { computeAc } from "./encumbrance.ts";
import { addItem, makeItem } from "./items.ts";
import type { PartyRules } from "./rules.ts";
import { lookupRune } from "./runes.ts";
import { ABILITIES, type Ability, blankPc, type EncMethod, type PC } from "./store.ts";

const ABILITY_FIELD: Record<Ability, string> = {
  str: "Strength",
  int: "Intelligence",
  wis: "Wisdom",
  dex: "Dexterity",
  con: "Constitution",
  cha: "Charisma",
};

export interface ImportResult {
  pc: PC;
  /** Things worth telling the user: unknown items, weight disagreements, … */
  messages: string[];
  /** The encumbrance method ticked on the sheet, if any. */
  encumbrance?: EncMethod;
}

function int(s: string | undefined, fallback = 0): number {
  if (!s) return fallback;
  const n = parseInt(s.replace(/[^\d+-]/g, "").replace(/^\+/, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clean(s: string | undefined): string {
  return (s ?? "").replace(/\r/g, "").trim();
}

function findName<T extends { id: string; name: string }>(text: string, items: T[]): T | undefined {
  const t = text.toLowerCase();
  // Prefer the earliest mention, so "Human Abilities … Hunter Abilities" reads
  // the kindred from the first trait line.
  let best: { item: T; at: number } | undefined;
  for (const item of items) {
    const m = new RegExp(`\\b${item.name.toLowerCase()}\\b`).exec(t);
    if (m && (!best || m.index < best.at)) best = { item, at: m.index };
  }
  return best?.item;
}

/** Match a free-text name to the book's spelling ("cloak of stars" → "Cloak of Stars"). */
function canonical(name: string, known: string[]): string {
  const n = name.trim().toLowerCase();
  return known.find((k) => k.toLowerCase() === n) ?? name.trim();
}

function list(s: string): string[] {
  return s
    .split(/\s*[,;]\s*/)
    .map((x) => x.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

export function pcFromSheet(f: Record<string, string>, rules: PartyRules): ImportResult {
  const messages: string[] = [];
  const pc = blankPc(clean(f["Name"]) || "(unnamed)");

  // Kindred and class: from the "Kindred & Class" box, else the trait headings.
  const kcText = [
    f["Kindred & Class"],
    f["Kindred & Class Traits 1"],
    f["Kindred & Class Traits 2"],
  ]
    .map(clean)
    .join("\n");
  const kindred = findName(kcText, rules.kindreds);
  const klass = findName(kcText, rules.classes);
  pc.kindred = kindred?.id ?? "";
  pc.class = klass?.id ?? "";
  if (!kindred) messages.push("kindred not recognised; set it with: dw pc <name> set kindred=<id>");
  if (!klass) messages.push("class not recognised; set it with: dw pc <name> set class=<id>");

  pc.background = clean(f["Background"]);
  pc.alignment = clean(f["Alignment"]);
  pc.affiliation = clean(f["Affiliation"]);
  pc.moonSign = clean(f["Moon Sign"]);
  pc.player = clean(f["Player"]);
  for (const a of ABILITIES) pc.scores[a] = int(f[ABILITY_FIELD[a]], 10);
  pc.maxHp = int(f["Max Hit Points"], 1);
  pc.hp = int(f["Hit Points"], pc.maxHp);
  pc.level = Math.max(1, int(f["Level"], 1));
  pc.xp = int(f["XP"]);
  pc.attack = int(f["Attack"]);
  pc.magicResistance = int(f["Magic Resistance"]);
  pc.saves = {
    doom: int(f["Doom"]),
    ray: int(f["Ray"]),
    hold: int(f["Hold"]),
    blast: int(f["Blast"]),
    spell: int(f["Spell"]),
  };

  // Skills: the three standard boxes plus "Extra Skill N" ("Tracking 5").
  for (const s of ["Listen", "Search", "Survival"]) if (f[s]) pc.skills[s] = int(f[s]);
  for (let n = 1; n <= 12; n++) {
    const m = clean(f[`Extra Skill ${n}`]).match(/^(.*?)\.?\s+(\d+)$/);
    if (m) pc.skills[m[1]] = int(m[2]);
  }

  // Languages: "Common, Gnomish" / "0 additional".
  pc.languages = [f["Languages 1"], f["Languages 2"], f["Languages 3"]]
    .flatMap((l) => list(clean(l)))
    .filter((l) => !/\badditional\b/i.test(l));

  // Inventory. The book's listed weight wins over a hand-written one; any
  // disagreement is reported so the sheet can be checked.
  const { catalog, enc } = rules;
  for (const where of ["equipped", "stowed"] as const) {
    const label = where === "equipped" ? "Equipped Item" : "Stowed Item";
    for (let n = 1; n <= 30; n++) {
      const text = clean(f[`${label} ${n}`]);
      if (!text) continue;
      const sheetWeight = clean(f[`${label} Weight ${n}`]);
      const { inv, resolved } = makeItem(catalog, enc, text, { where, keepName: true });
      if (!resolved.item) {
        // Unknown to the book: trust the sheet's number (a line total).
        inv.weight = sheetWeight ? Math.round(int(sheetWeight) / inv.qty) : 0;
        messages.push(
          `"${text}" isn't in the book's equipment lists; weight ${inv.weight * inv.qty}` +
            (sheetWeight ? " (from the sheet)" : "") +
            `. Fix with: dw pc ${firstName(pc)} item set "${text}" weight=N`,
        );
      } else if (sheetWeight && int(sheetWeight) !== inv.weight * inv.qty) {
        messages.push(
          `${text}: sheet says ${int(sheetWeight)}, book lists ${resolved.item.name} at ${inv.weight * inv.qty}; using the book`,
        );
      }
      addItem(pc, inv);
    }
  }
  for (const line of clean(f["Tiny Items"]).split(/\n+/)) {
    const t = line.trim();
    if (!t) continue;
    pc.items.push({
      name: t,
      qty: 1,
      weight: enc.trinketWeight,
      slots: 0,
      where: "stowed",
      note: "tiny",
    });
  }

  pc.coins = {
    cp: int(f["Copper Pieces"]),
    sp: int(f["Silver Pieces"]),
    gp: int(f["Gold Pieces"]),
    // The fourth coin's name varies by setting; take whatever "<X> Pieces" is left.
    pp: int(
      Object.entries(f).find(
        ([k]) => /^\w+ Pieces$/.test(k) && !/^(Copper|Silver|Gold) /.test(k),
      )?.[1],
    ),
  };

  // Other Notes: "Glamours: a, b" / "Rune: x" / "Knack: y" lines become lists;
  // everything else is kept as notes.
  for (const raw of clean(f["Other Notes"]).split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(glamours?|runes?|knacks?|spells?)\s*:\s*(.+)$/i);
    if (!m) {
      pc.notes.push(line);
      continue;
    }
    const kind = m[1].toLowerCase().replace(/s$/, "");
    for (const name of list(m[2])) {
      if (kind === "glamour") pc.glamours.push(canonical(name, rules.glamours));
      else if (kind === "knack") pc.knacks.push(canonical(name, rules.knacks));
      else if (kind === "spell") pc.spells.push(name);
      else {
        const entry = lookupRune(rules.runes, name);
        if (!entry) messages.push(`rune "${name}" isn't in the book's rune lists; kept as unknown`);
        pc.runes.push({
          name: entry?.name ?? name,
          magnitude: entry?.magnitude ?? "",
          times: 1,
          uses: [],
        });
      }
    }
  }

  // Keep the sheet's AC: whatever the gear doesn't explain is a standing bonus.
  const sheetAc = int(f["Armour Class"], 0);
  if (sheetAc) {
    pc.acBonus = 0;
    pc.acBonus = sheetAc - computeAc(pc, catalog);
  }

  const weightOn = /^(?!off$).+/i.test(clean(f["Weight Encumbrance"]));
  const slotOn = /^(?!off$).+/i.test(clean(f["Slot Encumbrance"]));
  const encumbrance: EncMethod | undefined =
    weightOn && !slotOn ? "weight" : slotOn && !weightOn ? "slots" : undefined;
  return { pc, messages, encumbrance };
}

export function firstName(pc: PC): string {
  return pc.name.split(/\s+/)[0] ?? pc.name;
}
