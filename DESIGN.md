# Design

Visual system for the web character generator, derived from the Dolmenwood
Player's Book interior (sampled from the book itself). The page should read as an
interactive leaf of the rulebook.

## Theme

Light. A near-white book page under even reading light. The exact hex values are
the Player's Book interior colours, supplied by the owner. Body text clears WCAG
AA comfortably (ink on page ≈ 16.7:1); the rust/coral accent is reserved for
large display and heading text and the table bars, where it meets AA for large
text (coral heading ≈ 3.2:1, white-on-brown bar ≈ 5.5:1). Rust is never used for
body text on white. Where book fidelity and contrast pull apart, fidelity wins,
but no essential text is left below its AA threshold.

## Color (exact book hex)

- `--page` `#fbfaf7` — warm near-white behind the boxes.
- `--ink` `#1b1a16` — near-black serif body. `--ink-soft` `#5a564c` — italics/secondary.
- `--title` `#d54134` — page and sheet display titles, primary button.
- `--heading` `#dd6d54` — section headers; also the info-box border.
- `--subhead` `#552d18` — small-caps labels; the line under a table's top row.
- `--box` `#f5eede` with a `--heading` border — info boxes (intake panel, sheet).
- Tables: top bar `--bar` `#86604c` with white text; rows alternate `#ffffff` /
  `#eadfd8`; the rule under the top row is `--subhead`.
- `--rule` `#ddd8cc` — hairline section dividers.

Strategy: the book's own palette, applied by role. Title red for the biggest
type, coral for section headers, dark brown for small labels, brown bar +
alternating rows for tables.

## Typography

One axis: old-style serif throughout, weight + size + small-caps for hierarchy
(the book is essentially one serif family). No webfont download — high-quality
system serif stack keeps it fast and self-contained.

- Stack: `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`.
- Display (chapter title, the character name): clamp up to ~3.2rem, rust, slight
  negative tracking, `text-wrap: balance`.
- Section headers ("ABILITY SCORES", "SAVES"): small-caps, rust, letter-spaced.
- Labels: small-caps `--rust-deep`. Body: `--ink`, 16px, measure ≤72ch.
- Table-header bar: small-caps warm-white on rust, mirroring the book's "X NAMES".

## Components

- **File picker**: a single quiet inset panel with the rust action button; carries
  the privacy line. No drop-shadow card stack.
- **Controls**: inline labelled selects/inputs in a row, hairline-separated from
  the sheet. Not a card.
- **Character sheet**: the hero. A bordered page with a rust drop-cap name, italic
  "Level 1 {Kindred} {Class}" subtitle between thin rules, then sections with rust
  small-caps headers and rust table-header bars for Abilities / Saves / Skills.
- **Tables**: rust header bar, faint alternating row tint, hairline rules.

## Layout

Single centered column, max ~760px (book column proportion). Generous vertical
rhythm; thin rules as section dividers rather than boxes. Responsive: controls
wrap to stacked on narrow screens; sheet tables stay legible with horizontal
scroll only as a last resort.

## Dark theme

The Script Wizards black/orange scheme (sampled from the scriptwizards.org
homepage), implemented in `web/app.css` purely as token overrides on the light
"textmode" system. Auto via `prefers-color-scheme` (guarded by
`:root:not([data-theme="light"])`), with explicit `:root[data-theme="dark"]`
overrides so the masthead toggle (auto/dark/light, persisted to localStorage)
wins in both directions. Print always re-asserts the light palette.

- `--paper` `#111111` ground; `--paper-2` `#1a1a1a` panel fill; `--paper-sunk`
  `#0d0d0d` sunken wells and table header bars.
- `--ink` `#ffffff` body text (18.9:1 on ground); `--ink-soft` `#c4c4c4` muted
  (10.8:1); `--faint` `#555555` hairlines/placeholder.
- `--ember` `#ffa227` the accent orange: wordmark, headings, filled controls.
  Never body text. `--accent-ink` `#1c1b19` is the text on orange fills.
  `--ember-2` `#d98d2c` secondary accent (7.0:1); `--moss` `#8b9a55`.
- `--line` `#3d3d3d` frame borders; `--line-soft` `#2a2a2a` inner hairlines.
- `--shade` `0, 0, 0` bevel shadow rgb; `--row-hover`
  `rgba(255, 255, 255, 0.06)` lightens instead of darkens.

## Motion

Quiet and intentional. On generate, the sheet sections rise+fade on a short
stagger (each ~0.45s ease-out-quint, delays stepping to 0.32s, so the last lands
under ~0.8s) — a page being laid down. Hover/active on the action button only.
`prefers-reduced-motion: reduce` → instant, no transform.
