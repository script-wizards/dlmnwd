// Rendering for the character sheet, shared by the live app (main.ts) and the
// prefilled mock page (mock.ts). Pure DOM building; no parsing or file I/O.

import {
  APPEARANCE_FIELDS,
  type Character,
  PERSONA_ORDER,
  resolvedKindredTraits,
} from "../src/gen/character.ts";
import { parseStatBlock, structureTrait } from "../src/parse/traits.ts";
import { abilityMod } from "../src/rules.ts";

const ABILITIES = ["str", "int", "wis", "dex", "con", "cha"] as const;

// The pixel faces have no curly quotes, primes, dashes, or ellipsis, so book
// text using them renders as tofu. Fold those to the ASCII the font does have.
// On-screen only; the markdown download keeps the originals.
const TYPO: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2032": "'",
  "\u2033": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00A0": " ",
};
export function clean(s: string): string {
  return s.replace(
    /[\u2018\u2019\u201C\u201D\u2032\u2033\u2013\u2014\u2026\u00A0]/g,
    (ch) => TYPO[ch],
  );
}

// ── tiny DOM builder ──────────────────────────────────────────────────────
type Child = Node | string | null | undefined | false;
export function h(tag: string, attrs: Record<string, string> = {}, ...kids: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(typeof kid === "string" ? document.createTextNode(clean(kid)) : kid);
  }
  return node;
}
const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

// runescapecn-style badge: a label with an optional emphasised value.
function badge(label: string, value?: string, variant?: "accent" | "soft"): HTMLElement {
  return h(
    "span",
    { class: variant ? `badge badge--${variant}` : "badge" },
    label,
    value !== undefined ? h("span", { class: "bv" }, value) : null,
  );
}

function section(title: string, body: HTMLElement, span = 12): HTMLElement {
  return h("section", { class: `section span-${span}` }, title ? h("h3", {}, title) : null, body);
}

const ABILITY_LABEL: Record<string, string> = {
  str: "Strength",
  int: "Intelligence",
  wis: "Wisdom",
  dex: "Dexterity",
  con: "Constitution",
  cha: "Charisma",
};

function table(head: string[], rows: HTMLElement[], numeric: boolean[]): HTMLElement {
  const thead = h(
    "thead",
    {},
    h("tr", {}, ...head.map((label, i) => h("th", numeric[i] ? { class: "num" } : {}, label))),
  );
  return h("table", {}, thead, h("tbody", {}, ...rows));
}

// Abilities stacked vertically (one row per ability) for easy parsing.
function abilitiesSection(c: Character): HTMLElement {
  const prime = new Set(c.klass.primeAbilities);
  const rows = ABILITIES.map((a) =>
    h(
      "tr",
      {},
      h(
        "td",
        {},
        ABILITY_LABEL[a],
        prime.has(a)
          ? h("span", { class: "field-label", style: "margin-left:.45rem" }, "prime")
          : null,
      ),
      h("td", { class: "num" }, String(c.scores[a])),
      h("td", { class: "num" }, signed(abilityMod(c.scores[a]))),
    ),
  );
  return section("", table(["Abilities", "Score", "Mod"], rows, [false, true, true]), 4);
}

// Saving throws stacked vertically, one per row.
function savesSection(c: Character): HTMLElement {
  const s = c.klass.saves;
  const mr = c.magicResistance > 0 ? `+${c.magicResistance}` : "0";
  const items: [string, string][] = [
    ["Doom", String(s.doom)],
    ["Ray", String(s.ray)],
    ["Hold", String(s.hold)],
    ["Blast", String(s.blast)],
    ["Spell", String(s.spell)],
    ["Magic Resistance", mr],
  ];
  const rows = items.map(([k, v]) => h("tr", {}, h("td", {}, k), h("td", { class: "num" }, v)));
  return section("", table(["Saving Throws", "Target"], rows, [false, true]), 4);
}

