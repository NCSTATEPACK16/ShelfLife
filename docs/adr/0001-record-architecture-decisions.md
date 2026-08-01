# 1. Record architecture decisions

**Status:** Accepted
**Date:** 2026-07-31

## Context

`PLAN.md` §0 rule 3 requires that architectural decisions get recorded rather than silently made. This
project has a long roadmap, several hard constraints that are cheap to honour and expensive to
retrofit (the sim boundary, the platform boundary, determinism), and will be worked on across
sessions where context is lost.

An agent or human who encounters a constraint six months from now needs to know *why* it exists, or
they will route around it. The ESLint rules stop the violation; only an ADR stops the argument.

## Decision

Use Architecture Decision Records, as described by Michael Nygard, stored in `docs/adr/` and numbered
sequentially: `NNNN-kebab-title.md`.

Each ADR has: Status (Proposed / Accepted / Superseded by NNNN), Date, Context, Decision,
Consequences.

Write an ADR when:
- A `PLAN.md` constraint would need to be bent or broken.
- A dependency with a copyleft or share-alike license enters the build.
- The determinism contract, the sim boundary, or the platform boundary is affected.
- A choice will be non-obvious to someone reading the code later.

Do **not** write one for routine implementation choices.

## Consequences

- Deviating from the plan has a small, deliberate cost, which is the point.
- `docs/adr/` becomes the record of why the codebase looks the way it does.
- Superseded ADRs are never deleted; they get a `Superseded by` status so the reasoning trail holds.
