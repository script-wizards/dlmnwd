# AGENTS.md

Guidance for agents working in this repository. Read this before editing.

## The one rule above all others

**No Dolmenwood (© Necrotic Gnome) content may ever be committed to this repo.**
No stat blocks, tables, names, hex keys, or book text. The tool reads the user's own
legally-owned PDFs and indexes them into a machine-local SQLite cache; it ships none
of it. `data.sample/` is invented/non-canon and exists only so the tool runs and the
test suite passes with no copyrighted material present.

`books/`, `data/`, `*.pdf`, and `dw.db` are gitignored for this reason. Parsers must
not embed setting-specific strings; kindreds and their mechanics are _discovered
from the book_ (headers like `X NAMES`, `Kindred Type`), never hardcoded. (The class
list in `src/parse/class.ts` is a known fixed list, by contrast.)

The repo is public (MIT for its own code). The bundled font (`web/fonts/`: Departure
Mono) is SIL OFL 1.1 with its licence text alongside; `NOTICE.md` records the
scope. Never vendor an asset whose licence forbids redistribution.

## Commands

Runtime is [Bun](https://bun.sh) (built against 1.3). TypeScript, ES modules.

```sh
bun install                     # also runs `prepare`, which sets git core.hooksPath → .githooks
bun test                        # the test suite (bun:test)
bun run dw <command> [args]     # run the CLI as `dw` (e.g. `bun run dw help`)
bun link                        # optional: puts `dw` on your PATH

bun run fmt                     # format (oxfmt)
bun run fmt:check
bun run lint                     # lint (oxlint)
bun run lint:fix

bun run check                    # THE CI GATE: fmt --check + lint + test + web:build

bun run web:dev                  # dev server on web/index.html
bun run web:mock                 # mock page (prebuilt fixture, no PDF needed)
bun run web:build                # production build → dist/ (+ copies og.png)
bun run web:single               # single self-contained HTML (inlines JS/CSS/fonts)
```

A tracked pre-commit hook (`.githooks/pre-commit`) runs `fmt`, re-stages, then
`lint`. It blocks the commit on lint errors. `bun install`'s `prepare` script wires
`core.hooksPath` to `.githooks`, so a fresh clone is set up automatically.

There is no `tsc` typecheck step — `tsconfig.json` has `noEmit: true` and includes
only `src` and `test` (not `web/`, `proto/`, or `scripts/`). oxlint is the type-aware
check that actually runs.

## Architecture

### Two-source dependency model

The same content has two resolved sources, and the precedence is load-bearing:

- **PDFs** (players / monsters / campaign): `$DW_BOOKS` → `./books` → repo `books/`
  (resolved from the script location, works from any cwd) → `~/.config/dw/books`;
  or an explicit per-book env var `DW_PLAYERS_PDF` / `DW_MONSTERS_PDF` /
  `DW_CAMPAIGN_PDF`. `src/pdf/config.ts` is the single place this resolution lives.
- **Homebrew JSON** (`npc`, `mon`, `hex` fallback): `$DW_DATA` → `./data` (real,
  gitignored) → `./data.sample` (committed fallback). `src/data.ts` resolves this.

Lookups (`npc`, `mon`, `hex`) **prefer the PDF index when a book is configured** and
fall back to homebrew JSON otherwise. `list` and `spell` are PDF-only; `search` is
PDF-only. Commands wrap `pdfPath(book)` in try/catch so a missing book degrades
gracefully rather than throwing.

### The fixed-width-text parser contract (the central design constraint)

Every parser in `src/parse/` assumes its input is the **fixed-width ASCII that
`pdftotext -layout` emits**, where a glyph's character column carries meaning: table
cells split on 2+ spaces, columns are read by x-offset, and lines align by absolute
column position. Keep this contract in mind when touching any parser.

There are two producers of that fixed-width text, both feeding the _same_ parsers:

- **CLI**: `src/pdf/extract.ts` shells out to `pdftotext` (poppler), cached locally by
  file size + mtime in `~/.cache/dw/`.
- **Browser**: `src/pdf/emulate.ts` runs pdf.js, takes positioned text items, and
  re-grids them onto a monospace character canvas to reproduce the `pdftotext -layout`
  layout. This is what lets the web app parse a PDF entirely client-side with the same
  parsers, so the book never leaves the machine.

Because the browser path shares the parsers, **`src/pdf/columns.ts` is pure (no Node
APIs)** and runs unchanged in the browser. Do not introduce Node-only APIs there or in
`src/parse/*` if the code is meant to run in the web build. The only Node-specific PDF
code lives in `extract.ts`, `outline.ts` (mutool), and `open.ts` (pdftoppm).

`proto/layout-check.ts` and `proto/diag.ts` are dev tools that diff the two renderers'
output against the real Player's Book — run them when changing `emulate.ts` or the
column logic. They need a configured PDF and print a pass/fail on parser-output
equality (the real success metric, not per-page text similarity).

### Control flow

`src/cli.ts` is the entry (`package.json` `bin.dw`). It holds a `commands` record
mapping a name → `(args: string[]) => void`. To add a command: write
`src/commands/<name>.ts` exporting `cmd<Name>`, register it in the record, and add a
line to the `HELP` string. Each command parses its own flags manually — the convention
is `args.filter(a => !a.startsWith("-"))` for positionals and `--flag=value` via find +
slice. Short flag pairs: `-o`/`--open`, `-t`/`--text`, `-f`/`--force`.

### Build vs. query

`src/build.ts` (the core index builder) parses a configured PDF into SQLite:
extracted pages → `pages` + an FTS5 virtual table (`pages_fts`, porter unicode61),
plus structured `spells`/`kindreds`/`classes`/`monsters`/`hexes` tables. Structured
rows store the full object as JSON in a `data` column and are read back with
`json_extract`. A build replaces only that book's rows in a single transaction, then
records size+mtime in `sources` so `isFresh()` skips unchanged books.

`src/commands/build.ts` (the CLI command) is just a thin wrapper over the core. Mind
the `build.ts` name collision: command files import from `../build.ts` (core), not
`./build.ts` (themselves).

`ensureBuilt()` / `ensureAllConfigured()` auto-rebuild a book when its PDF's size or
mtime has changed (prints `dw: building <book> index…` to stderr). Most query
commands call `ensureBuilt` on first use, so the DB appears to "build itself".

`src/db.ts` owns the schema (`migrate()`, idempotent `CREATE TABLE IF NOT EXISTS`),
open/ WAL mode, and every query helper (`findSpellRow`, `findMonsters`, `findHex`,
`searchPages`, the `*Names`/`*List`/`*Count`/`*PickerRows` helpers, `childrenOf`).
The DB lives at `~/.cache/dw/dw.db` (machine-local, derived, never committed).

### Monster parent/child entries

Secondary stat blocks (mounts, spawn, variants) carry a `parent` field naming the
primary entry they belong to. **Primaries only** appear in the browse list, count,
and fzf rows; children surface under their parent (`childrenOf`) and stay directly
queryable. `monsterPickerRows` tab-separates each primary name from its sub-creatures
so field 1 is always the real name for fzf preview/selection.

### fzf pickers

`mon`, `spell`, `hex` with no argument open an fzf picker with a live preview — **only
when** `canPick()` returns true (stdout is a TTY _and_ `fzf` is on PATH). `pickWithFzf`
deliberately clears `FZF_DEFAULT_OPTS` so a user's personal config can't suppress the
preview. When fzf is absent or output is piped, the command prints its usage and exits
(non-zero). Don't replace this manual parsing with a CLI flag lib — the commands are
expected to stay dependency-light and shell out directly.

### Open behavior (CLI)

`hex` **defaults to opening the PDF page** (the keyed detail is multi-column prose
left in the book); `-t`/`--text` prints the summary instead. `mon`/`spell` default to
text; add `-o`/`--open` to open the page. `openPdfPage` renders the page to a PNG via
`pdftoppm` and launches a detached viewer; it honors `$DW_OPEN` (e.g. `feh`) and picks a
native X viewer over the slow `xdg-open`. Returns false on any failure so the caller
falls back to text. `hex` bookmarks come from `mutool` (mupdf); falls back to text scan.

### The web app

`web/main.ts` is the live character generator: the user drops their Player's Book PDF,
pdf.js parses it in-browser (`extractPagesEmulated`), then the same `parseKindreds` /
`parseClasses` / `generate` pipeline produces a level-1 PC rendered as a stylized sheet
and downloadable Markdown. The PDF never leaves the browser — privacy is the product's
reason to exist; never add an upload affordance.

- `web/sheet.ts` is **pure DOM rendering**, shared by `main.ts` and `mock.ts` (the
  prefilled fixture for iterating on the UI without a PDF). Keep sheet.ts free of
  parsing and file I/O.
- `web/index.html` is the entry; `web/app.css` is the implemented visual system
  (a light-inverted "textmode" character sheet set entirely in Departure Mono).
  `DESIGN.md` and `PRODUCT.md` describe the design/product intent as context.
- `scripts/build-single.ts` inlines the bundled JS/CSS/fonts into one self-contained
  HTML after `web:build`; it throws if any external asset survives.
- Deploys to Cloudflare Pages as the static `dist/` build; bundled at dlmnwd.com with an
  `og.png` social card.

### Character generation

`src/gen/character.ts` rolls a level-1 PC: 3d6 per ability, HP from the class hit die +
CON mod (min 1), a sensible default loadout (heaviest armour the class allows + shield
if permitted + natural-armour bonus only with light/no armour), merged skill targets
(Listen/Search/Survival default to 6; kindred/class lower them; class skill tables and
"Skill Target of N for X" trait prose both contribute, taking the minimum), kindred
languages + INT-mod extra languages, and a rolled persona. `toMarkdown` emits an
Obsidian-vault-format front-matter sheet. Trait/ability _names_ are left marked for
manual fill; the loadout is a default to swap for rolled starting gear.

## Code conventions

- **`verbatimModuleSyntax: true`** — type-only imports **must** be `import type {…}`.
  This is enforced and visible throughout the codebase; oxlint will flag bare value
  imports used only as types.
- 2-space indentation. Explicit return types on exported functions. Strict TS.
- Flags parsed by hand (no commander/yargs) — match the existing `--flag=value` /
  `args.filter(a => !a.startsWith("-"))` pattern when adding command options.
- `import.meta.dir` is used to anchor repo-relative paths (`pdf/config.ts`,
  `data.ts`) so `dw` works from any cwd — preserve that when adding path resolution.
- Numbers in `src/rules.ts` are B/X-style mechanics (not flavour); they're the
  overrideable defaults, so keep them generic, not setting-specific.

## Testing

`bun:test`, files under `test/<module>.test.ts`. The suite needs **no real PDFs or
game content** and should stay that way. Two patterns to follow:

- **Parser tests** build invented, non-canon fixtures as fixed-width text that mimics
  `pdftotext -layout` output, often via an `at([[col, "text"], …])` helper that pads
  to a column offset. They assert on structured parser output. See
  `test/kindred.test.ts` and `test/spell.test.ts` for the canonical style.
- **DB tests** use an in-memory `:memory:` SQLite database, call `migrate(db)` to build
  the schema, seed rows directly, and assert on the query helpers — no file I/O. See
  `test/db.test.ts`.
- Dice/rules tests use randomized ranges (loop N rolls, assert within bounds).

If you add a parser, add a `test/<name>.test.ts` with invented fixtures. If you add a
DB query, add an in-memory test. Run `bun test` after every change to a parser or the
DB layer, and `bun run check` before considering work done.