// Skill targets as wrapping chips. Listen/Search/Survival lead, then the rest.
const SKILL_ORDER = ["Listen", "Search", "Survival"];
function skillsSection(c: Character): HTMLElement {
  const rank = (n: string): number => {
    const i = SKILL_ORDER.indexOf(n);
    return i < 0 ? SKILL_ORDER.length : i;
  };
  const entries = Object.entries(c.skills).toSorted(
    (a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]),
  );
  const badges = entries.map(([k, v]) => badge(k, String(v)));
  return section("Skill Targets", h("div", { class: "chips" }, ...badges), 4);
}

function subPoint(s: { kind: string; label?: string; body: string }): HTMLElement {
  if (s.kind === "statblock") {
    const sb = parseStatBlock(s.body);
    if (sb) {
      return h(
        "span",
        { class: "trait-sub statblock" },
        sb.typeLine ? h("span", { class: "sb-type" }, sb.typeLine) : null,
        h(
          "span",
          { class: "sb-stats" },
          ...sb.stats.map((st) =>
            h(
              "span",
              { class: "sb-stat" },
              h("span", { class: "field-label" }, st.label),
              ` ${st.value}`,
            ),
          ),
        ),
      );
    }
  }
  const cls = s.kind === "item" ? "trait-sub trait-item" : "trait-sub";
  return h(
    "span",
    { class: cls },
    s.label ? h("span", { class: "sub-label" }, `${s.label}:`) : null,
    s.label ? ` ${s.body}` : s.body,
  );
}

// One trait: bold name + lead sentence, then structured sub-points indented
// under it. A named sub-heading opens a further-indented group — giving three
// visible levels: name, sub-heading, run-in label.
function traitParagraph(t: { name: string; text: string }): HTMLElement {
  const { lead, subs } = structureTrait(t.text);
  const p = h("p", { class: "trait" }, h("span", { class: "tn" }, `${t.name}. `), lead);
  if (subs.length === 0) return p;
  // All sub-points sit in an indented body so they read as part of this trait.
  const body = h("span", { class: "trait-body" });
  p.append(body);
  let group = body;
  for (const s of subs) {
    if (s.kind === "subhead") {
      body.append(h("span", { class: "trait-subhead" }, s.body));
      group = h("span", { class: "trait-nest" });
      body.append(group);
    } else {
      group.append(subPoint(s));
    }
  }
  return p;
}

// One abilities block (kindred or class), name and description, two-column flow.
// The section is titled by the group ("<Kindred> Abilities"), so no separate
// "Kindred & Class Traits" header is needed — the source is self-evident.
function traitSection(title: string, traits: Character["kindred"]["traits"]): HTMLElement | null {
  if (traits.length === 0) return null;
  const list = h("div", { class: "trait-list" });
  for (const t of traits) list.append(traitParagraph(t));
  return section(title, list);
}

function languagesSection(c: Character): HTMLElement {
  const langBadges = c.languages.map((l) => badge(l));
  if (c.extraLanguages > 0)
    langBadges.push(badge(`+${c.extraLanguages} of choice`, undefined, "soft"));
  const body = langBadges.length
    ? h("div", { class: "chips" }, ...langBadges)
    : h("p", { class: "hint", style: "margin:0" }, "None");
  return section("Languages", body, 4);
}

// Equipment as a tall vertical table — roughly double the height of the
// abilities/saves tables, since a starting character carries many items.
function gearSection(c: Character): HTMLElement {
  const rows: HTMLElement[] = [];

  // Loadout.
  rows.push(
    h("tr", {}, h("td", {}, "Armour"), h("td", {}, `${c.loadout.armour} (AC ${c.loadout.baseAc})`)),
  );
  for (const w of c.weapons) {
    rows.push(h("tr", {}, h("td", {}, "Weapon"), h("td", {}, w)));
  }
  for (const item of c.classItems) {
    rows.push(h("tr", {}, h("td", {}, "Class item"), h("td", {}, item)));
  }
  rows.push(h("tr", {}, h("td", {}, "Gold"), h("td", {}, `${c.gold} gp`)));

  // General starting gear.
  for (const g of c.generalItems) {
    rows.push(h("tr", {}, h("td", {}, "Gear"), h("td", {}, g)));
  }

  // Adventuring items.
  for (const g of c.adventuringItems) {
    rows.push(h("tr", {}, h("td", {}, "Item"), h("td", {}, g)));
  }

  // Spell book — name only; the spell list and details live in the Magic section.
  if (c.spellBook) {
    rows.push(h("tr", {}, h("td", {}, "Spell book"), h("td", {}, c.spellBook.name)));
  }

  // Trinket lives in the persona section, not here.
  return section("", table(["Item", "Detail"], rows, [false, false]), 4);
}

