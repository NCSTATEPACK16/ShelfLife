# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/).
Phases and their acceptance gates are defined in `PLAN.md` §16.

## [Unreleased]

### Milestone 1 — Playable Core

#### Phase 1.0 — Foundations · **gate PASS**
- Repository scaffold, Node pinned via `.nvmrc`, docs and legal skeleton, ADRs 0001–0002.
- TypeScript `strict` + `noUncheckedIndexedAccess`; Vite with two entry points — landing at `/`,
  game at `/game/` with a relative base so the same bundle runs inside the iOS shell.
- ESLint boundary rules enforcing the sim boundary (no platform imports, no `Math.random`/`Date.now`)
  and the platform input boundary (raw pointer events only in `src/platform/input`), with
  `tests/boundaries` asserting each rule actually fires.
- Platform seam: semantic input intents over Pointer Events, two breakpoints, entitlements stub,
  storage abstraction.
- Vitest + `verify` script; GitHub Actions CI on Ubuntu and Windows; bundle-budget check; Netlify
  deploy config.
- Design tokens (`content/design/tokens.json`) and the phone-first style guide.

##### Fixed
- Flat-config rule shadowing silently disabled every determinism check inside `src/sim`. ESLint flat
  config replaces a rule's options wholesale rather than merging them, so the later
  platform-boundary block was overriding `no-restricted-syntax`. Caught by `tests/boundaries`.

#### Phase 1.1 — Design system · **tokens in progress**
- `tools/check-tokens.mjs` enforces `content/design/tokens.json` as the single source of colour
  truth: no hex literals in `src/ui`, `src/view`, or `landing/` outside the two files that define the
  tokens, and every colour those files declare must exist in `tokens.json`. Wired into
  `npm run verify` as `check:tokens`.
- Screens/components at compact + regular breakpoints are still outstanding; Figma export remains
  blocked (see `docs/handoff.md`).

#### Phase 1.3 — Sim kernel · **gate PASS**
- Deterministic clock, per-subsystem seeded RNG streams (FNV-1a keyed on `worldSeed` + stream name),
  command queue draining at tick boundaries, output-only event bus, world snapshot, and a bit-exact
  `hashWorld` (folds floats by IEEE-754 bit pattern, not decimal rendering).
- `tests/golden/golden.test.ts` proves 10,000 ticks of an empty world hash identically across 3 runs;
  CI extends the same check across Ubuntu and Windows.
- System registration freezes once the world starts; registration order is part of the hash.
- `Clock.pump` caps catch-up at 10 steps to avoid a spiral of death after a long backgrounding.
