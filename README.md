# dlmnwd

A fast CLI for running a [**Dolmenwood**](https://necroticgnome.com/pages/about-dolmenwood)
game at the table. It gives you quick answers for the things you reach for
mid-session: dice procedures, NPC improv, and stat-block or hex lookups.

```
dw react                 # 2d6 reaction roll, interpreted
dw morale 8              # morale check vs ML 8
dw wander sample-wood    # wandering-monster check + encounter roll
dw npc thornling         # random NPC: name + persona
dw mon bramble           # monster stat block (fuzzy match)
dw hex 0101              # keyed hex entry
dw roll 3d6+2            # plain dice
```

## Licensing: bring your own books

[Dolmenwood](https://necroticgnome.com/pages/about-dolmenwood) is © [Necrotic
Gnome](https://necroticgnome.com/). This repository ships no Dolmenwood content: no
book text, no stat blocks, no rules tables, no hex keys, no spells, no monsters.
The shipped `data.sample/` is invented and non-canon, present only so the tool
runs, and every test fixture is likewise made up.

What the code does contain, because a parser cannot anchor on nothing, is the
book's structural vocabulary: kindred and class names, table headings such as
`ADVENTURING ITEMS`, and field labels such as `Kindred Type` or
`Level / XP / Hit Points / Attack`. Those are the strings the extractor searches
your PDF for. They are names and labels, not content.

To use it for real you supply your own legally owned files. The books are sold
by Necrotic Gnome: [Player's
Book](https://necroticgnome.com/products/dolmenwood-players-book), [Monster
Book](https://necroticgnome.com/products/dolmenwood-monster-book), [Campaign
Book](https://necroticgnome.com/products/dolmenwood-campaign-book). Homebrew content
goes in `./data/` (gitignored). Book content is read live from your own PDFs
(see below). Never commit `data/` or the PDFs.

## Setup

You need [Bun](https://bun.sh) (built against 1.3).

```sh
bun install          # dev deps: oxlint, oxfmt
bun test             # run the suite
bun run dw help      # see commands

# optional: put `dw` on your PATH
bun link
dw help
```

### Interactive pickers and completion

Run `mon`, `spell`, or `hex` with no argument in a terminal and `dw` opens an
[fzf](https://github.com/junegunn/fzf) picker with a **live preview**: scroll the
list and the full stat block, spell, or hex renders in the preview pane. Falls
back to the usage message when fzf is absent or output is piped.

`dw list <monsters|spells|hexes|kindreds|classes>` prints the names (one per
line); it backs the pickers and the zsh completion.

For tab-completion, add the completions dir to your `fpath` before `compinit`:

```sh
fpath=(/path/to/dlmnwd/completions $fpath)
autoload -Uz compinit && compinit
```

Then `dw mon gho<Tab>` completes to `Ghoul`, `dw hex 09<Tab>` to hex ids, and
`dw new <Tab>` to kindreds then classes, all from the live index.

### Quality

Formatting and linting use the [Oxc](https://oxc.rs) toolchain, which is written
in Rust and very fast:

```sh
bun run fmt          # format (oxfmt)
bun run lint         # lint (oxlint)
bun run check        # fmt --check + lint + test  (the CI gate)
```

A tracked pre-commit hook (`.githooks/pre-commit`) formats and lints every
commit, blocking on lint errors. `bun install` runs the `prepare` script, which
points `core.hooksPath` at `.githooks`, so a fresh clone is wired up with no
extra steps.

## Reading your PDFs

Book lookups never store content in the repo. You give `dw` your own legally
owned PDF and it parses what you ask for into a local SQLite index at
`~/.cache/dw/dw.db`. That index is gitignored, derived from your file, and never
shipped.

The easiest setup is to drop your PDFs into a `books/` folder. `dw` finds them
by filename: anything containing "player", "monster", or "campaign". The whole
folder is gitignored.

```sh
mkdir books
cp "/path/to/Dolmenwood Player's Book.pdf" books/

dw build                 # parse your books into the index (--force to rebuild)
dw search "cold iron"    # FTS5 full-text search across indexed books (--limit=N)
dw spell "shield"        # structured spell entry (a SELECT; auto-builds if needed)
dw mon "basilisk"        # monster stat block from the Monster Book (fuzzy match)
dw hex 0907              # open the hex's Campaign Book page  (-t for the text summary)
```

`dw mon` uses the Monster Book when configured (falling back to homebrew JSON).
Core combat stats (AC, HP, saves, attacks, speed, morale, XP, type) are reliable
for all entries; Hoard and special abilities are best-effort, since some monster
pages use a two-column layout the scan does not fully reflow yet.

`dw` looks for books in `$DW_BOOKS`, then `./books`, then the repo's own
`books/` (resolved from the script location, so it works from any directory),
then `~/.config/dw/books`. If your PDFs live elsewhere, point at one directly
with `DW_PLAYERS_PDF` (or `DW_MONSTERS_PDF`, `DW_CAMPAIGN_PDF`).

You need [`pdftotext`](https://poppler.freedesktop.org/) (from poppler) on your PATH. The index auto-builds on first
use and rebuilds when a PDF's size or mtime changes.

## Homebrew data (npc, mon, hex)

`npc`, `mon`, and `hex` read JSON from a data directory, resolved in this order:
`$DW_DATA`, then `./data` (your gitignored content), then `./data.sample` (the
committed fallback). The layout and JSON shapes live in
[`data.sample/README.md`](data.sample/README.md) and are typed in
[`src/schema.ts`](src/schema.ts).

## Status

Working: `roll`, `react`, `morale`, `wander`, `npc`, `mon`, `hex`, `build`,
`search`, `spell`, `new`.

```sh
dw new <kindred> <class> --name="Pip Quickfoot" --player=Sam --out=PCs/Pip.md
dw new                 # roll both
dw new random cleric   # roll a kindred that may be a cleric
```

Omit a kindred or class (or pass `random`) and it is rolled for you, only ever
landing on a legal combination: non-mortals never come up as clerics or friars,
and neither does a Chaotic character.

Rolls a level-1 PC: abilities, HP, AC (from a default loadout: the heaviest
armour the class allows, plus a shield if permitted), class saves, skill
targets, next-level XP, kindred languages, and a rolled persona. Writes a
vault-format sheet. Ability names (traits) are left marked for you to fill, and
the loadout is a sensible default you can swap for rolled starting gear. Skill
parsing is conservative: classes with a clean skill table come through complete,
while ambiguous layouts (2-up, spell-casters) are left empty rather than guessed
wrong.

Which kindreds to extract from your books, and their generation mechanics
(magic resistance, natural-armour bonus), are discovered from the book itself —
read from its "X NAMES" headers and the surrounding prose — so no configuration
and no setting-specific names ship in the code.

`dw hex` opens the hex's PDF page by default, since the valuable keyed-location
detail (rooms, NPCs, encounter tables) is multi-column prose left in the book.
`-t`/`--text` prints the quick travel summary instead (name, blurb, terrain,
lost/encounters, foraging). `mon` and `spell` default to text; add `--open` for
their pages. The full hex list (all 200, with canonical names) comes from the
PDF bookmarks via `mutool` (from mupdf); install it for complete coverage,
otherwise hex parsing falls back to the text scan. Settlement hexes detailed in a
non-standard format (e.g. Sample Keep) resolve by name even without a
keyed wilderness entry.

Roadmap: kindred/class trait names into `dw new`; reflow two-column monster pages
for fuller Hoard/special coverage; `turn`, a dungeon-turn tracker for light and
spell durations; `treasure`; `init`.

## License

Code: MIT (see `LICENSE`). Game data is yours and not covered here.

Fonts: [Departure Mono](https://departuremono.com/) by Helena Zhang and
[Basteleur](https://velvetyne.fr/fonts/basteleur/) by Keussel, both under the SIL
Open Font License 1.1, bundled in `web/fonts/` with their licence texts. See
[`NOTICE.md`](NOTICE.md) for the scope.

The web app deploys to Cloudflare Pages as a static build (`bun run web:build` → `dist/`).
