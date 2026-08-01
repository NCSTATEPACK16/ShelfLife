# v2 ideas

The scope-creep landfill. Good ideas that are not v1 ideas.

Writing something here is how we say "yes, and not now" — per `PLAN.md` §19, scope creep into "and
also a chain of stores" is a High-likelihood risk, and this file is the mitigation.

## Deferred deliberately

**Multi-store chains.** Run several locations, move stock between them, manage a regional brand. This
is the single most requested feature that will never fit v1 — it multiplies every system's complexity
and dilutes the single-store spatial game that is the actual differentiator
(`docs/design/competitive-position.md` §3.2).

**Android.** Capacitor keeps this near-free later. It is not a v1 target and gets no testing budget.

**Store-brand / private-label design.** Player-authored logo, palette, and product line, as a real
identity system rather than the boss-9 unlock. Fits the "build your own cult" ending.

**Supplier relationships as characters.** Named suppliers with their own reliability, loyalty, and
grudges. Currently they're a reliability number.

**Union / labor arc.** Staff organizing as a mid-game event with real trade-offs. Interesting, and
carefully out of scope for a game whose parody rules forbid depicting real chains in labor disputes
(`PLAN.md` §2.1).

**Seasonality and weather as a system.** Currently random events. A real seasonal demand curve per SKU
would be excellent and is a lot of balance work.

**Workshop / mod support.** The content layer is already JSON5 + Zod, so this is more plausible than
it sounds. Post-1.0.

**Ghost replays.** Determinism means a friend's daily-challenge run can be replayed alongside yours.
Nearly free technically; needs real UX design.

## Rejected, not deferred

These are in `docs/design/competitive-position.md` §5 with reasoning. Short version: first-person
mode, manual scanning, randomized rival behavior, and an idle/offline earning layer are all **no** —
not "later." Each breaks a pillar rather than merely costing time.
