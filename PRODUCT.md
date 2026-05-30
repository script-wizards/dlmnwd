# Product

## Register

product

## Users

Dolmenwood players and GMs who own the Player's Book and
want a level-1 character fast, without hand-rolling every table. They arrive with
a PDF they legally own and expect to leave with a finished, vault-ready sheet.
Often used at or just before a session, on desktop or a phone at the table.

## Product Purpose

A client-side character generator: the player supplies their own Player's Book
PDF, it is parsed entirely in the browser, and a rolled level-1 character is
rendered as a Dolmenwood-styled sheet plus a downloadable Markdown file. It
exists because the book content is proprietary (Necrotic Gnome, all rights
reserved), so nothing can be bundled or uploaded — the PDF must never leave the
user's machine. Success: drop a PDF, pick kindred and class, get a correct,
good-looking sheet in seconds, with zero config and zero data leaving the device.

## Brand Personality

Bookish, atmospheric, exacting. The voice of a well-made rulebook, not an app:
quiet confidence, plain language, no marketing gloss. Three words: storybook,
precise, unfussy. The interface should feel like a page of the Player's Book that
happens to be interactive.

## Anti-references

- Generic SaaS / startup chrome (rounded cards, gradient accents, hero metrics).
- The AI "parchment" cliché (saturated cream near-white body posing as fantasy).
- Cluttered VTT dashboards (Roll20/Foundry panels, toolbars, dense chrome).
- Loud gamer neon (dark-RGB, glows).

## Design Principles

- **Follow the book.** Match the Player's Book interior system — rust section
  headers, near-white page, old-style serif, rust table-header bars — rather than
  inventing a look. Identity preservation over novelty.
- **The PDF never leaves the browser.** Privacy is the product's reason to exist;
  the UI should make that legible, never undercut it with an upload affordance.
- **The output is the hero.** The generated sheet, not the form, gets the craft;
  the input flow should be near-invisible.
- **Zero config.** Discover everything from the PDF; never ask the user to author
  a file or set an option that the book already answers.

## Accessibility & Inclusion

WCAG AA: body text ≥4.5:1, large text ≥3:1, against the near-white page (the rust
accent is reserved for large/heading text and bars where it clears 3:1; never
rust body text on white). Fully keyboard-operable; visible focus rings. Every
animation has a `prefers-reduced-motion: reduce` alternative (crossfade/instant).
