// Plain-text and Markdown views of the party and its members.

import { abilityMod } from "../rules.ts";
import { coinCount, computeAc, computeLoad, describeLoad, type Load } from "./encumbrance.ts";
import { classOf, kindredOf, type PartyRules } from "./rules.ts";
import { runeStatus } from "./runes.ts";
import { ABILITIES, type Coins, COIN_KINDS, type InvItem, type Party, type PC } from "./store.ts";
import { canLevel, nextLevelXp, xpModifier } from "./xp.ts";

export function loadOf(pc: PC, party: Party, rules: PartyRules): Load {
  return computeLoad(pc, party.encumbrance, rules.enc, rules.catalog);
}

export function kindredClass(pc: PC, rules: PartyRules): string {
  const k = kindredOf(rules, pc.kindred)?.name ?? (pc.kindred || "?");
  const c = classOf(rules, pc.class)?.name ?? (pc.class || "?");
  return `${k} ${c}`;
}

export function formatCoins(c: Coins): string {
  const parts = COIN_KINDS.filter((k) => c[k]).map((k) => `${c[k].toLocaleString()}${k}`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function xpLine(pc: PC, rules: PartyRules): string {
  const klass = classOf(rules, pc.class);
  const next = nextLevelXp(pc, klass);
  const mod = xpModifier(pc, rules);
  const ready = canLevel(pc, klass) ? "  ★ ready to level up" : "";
  return (
    `XP ${pc.xp.toLocaleString()}${next !== null ? ` / ${next.toLocaleString()}` : ""}` +
    `${mod ? ` (${signed(mod)}%)` : ""}${ready}`
  );
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function itemLine(i: InvItem, method: Party["encumbrance"]): string {
  const qty = i.qty !== 1 ? ` ×${i.qty}` : "";
  const note = i.note ? ` (${i.note})` : "";
  const cost =
    method === "slots"
      ? `${i.qty * i.slots} slot${i.qty * i.slots === 1 ? "" : "s"}`
      : `${i.qty * i.weight}`;
  return `  ${pad(`${i.name}${qty}${note}`, 40)} ${cost}`;
}

/** The full text view of one character. */
export function showPc(pc: PC, party: Party, rules: PartyRules): string {
  const load = loadOf(pc, party, rules);
  const ac = computeAc(pc, rules.catalog);
  const out: string[] = [];
  const status = pc.status !== "active" ? ` [${pc.status}]` : "";
  const ret = pc.retainer ? " (retainer)" : "";
  out.push(
    `${pc.name} — ${kindredClass(pc, rules)} ${pc.level}${pc.alignment ? `, ${pc.alignment}` : ""}${ret}${status}`,
  );
  const meta = [
    pc.background && `Background: ${pc.background}`,
    pc.moonSign && `Moon sign: ${pc.moonSign}`,
    pc.player && `Player: ${pc.player}`,
  ].filter(Boolean);
  if (meta.length) out.push(meta.join("   "));
  out.push(
    `HP ${pc.hp}/${pc.maxHp}   AC ${ac}   Attack ${signed(pc.attack)}   ${xpLine(pc, rules)}`,
  );
  out.push(
    ABILITIES.map((a) => {
      const m = abilityMod(pc.scores[a]);
      return `${a.toUpperCase()} ${pc.scores[a]}${m ? ` (${signed(m)})` : ""}`;
    }).join("  "),
  );
  const s = pc.saves;
  out.push(
    `Saves  Doom ${s.doom}  Ray ${s.ray}  Hold ${s.hold}  Blast ${s.blast}  Spell ${s.spell}` +
      (pc.magicResistance ? `  MR ${signed(pc.magicResistance)}` : ""),
  );
  const skills = Object.entries(pc.skills);
  if (skills.length) out.push(`Skills ${skills.map(([k, v]) => `${k} ${v}`).join(", ")}`);
  if (pc.languages.length) out.push(`Languages ${pc.languages.join(", ")}`);

  out.push("");
  out.push(`Load (${party.encumbrance}): ${describeLoad(load)}`);
  for (const p of load.problems) out.push(`  ⚠ ${p}`);
  for (const where of ["equipped", "stowed"] as const) {
    const items = pc.items.filter((i) => i.where === where);
    if (items.length === 0) continue;
    out.push(`${where === "equipped" ? "Equipped" : "Stowed"}`);
    for (const i of items) out.push(itemLine(i, party.encumbrance));
  }
  const coins = coinCount(pc.coins);
  out.push(
    `Coins ${formatCoins(pc.coins)}${coins ? `  (${coins} coins of weight)` : ""}` +
      (coinCount(pc.banked) ? `   Banked ${formatCoins(pc.banked)}` : ""),
  );

  if (pc.glamours.length) out.push(`Glamours ${pc.glamours.join(", ")}`);
  if (pc.runes.length) {
    out.push("Runes");
    for (const r of pc.runes) {
      const st = runeStatus(r, pc, party.day, rules.runes);
      const times = r.times > 1 ? ` ×${r.times}` : "";
      const freq = st.band ? `${st.band.text}${times}` : "frequency unknown";
      const left = st.left === null ? "" : `, ${st.left}/${st.limit} left`;
      out.push(`  ${r.name} (${r.magnitude || "?"}; ${freq}${left})`);
    }
  }
  if (pc.knacks.length) out.push(`Knacks ${pc.knacks.join(", ")}`);
  if (pc.spells.length) out.push(`Spells ${pc.spells.join(", ")}`);
  if (pc.notes.length) {
    out.push("Notes");
    for (const n of pc.notes) out.push(`  ${n}`);
  }
  return out.join("\n");
}

/** The party at a glance. */
export function showParty(party: Party, rules: PartyRules): string {
  if (party.members.length === 0)
    return "The party is empty. Add someone with: dw party import <sheet.pdf> or dw party new";
  const rows = party.members.map((pc) => {
    const load = loadOf(pc, party, rules);
    const klass = classOf(rules, pc.class);
    const next = nextLevelXp(pc, klass);
    const loadCell =
      party.encumbrance === "slots"
        ? `${load.equippedSlots}+${load.stowedSlots} sl`
        : `${load.weight}`;
    return [
      pc.name + (pc.retainer ? " (r)" : "") + (pc.status !== "active" ? ` [${pc.status}]` : ""),
      kindredClass(pc, rules),
      `${pc.level}`,
      `${pc.xp.toLocaleString()}${next !== null ? `/${next.toLocaleString()}` : ""}${canLevel(pc, klass) ? " ★" : ""}`,
      `${pc.hp}/${pc.maxHp}`,
      `${computeAc(pc, rules.catalog)}`,
      loadCell,
      load.speed > 0 ? `${load.speed}` : "0 ⚠",
    ];
  });
  const head = ["Name", "Kindred & Class", "Lvl", "XP", "HP", "AC", "Load", "Speed"];
  const widths = head.map((h, k) => Math.max(h.length, ...rows.map((r) => r[k].length)));
  const fmt = (r: string[]) =>
    r
      .map((c, k) => pad(c, widths[k]))
      .join("  ")
      .trimEnd();
  const active = party.members.filter((m) => m.status === "active");
  const speeds = active.map((m) => loadOf(m, party, rules).speed);
  const slowest = speeds.length ? Math.min(...speeds) : 0;
  return [
    `Party — ${party.encumbrance} encumbrance, day ${party.day}`,
    fmt(head),
    ...rows.map(fmt),
    "",
    `Party Speed ${slowest} (slowest member)`,
  ].join("\n");
}

/** A vault-style Markdown sheet for a party member. */
export function pcMarkdown(pc: PC, party: Party, rules: PartyRules): string {
  const klass = classOf(rules, pc.class);
  const load = loadOf(pc, party, rules);
  const next = nextLevelXp(pc, klass);
  const s = pc.saves;
  const items = (where: "equipped" | "stowed") =>
    pc.items
      .filter((i) => i.where === where)
      .map(
        (i) =>
          `| ${i.name}${i.qty !== 1 ? ` ×${i.qty}` : ""}${i.note ? ` (${i.note})` : ""} | ${where} | ${i.qty * i.weight} | ${i.qty * i.slots} |`,
      );
  const runes = pc.runes.map((r) => {
    const st = runeStatus(r, pc, party.day, rules.runes);
    return `- **${r.name}** (${r.magnitude || "?"}${st.band ? `; ${st.band.text}` : ""})`;
  });
  return `---
type: PC
race: ${pc.kindred}
class: ${klass?.name ?? pc.class}
level: ${pc.level}
xp: ${pc.xp}
next_level: ${next ?? ""}
alignment: ${pc.alignment}
background: ${pc.background}
affiliation: ${pc.affiliation}
moon_sign: ${pc.moonSign}
hp: ${pc.hp}
max_hp: ${pc.maxHp}
ac: ${computeAc(pc, rules.catalog)}
attack: ${pc.attack}
speed: ${load.speed}
languages: [${pc.languages.join(", ")}]
status: ${pc.status}
player: ${pc.player}
---
#pc #${pc.kindred} #${pc.class}

# ${pc.name}

**Kindred & Class:** ${kindredClass(pc, rules)}
**Alignment:** ${pc.alignment}${pc.background ? `\n**Background:** ${pc.background}` : ""}

## Ability Scores

| Ability | Score | Mod |
|---|---|---|
${ABILITIES.map((a) => `| ${a.toUpperCase()} | ${pc.scores[a]} | ${signed(abilityMod(pc.scores[a]))} |`).join("\n")}

## Save Targets

| Doom | Ray | Hold | Blast | Spell | Magic Resistance |
|---|---|---|---|---|---|
| ${s.doom} | ${s.ray} | ${s.hold} | ${s.blast} | ${s.spell} | ${pc.magicResistance} |

## Skill Targets

| Skill | Target |
|---|---|
${Object.entries(pc.skills)
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join("\n")}

## Equipment

**Encumbrance (${party.encumbrance}):** ${describeLoad(load)}

| Item | Carried | Weight | Slots |
|---|---|---|---|
${[...items("equipped"), ...items("stowed")].join("\n")}

**Coins:** ${formatCoins(pc.coins)}${coinCount(pc.banked) ? `  \n**Banked:** ${formatCoins(pc.banked)}` : ""}
${pc.glamours.length ? `\n## Glamours\n\n${pc.glamours.map((g) => `- ${g}`).join("\n")}\n` : ""}${runes.length ? `\n## Runes\n\n${runes.join("\n")}\n` : ""}${pc.knacks.length ? `\n## Knacks\n\n${pc.knacks.map((k) => `- ${k}`).join("\n")}\n` : ""}${pc.spells.length ? `\n## Spells\n\n${pc.spells.map((k) => `- ${k}`).join("\n")}\n` : ""}${pc.notes.length ? `\n## Notes\n\n${pc.notes.map((n) => `- ${n}`).join("\n")}\n` : ""}`;
}
