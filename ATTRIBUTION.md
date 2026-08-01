# Attribution

Every third-party asset and dependency with an attribution requirement, recorded **when it is added**.
Reconstructing this at ship time is miserable — see `PLAN.md` §18.3.

## Art

| Asset | Source | Author | License | URL |
|---|---|---|---|---|
| _(none yet — placeholder art is generated, see `PLAN.md` §9.4)_ | | | | |

## Audio

| Asset | Source | Author | License | URL |
|---|---|---|---|---|
| _(none yet)_ | | | | |

## Fonts & icons

| Asset | License | URL |
|---|---|---|
| _(none yet — the UI currently uses system font stacks)_ | | |

## Runtime dependencies

Recorded in `package.json`. Licenses of note:

| Package | License | Obligation |
|---|---|---|
| bitecs | MPL-2.0 | File-level copyleft — if we modify bitECS source directly, those files stay MPL. We don't; we consume it as a dependency. |
| idb-keyval, comlink | Apache-2.0 | Attribution + NOTICE preservation |
| everything else | MIT / ISC | Attribution |

## Open decision

**LPC spritesheet generator (GPL-3.0 / CC-BY-SA-3.0)** — using it for shipped shopper sprites makes
derived art share-alike and requires per-artist credit from its `CREDITS.csv`. This must be decided in
phase 1.0, not at ship. See `PLAN.md` §20.

**Current position:** not used. Placeholder sprites are generated (§9.4); authored art is original.
If this changes, record the decision as an ADR first.
