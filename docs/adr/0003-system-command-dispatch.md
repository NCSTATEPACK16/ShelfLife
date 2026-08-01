# 0003 — System command dispatch

## Status
Accepted

## Context
Phase 1.3 shipped only kernel commands (`noop`, `setSpeed`, `pause`, `resume`), and `World#apply`
was an exhaustive switch over all of `Command`. Phase 1.4 is the first gameplay system (grid/build
mode) that needs its own commands (`placeFixture`, `rotateFixture`, `removeFixture`, `undoBuild`,
`redoBuild`), and every phase after it — staff, pricing, promotions — will need the same thing.
Growing `World#apply` into a god-switch that knows every system's command semantics would violate
the same locality that `src/sim/systems/*` directories exist to preserve.

## Decision
`Command` stays one flat, closed discriminated union in `core/commands.ts` — replay and the command
log do not care which system owns a command, and `hashCommand` stays an exhaustive switch over every
variant so a forgotten hash case is a compile error.

`System` gains an optional `applyCommand(world: World, command: Command): boolean` method.
`World#apply` handles the four kernel command types directly, then for anything else loops over
registered systems in registration order and calls `applyCommand`; the first system that returns
`true` has handled it. If no system claims it, `World#apply` throws — an unhandled command is still
a hard failure, just a runtime one instead of a compile-time one for the *dispatch* switch (the
*hashing* switch keeps its compile-time exhaustiveness, which is the one that actually protects
determinism).

## Consequences
- Adding a new system's commands means: add the variant to `Command`, add a case to `hashCommand`,
  implement `applyCommand` on the new system. `World#apply` never changes again.
- Two systems must not claim the same command type — nothing enforces this at compile time; a test
  in `system.test.ts` asserts `GridSystem.applyCommand` returns `false` for command types it doesn't
  own, and the World-level exhaustive throw is the backstop if that discipline slips.
