import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { ensureBuilt } from "../build.ts";
import { openDb } from "../db.ts";
import { pdfPath } from "../pdf/config.ts";
import { readFormFields } from "../pdf/fields.ts";
import { pcFromSheet } from "../party/import.ts";
import { loadOf, showParty } from "../party/render.ts";
import { emptyRules, loadRules, type PartyRules } from "../party/rules.ts";
import {
  ENC_METHODS,
  type EncMethod,
  findMember,
  loadParty,
  type Party,
  partyPath,
  saveParty,
} from "../party/store.ts";
import { awardParty, grantXp } from "../party/xp.ts";
import { characterToPc, rollCharacter } from "./new.ts";

const USAGE = `usage: dw party [command]
  (none)                     the party at a glance: level, XP, HP, AC, load, Speed
  import <sheet.pdf…>        add characters from filled-in fillable PDF sheets
                               (--replace to overwrite a member of the same name)
  new [kindred] [class]      roll a level-1 PC straight into the party
                               (--name=, --player=, --alignment=)
  rm <name>                  remove a member (or: dw pc <name> set status=dead)
  xp <amount> [name…]        divide XP evenly among active members (or those named),
                               applying each one's XP modifier  (--each: give everyone
                               the full amount)
  enc [weight|slots|basic]   show or set the encumbrance method
  rest [days]                advance the campaign day (resets daily rune uses)
  path                       where the party file lives

Then manage each member with dw pc <name> …  (dw pc help)`;

/** The party plus the rules from the indexed Player's Book (defaults without one). */
export function partyContext(): { party: Party; rules: PartyRules } {
  let rules = emptyRules();
  try {
    const db = openDb();
    try {
      ensureBuilt(db, "players", pdfPath("players"));
    } catch {
      // No Player's Book configured: carry on with whatever is indexed.
    }
    rules = loadRules(db);
  } catch {
    // No database: defaults only.
  }
  if (rules.catalog.length === 0)
    process.stderr.write(
      "dw: no equipment lists indexed (configure the Player's Book); item weights are unknown\n",
    );
  return { party: loadParty(), rules };
}

function positional(args: string[]): string[] {
  return args.filter((a) => !a.startsWith("-") || /^-\d/.test(a));
}

export async function cmdParty(args: string[]): Promise<void> {
  const [sub, ...rest] = positional(args);
  const flags = new Set(args.filter((a) => a.startsWith("--") || /^-[a-z]$/i.test(a)));
  if (sub === "help" || args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  if (sub === "path") {
    console.log(partyPath());
    return;
  }
  const { party, rules } = partyContext();

  switch (sub) {
    case undefined:
    case "list":
    case "ls":
      console.log(showParty(party, rules));
      return;

    case "import": {
      if (rest.length === 0) throw new Error("usage: dw party import <sheet.pdf…> [--replace]");
      const replace = flags.has("--replace");
      for (const file of rest) {
        // oxlint-disable-next-line no-await-in-loop
        const fields = await readFormFields(new Uint8Array(readFileSync(file)));
        if (Object.keys(fields).length === 0) {
          console.error(`${basename(file)}: no form fields found (is it a fillable sheet?)`);
          continue;
        }
        const { pc, messages, encumbrance } = pcFromSheet(fields, rules);
        const existing = party.members.findIndex(
          (m) => m.name.toLowerCase() === pc.name.toLowerCase(),
        );
        if (existing >= 0 && !replace) {
          console.error(`${pc.name} is already in the party; --replace to overwrite.`);
          continue;
        }
        if (existing >= 0) party.members[existing] = pc;
        else party.members.push(pc);
        if (encumbrance && party.members.length === 1) party.encumbrance = encumbrance;
        const load = loadOf(pc, party, rules);
        console.log(
          `${existing >= 0 ? "Replaced" : "Added"} ${pc.name} (level ${pc.level}, ${pc.items.length} items) from ${basename(file)}`,
        );
        for (const m of messages) console.log(`  · ${m}`);
        for (const p of load.problems) console.log(`  ⚠ ${p}`);
      }
      saveParty(party);
      return;
    }

    case "new": {
      const character = rollCharacter(args.filter((a) => a !== sub));
      const pc = characterToPc(character, rules);
      if (party.members.some((m) => m.name.toLowerCase() === pc.name.toLowerCase()))
        throw new Error(`${pc.name} is already in the party; pass --name= to choose another.`);
      party.members.push(pc);
      saveParty(party);
      console.log(
        `Added ${pc.name}, a level-1 ${character.kindred.name} ${character.klass.name} (HP ${pc.hp}). See: dw pc ${pc.name.split(" ")[0]}`,
      );
      return;
    }

    case "rm":
    case "remove": {
      if (!rest[0]) throw new Error("usage: dw party rm <name>");
      const pc = findMember(party, rest.join(" "));
      party.members = party.members.filter((m) => m !== pc);
      saveParty(party);
      console.log(`Removed ${pc.name} from the party.`);
      return;
    }

    case "xp": {
      const amount = parseInt(rest[0] ?? "", 10);
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("usage: dw party xp <amount> [name…] [--each]");
      const named = rest.slice(1).map((n) => findMember(party, n));
      const awards = flags.has("--each")
        ? (named.length ? named : party.members.filter((m) => m.status === "active")).map((pc) =>
            grantXp(pc, amount, rules),
          )
        : awardParty(party, amount, rules, named.length ? named : undefined);
      saveParty(party);
      const each = awards[0]?.share ?? 0;
      console.log(
        flags.has("--each")
          ? `${amount} XP each:`
          : `${amount} XP split ${awards.length} ways (${each} each before modifiers):`,
      );
      for (const a of awards) {
        const mod = a.modifier ? ` (${a.modifier > 0 ? "+" : ""}${a.modifier}%)` : "";
        const ret = a.pc.retainer ? " (retainer: half)" : "";
        const ready = a.ready
          ? `  ★ can reach level ${a.pc.level + 1}: dw pc ${a.pc.name.split(" ")[0]} levelup`
          : "";
        console.log(
          `  ${a.pc.name}: +${a.gained}${mod}${ret} → ${a.pc.xp.toLocaleString()}${ready}`,
        );
      }
      return;
    }

    case "enc":
    case "encumbrance": {
      const method = rest[0] as EncMethod | undefined;
      if (method) {
        if (!new Set<string>(ENC_METHODS).has(method))
          throw new Error(`Encumbrance method must be one of: ${ENC_METHODS.join(", ")}`);
        party.encumbrance = method;
        saveParty(party);
      }
      console.log(`Encumbrance: ${party.encumbrance}`);
      for (const pc of party.members) {
        const load = loadOf(pc, party, rules);
        console.log(
          `  ${pc.name}: Speed ${load.speed}${load.problems.length ? `  ⚠ ${load.problems.join("; ")}` : ""}`,
        );
      }
      return;
    }

    case "rest":
    case "day": {
      const days = rest[0] ? parseInt(rest[0], 10) : 1;
      if (!Number.isFinite(days) || days < 1) throw new Error("usage: dw party rest [days]");
      party.day += days;
      saveParty(party);
      console.log(`Day ${party.day}. Daily rune uses are refreshed.`);
      return;
    }

    default:
      throw new Error(`Unknown party command "${sub}".\n\n${USAGE}`);
  }
}
