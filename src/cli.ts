#!/usr/bin/env bun
import { cmdBuild } from "./commands/build.ts";
import { cmdHex } from "./commands/hex.ts";
import { cmdInit } from "./commands/init.ts";
import { cmdList } from "./commands/list.ts";
import { cmdMon } from "./commands/mon.ts";
import { cmdMorale } from "./commands/morale.ts";
import { cmdNew } from "./commands/new.ts";
import { cmdNpc } from "./commands/npc.ts";
import { cmdReact } from "./commands/react.ts";
import { cmdRoll } from "./commands/roll.ts";
import { cmdSearch } from "./commands/search.ts";
import { cmdSpell } from "./commands/spell.ts";
import { cmdTurn } from "./commands/turn.ts";
import { cmdWander } from "./commands/wander.ts";

const HELP = `dw: Dolmenwood GM tools

Usage: dw <command> [args]

Rolling & procedures
  roll <expr>          Roll dice, e.g. dw roll 3d6+2   (default 1d20)
  react [mod]          Reaction roll (2d6) with interpretation
  morale <ML> [mod]    Morale check (2d6 vs morale score)
  init [sides…]        Side-based initiative (1d6 per side; default Party vs Enemies)
                         -r/--rounds N  roll N rounds at once
  wander [region]      Wandering-monster check; rolls the encounter if it hits
                         --chance=N   in-6 chance (default 1)
  turn [n]             Dungeon-turn tracker: advance n turns (10 min each),
                         tick tracked durations, remind of wandering checks
                         track <name> <dur> | status | check-every <n> | end

Lookups (read your ./data; see README)
  npc <kindred>        Random NPC: name + persona
  mon <name>           Monster stat block (fuzzy match)
  hex <id>             Open the hex's PDF page  (-t/--text for the summary)

From your PDF (indexed into a local SQLite db; see README)
  build [book…]        Parse configured PDFs into the index  (-f/--force to rebuild)
  search <text>        Full-text search across indexed books  (--limit=N)
  spell <name>         Spell entry from the Player's Book
  list <category>      Print names: monsters|spells|hexes|kindreds|classes
  new [kindred] [class]  Roll a level-1 PC, emit a vault markdown sheet
                         (omit either, or pass "random", to roll it)
                         (--name=, --player=, --alignment=, --out=file.md)

  mon/spell/hex with no argument open an fzf picker with a live preview
  (when run in a terminal with fzf installed).
  hex opens its PDF page by default; add -o/--open to mon/spell to do the same.

  help                 This message
`;

const commands: Record<string, (a: string[]) => void> = {
  roll: cmdRoll,
  react: cmdReact,
  morale: cmdMorale,
  init: cmdInit,
  wander: cmdWander,
  turn: cmdTurn,
  npc: cmdNpc,
  mon: cmdMon,
  hex: cmdHex,
  build: cmdBuild,
  search: cmdSearch,
  spell: cmdSpell,
  list: cmdList,
  new: cmdNew,
};

const [cmd, ...args] = process.argv.slice(2);

try {
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    process.exit(0);
  }
  const fn = commands[cmd];
  if (!fn) {
    console.error(`Unknown command: ${cmd}\n`);
    console.log(HELP);
    process.exit(1);
  }
  fn(args);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