function kvSection(title: string, rows: [string, string][]): HTMLElement | null {
  const present = rows.filter(([, v]) => v);
  if (present.length === 0) return null;
  const dl = h("dl", { class: "kv" });
  for (const [k, v] of present) dl.append(h("div", {}, h("dt", {}, k), h("dd", {}, v)));
  return section(title, dl, 4);
}

// Physique: rolled body stats plus the appearance persona fields.
function physiqueSection(c: Character): HTMLElement | null {
  const p = c.physique;
  const rows: [string, string][] = [
    ["Age", p?.age ?? ""],
    ["Height", p?.height ?? ""],
    ["Weight", p?.weight ?? ""],
    ["Lifespan", p?.lifespan ?? ""],
    ...APPEARANCE_FIELDS.map((f): [string, string] => [f, c.persona[f] ?? ""]),
  ];
  return kvSection("Physique", rows);
}

// Persona: manner and inner life (appearance lives in Physique). Ordered for a
// consistent read; anything unlisted keeps its parsed order at the end.
function personaRank(f: string): number {
  const i = PERSONA_ORDER.indexOf(f.toLowerCase());
  return i < 0 ? PERSONA_ORDER.length : i;
}

function personaSection(c: Character): HTMLElement | null {
  const entries = Object.entries(c.persona).filter(([f]) => !APPEARANCE_FIELDS.includes(f));
  if (entries.length === 0 && !c.trinket) return null;
  const dl = h("dl", { class: "kv" });
  for (const [field, value] of entries.toSorted((a, b) => personaRank(a[0]) - personaRank(b[0]))) {
    dl.append(h("div", {}, h("dt", {}, field), h("dd", {}, value)));
  }
  if (c.trinket) {
    dl.append(h("div", {}, h("dt", {}, "Trinket"), h("dd", {}, c.trinket)));
  }
  return section("Persona", dl, 4);
}

/** The blank canvas shown before a character is generated. */
export function renderEmpty(sheet: HTMLElement): void {
  sheet.dataset.state = "empty";
  sheet.classList.remove("reveal");
  sheet.replaceChildren(
    h(
      "div",
      { class: "empty" },
      h("div", { class: "glyph" }, "[ ? ]"),
      h("p", { class: "say" }, "No character yet"),
      h(
        "p",
        { class: "sub" },
        "Choose your Player's Book, pick a kindred and class, then Generate.",
      ),
    ),
  );
}

// One casting entry (spell or glamour), shaped like a trait: bold name, an
// optional uppercase tag, a Duration/Range stat line, then body prose. Every
// size here comes from the sheet's existing three type tokens (trait body,
// trait-group header, field-label) so the block reads as one hierarchy.
function castingEntry(
  name: string,
  tag: string | null,
  duration: string | null,
  range: string | null,
  body: string | null,
): HTMLElement {
  const stat =
    duration || range
      ? h(
          "span",
          { class: "cast-stat" },
          duration ? h("span", { class: "field-label" }, "Duration") : null,
          duration ? `${duration} ` : null,
          range ? h("span", { class: "field-label" }, "Range") : null,
          range ? range : null,
        )
      : null;
  return h(
    "p",
    { class: "trait cast" },
    h("span", { class: "tn" }, `${name} `),
    tag ? h("span", { class: "cast-tag" }, tag) : null,
    stat,
    body ? h("span", { class: "cast-body" }, body) : null,
  );
}

// Magician's known spells, each with its tradition/rank tag and stat line.
function spellsSection(c: Character): HTMLElement | null {
  const spells = c.magic.spells;
  if (spells.length === 0) return null;
  const list = h("div", { class: "trait-list" });
  for (const spell of spells) {
    const tag = [spell.tradition, spell.rank ? `Rank ${spell.rank}` : ""].filter(Boolean).join(" ");
    list.append(castingEntry(spell.name, tag || null, spell.duration, spell.range, spell.body));
  }
  return section("Spells", list);
}

