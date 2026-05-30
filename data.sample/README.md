# Sample data (invented, NOT canon)

Everything in this folder is made up for demonstration and tests. None of it is
Dolmenwood content. It exists so `dw` runs and the test suite passes without any
copyrighted material in the repository.

Your real game data goes in a sibling `../data/` directory (gitignored), using
the same layout and JSON shapes:

```
data/
  kindreds/<id>.json     # name + native languages + persona/name tables
  monsters/<id>.json     # stat block
  hexes/<id>.json        # keyed hex entry
  encounters/<region>.json  # wandering-monster table
```

`dw` resolves its data directory in this order:

1. `$DW_DATA` (if set and it exists)
2. `./data`
3. `./data.sample` (this folder, the fallback)

See each `*.json` here for the exact fields, and `src/schema.ts` for the typed
definitions.