// Rolled glamours (enchanters, elves, grimalkins). No tradition tag.
function glamoursSection(c: Character): HTMLElement | null {
  const glamours = c.magic.glamours;
  if (glamours.length === 0) return null;
  const list = h("div", { class: "trait-list" });
  for (const g of glamours) {
    list.append(castingEntry(g.name, null, g.duration, g.range, g.body));
  }
  return section("Glamours", list);
}

// Knacks (mosslings): level-gated abilities, so rendered like a trait.
function knacksSection(c: Character): HTMLElement | null {
  const knacks = c.magic.knacks;
  if (knacks.length === 0) return null;
  const list = h("div", { class: "trait-list" });
  for (const k of knacks) list.append(traitParagraph(k));
  return section("Knacks", list);
}

/** Render the full sheet, filling in (with a staggered reveal) on each call. */
export function renderSheet(sheet: HTMLElement, c: Character): void {
  const meta = h(
    "div",
    { class: "sheet-sub-row" },
    badge("Level 1"),
    badge(c.kindred.name),
    badge(c.klass.name),
    badge(c.alignment),
    ...(c.background ? [badge(c.background)] : []),
  );
  const head = h(
    "div",
    { class: "sheet-head" },
    h("div", {}, h("h2", { class: "sheet-name" }, c.name), meta),
  );
  const statline = h(
    "dl",
    { class: "statline" },
    h("div", {}, h("dt", {}, "Hit Points"), h("dd", {}, String(c.hp))),
    h("div", {}, h("dt", {}, "Armour Class"), h("dd", {}, String(c.loadout.ac))),
    h("div", {}, h("dt", {}, "Attack"), h("dd", {}, signed(c.klass.attack))),
    h("div", {}, h("dt", {}, "Speed"), h("dd", {}, String(c.speed))),
    h("div", {}, h("dt", {}, "Gold"), h("dd", {}, String(c.gold))),
    h("div", {}, h("dt", {}, "XP to L2"), h("dd", {}, c.klass.nextLevelXp.toLocaleString())),
  );
  // Three columns: abilities + skills/languages/persona stacked on the left,
  // saves in the middle, equipment on the right. Traits span full width below.
  const stack = (...secs: (HTMLElement | null)[]): HTMLElement =>
    h("div", { class: "stack span-4" }, ...secs.filter((n): n is HTMLElement => n !== null));
  const kindredTraits = traitSection(`${c.kindred.name} Abilities`, resolvedKindredTraits(c));
  const classTraits = traitSection(`${c.klass.name} Abilities`, c.klass.traits);
  const spells = spellsSection(c);
  const glamours = glamoursSection(c);
  const knacks = knacksSection(c);
  const grid = h(
    "div",
    { class: "sheet-grid" },
    // Physique (tall) sits under the left stack, Languages (short) under the
    // middle, so the two columns balance beside the tall Persona.
    stack(abilitiesSection(c), skillsSection(c), physiqueSection(c)),
    stack(savesSection(c), languagesSection(c), personaSection(c)),
    gearSection(c),
  );
  // The prose sections (abilities, spells, glamours, knacks) flow as one block.
  // On screen each keeps its own two-column trait list; in print the whole block
  // becomes a single newspaper flow (down one column, then the next).
  const abilityFlow = h(
    "div",
    { class: "ability-flow" },
    ...[kindredTraits, classTraits, spells, glamours, knacks].filter(
      (n): n is HTMLElement => n !== null,
    ),
  );

  const blocks = [head, statline, grid, abilityFlow];
  blocks.forEach((node, i) => node.style.setProperty("--i", String(i)));
  sheet.dataset.state = "full";
  sheet.replaceChildren(...blocks);
  // Restart the reveal animation on each generate.
  sheet.classList.remove("reveal");
  void sheet.offsetWidth;
  sheet.classList.add("reveal");
}
