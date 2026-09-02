# Campaign & Chapters — Design Spec

*2026-09-02. M2 phase 2.1. Consumes `src/sim/systems/rivals/`, `market/`, `economy/` as delivered by
phase 2.0 (Rival Dynamics + Balance Harness); does not modify rival mechanics or attempt to close the
still-open monotonic-CL balance gate (that's phase 5.4's job, unchanged by this phase).*

## 1. Purpose & scope

Phase 2.1 turns the boss ladder (PLAN.md §3) into something actually playable end to end: a level has
chapters, chapters have objectives, objectives resolve to win/lose, winning a level unlocks the next
one, and a run can be saved mid-chapter and reloaded with the world hash intact. This is the M2 gate's
first half — "play L1 to completion, save mid-chapter, reload, hash matches; L1→L2 unlock fires."

**What this phase is not.** It does not render any UI — no intro/outro cards, no objective tracker, no
chapter-transition screen. Those are design-surface work (PLAN.md §2.2/§2.3) and, per a standing
project preference, pause for a Figma consult before their own spec/impl. This phase only needs the
*content fields* those screens will eventually read, and a way to drive `advanceChapter` for the gate
proof (tests, plus a minimal debug affordance — no real chrome). It also does not author bosses 4–10
(phase 5.1) or tune balance numbers (phase 5.4) — L1–L3 content here is a first-pass, explicitly
documented as not yet balance-tuned, consistent with today's honest `balance:gate` FAIL.

## 2. Scope decisions carried from brainstorming

- **The chapter/level FSM lives inside `src/sim`**, as a new pure system (`CampaignSystem`), folded
  into `World.hash` exactly like every other system — campaign progress replays and verifies the same
  way checkout queues or inventory batches do.
- **No XState.** PLAN.md §6.4 pencils in XState 5.32.5, but its default `after`/`invoke` features use
  real timers, which cannot live in `src/sim`. `CampaignSystem` is a hand-rolled discriminated-union
  reducer, the same shape as every other system in `src/sim/systems/`. The XState line is dropped from
  §6.4 as a documented deviation, not silently ignored.
- **L1–L3 content is authored now**, against the three rivals phase 2.0 already built (Sav-A-Lott,
  Grocerteria 24, BulkHaus Club) — an engine with no content can't be gate-tested end to end.
- **Unlock tree is a separate persistent profile record** (`src/platform/profile/`, storage key
  `profile:v1`), independent of any single level's save. A level save is `{ version, levelId, seed,
  commandLog }`; profile state (`unlockedLevelIds`, `completedLevelIds`) outlives any individual save
  and is never duplicated into it.
- **The harness's win-condition math moves into `src/sim`.** `tools/sim-harness/metrics.ts`'s
  `computeShareTrajectory`/`computeWinResult` relocate to `src/sim/systems/campaign/objectives.ts` and
  the harness imports them instead of keeping its own copy — one implementation, not two that can
  silently drift apart.

## 3. `CampaignSystem` (`src/sim/systems/campaign/`)

Same file shape as every existing system: `types.ts`, `objectives.ts`, `config.ts`, `system.ts`,
`index.ts`, `*.test.ts`. Registered **last** in the world's system chain (after `reputation`) — it
only reads other systems' state, never drives them:

```
grid → pathing → inventory → checkout → economy → rivals → market → shoppers → loyalty →
reputation → campaign
```

### 3.1 State & types

```ts
type ChapterStatus = 'inProgress' | 'complete';
type LevelStatus = 'inProgress' | 'won' | 'lost';

interface CampaignState {
  readonly levelId: string;
  readonly chapterIndex: number;      // 0-based, into the level's authored chapters[]
  readonly chapterStatus: ChapterStatus;
  readonly levelStatus: LevelStatus;
}
```

`CampaignSystem` is constructed with the level's parsed content (`LevelDef`, §4.1) and holds one
`CampaignState`, private, mutated only by `update()` and `applyCommand()`.

### 3.2 Objective evaluation

Every tick, `update(world)`:

1. Buckets the tick's completed trips (`MarketSystem#pendingOutcomes()`, already read the same way
   `LoyaltySystem`/`ReputationSystem` do) into a running per-day `{ player, rival }` trip count. A
   campaign world's rival roster is always exactly one store — the level's boss (§5) — so `storeIndex
   1` is unambiguously the target; no roster-index lookup is needed.
2. At each `TICKS_PER_SIM_DAY` boundary (same boundary check every other system already uses), closes
   the day and:
   - If `levelStatus === 'inProgress'` and `chapterStatus === 'inProgress'`: evaluates the current
     chapter's objective (§4.1) via `computeShareTrajectory`/`computeWinResult` (moved from the
     harness, §2) against the day-bucketed trip history. If satisfied, `chapterStatus → 'complete'`.
   - Independently, evaluates the level's lose condition: an `ebitdaStreak` check — scans
     `EconomySystem#statements()` (the full daily history) backward from the most recent entry and
     counts consecutive trailing days with `ebitda < 0`; if that count reaches `N`, the streak is
     breached. `EconomySystem` already tracks this per-day history; no new cumulative-cash concept is
     introduced (§5.7 of PLAN.md has no balance sheet today — inventing one for a lose condition would
     be scope the game doesn't otherwise need). If breached, `levelStatus → 'lost'`, regardless of
     chapter status.
3. Fires `SimEvent`s (`chapterComplete`, `levelWon`, `levelLost`) on the existing `EventBus` the tick a
   transition happens — the bridge layer (§6, §7) reacts to these; `src/sim` itself has no opinion
   about what happens outside it.

A **win** is `chapterStatus === 'complete'` on the level's *last* chapter — there's no separate
level-won detection path, just "the last chapter's objective was met."

### 3.3 Commands

One new `Command` variant:

```ts
| { readonly type: 'advanceChapter' }
```

`CampaignSystem.applyCommand`:

- If `chapterStatus !== 'complete'` or `levelStatus !== 'inProgress'`: **throws** (a
  `ChapterNotAdvanceableError`), the same idiom `GridSystem` already uses for `PlacementError` on an
  invalid cell — a command that shouldn't have been issued is a caller bug, not something the sim
  quietly absorbs. This also means a forged/tampered command log (§8.3's replay verification, later)
  can't skip a chapter by injecting an early `advanceChapter` — the sim itself enforces
  objective-completion, independent of anything the UI would have prevented.
- Otherwise: if there's a next chapter, `chapterIndex += 1`, `chapterStatus → 'inProgress'`, fires
  `chapterComplete`'s companion `chapterStarted` event. If this was the last chapter,
  `levelStatus → 'won'`, fires `levelWon`.

This is the only sim-side gate. **Entitlement gating (§7) is a separate, platform-level check made
*before* the command is even queued** — sim enforces "did you actually finish," platform enforces "are
you allowed to." Neither substitutes for the other.

### 3.4 Hashing

`hash(world, hasher)` writes `hasher.str(levelId)`, `hasher.u32(chapterIndex)`,
`hasher.str(chapterStatus)`, `hasher.str(levelStatus)`, plus the running per-day trip-count buckets
(needed for the hash to capture "how close to the objective," not just the coarse status — otherwise
two divergent RNG streams could reach the same `chapterStatus` with different underlying trajectories
and the golden tests wouldn't catch it).

## 4. Content schema — `content/levels/*.json5`

### 4.1 Schema

```json5
{
  id: 'l1',
  rivalId: 'sav-a-lott',
  name: 'Level 1: Sav-A-Lott',
  startingStore: {
    // Command[]-shaped setup, same convention tools/sim-harness/world.ts and
    // tests/golden/scenarios.ts already use — no new "starting store" concept.
  },
  chapters: [
    {
      id: 'ch1',
      title: 'Open Your Doors',
      mechanicUnlock: 'pricing',
      introCopy: { advisor: 'diane', line: '...' },   // text only — no UI yet, see §1
      outroCopy: { advisor: 'diane', line: '...' },
      objective: { type: 'shareThreshold', trailingWindowDays: 7, threshold: 0.2 },
    },
    // 3-5 total, per PLAN.md §12.3, thresholds escalating chapter to chapter —
    // the final chapter's threshold is the level's real win condition.
  ],
  loseCondition: { type: 'ebitdaStreak', maxNegativeDays: 14 },
}
```

Zod-validated via `parseLevelConfig(raw: unknown): LevelDef`, `DEFAULT_LEVELS` map keyed by `id` —
same `?raw` + `JSON5.parse` + Zod pattern every `content/balance/*.json5` loader already follows
(`src/sim/systems/rivals/config.ts` is the closest analog). Objective types are a small closed union
(`shareThreshold` today; new types added only when a later boss actually needs one — no speculative
generic DSL).

### 4.2 Authored content

`l1-sav-a-lott.json5`, `l2-grocerteria-24.json5`, `l3-bulkhaus-club.json5` — one boss each, matching
`DEFAULT_RIVAL_STORES`. Chapter count and thresholds are a documented first pass (a comment block in
each file says so explicitly), not derived from any balance run — `npm run balance:gate` today reports
`do-nothing` winning 100% of the time at all three levels, so any threshold picked now is provisional
by construction. Real tuning is phase 5.4, exactly as the balance-harness spec already established for
`content/balance/*`.

## 5. `buildCampaignWorld` and save/load

### 5.1 World construction

`src/sim/campaignWorld.ts` (exported from `src/sim/index.ts`):

```ts
function buildCampaignWorld(levelId: string, seed: number): World
```

Constructs a `World`, registers every system in the canonical order (§3), seeds the rival roster with
exactly the level's one boss (looked up from `DEFAULT_RIVAL_STORES` by `rivalId`), pushes the level's
`startingStore` commands, and registers `CampaignSystem` with the parsed `LevelDef`. This is the
**single source of truth for registration order** for real gameplay — both a fresh level start and a
save reload go through it, so the two can never drift apart the way a hand-duplicated registration list
could.

### 5.2 Save format

```ts
interface SaveEnvelope {
  readonly version: 1;
  readonly levelId: string;
  readonly seed: number;
  readonly commandLog: readonly LoggedCommand[];
}
```

Written to `platform/storage` under key `save:active` (one active run — multi-slot save management is
UI/product scope, not this phase's). "Save" is exactly PLAN.md §6.3's existing contract: seed + command
log, no full-state snapshot. Replay is cheap enough not to need one — a chapter tops out at a few
thousand ticks, and the balance harness already replays whole 90-day (129,600-tick) runs in-process in
well under a second per run.

**Load:**

```ts
function loadCampaignWorld(save: SaveEnvelope): World {
  const world = buildCampaignWorld(save.levelId, save.seed); // fresh registration, tick 0
  // then replay save.commandLog against it via the existing replay()/CommandQueue.fromLog machinery
}
```

Concretely, this reuses `replay()`/`CommandQueue.fromLog` (`src/sim/core/world.ts`) exactly as-built —
`buildCampaignWorld` supplies the `registerSystems` callback `replay()` already accepts. No changes to
`replay()` itself.

**Migrations.** `migrateSaveEnvelope(raw: unknown): SaveEnvelope` validates against a Zod schema keyed
on `version`. Today there is exactly one version (`1`) and the function is a documented no-op pass
through — this is the seam future format changes hook into, not a speculative migration chain built
ahead of any actual second version.

## 6. Unlock tree — `src/platform/profile/`

New module, parallel to `src/platform/entitlements/`:

```ts
interface ProfileState {
  readonly unlockedLevelIds: readonly string[];
  readonly completedLevelIds: readonly string[];
}

function getProfile(): Promise<ProfileState>;
function markLevelComplete(levelId: string): Promise<ProfileState>;
function isLevelUnlocked(levelId: string): Promise<boolean>;
```

Stored under `platform/storage` key `profile:v1`. `markLevelComplete` looks up the level's successor
in a static id→next-id table (`content/levels`' authored order — `l1 → l2 → l3`, later extended as
bosses 4–10 land) and adds it to `unlockedLevelIds` if not already present. This lives in `src/platform`
because it's cross-run, storage-backed, and — unlike `CampaignSystem`'s per-run objective state — has
no bearing on any single world's hash or replay. Nothing in `src/sim` knows this exists.

## 7. Bridge integration point — `src/bridge/campaign-bridge.ts`

There's no UI consumer yet (§1), but the gate still needs something real to drive `advanceChapter`
and prove the unlock fires — not just unit tests reaching into `CampaignSystem` directly. A new
`CampaignBridge` class, the same shape and role as the existing `BuildModeBridge`
(`src/bridge/build-bridge.ts`) but built on `buildCampaignWorld`/`loadCampaignWorld` (§5) rather than
registering its own systems inline:

```ts
class CampaignBridge {
  static start(levelId: string, seed: number): CampaignBridge;
  static resume(save: SaveEnvelope): CampaignBridge;

  tick(): void;                    // world.step()
  advanceChapter(): boolean;       // false if entitlements.canPlay() denies it; throws if the
                                    // sim itself rejects it (chapter not actually complete)
  save(): SaveEnvelope;
}
```

`entitlements.canPlay(levelId, chapterIndex)` (already implemented, `src/platform/entitlements`,
returns `true` unconditionally today) is called inside `advanceChapter()` — after `CampaignSystem`'s
own `chapterStatus === 'complete'` is already known from the current snapshot, so permission is only
asked for a transition that's actually been earned — and inside `start()`/`resume()` for chapter 0 of
a fresh or reloaded level. This phase wires the call sites; it does not change `canPlay`'s behavior.
`CampaignBridge` also drains `levelWon` events after each `tick()`/`advanceChapter()` and calls
`markLevelComplete` (§6) when one fires — the one place outside `src/sim` that connects a level result
to the profile record. `src/view`/`src/ui` will consume `CampaignBridge` from phase 2.2/2.3 onward,
exactly as they already consume `BuildModeBridge`; this phase's own use of it is the gate-proof
integration test (§11) plus a minimal debug affordance, not real UI.

## 8. Harness convergence

`tools/sim-harness/metrics.ts`'s `computeShareTrajectory` and `computeWinResult` are deleted and
re-imported from `src/sim`'s new `systems/campaign/objectives.ts` export. `gate.ts`'s acceptance-rule
and monotonic-CL logic are unchanged — they consume the same function signatures, just from a different
module. This is a pure relocation: no behavior change, so no golden re-baseline from this specific
step (the harness never touched `World.hash` to begin with, per its own spec §9).

## 9. Golden scenarios — no re-baseline, one new scenario

Correction from an earlier draft of this spec: `CampaignSystem` is **not** registered into any of
`tests/golden/scenarios.ts`'s existing ten scenarios. Six of the ten (`empty-world`, `single-system`,
`three-systems`, `speed-and-pause`, `grid-build`, `grid-and-pathing`) never register `MarketSystem`/
`EconomySystem` at all, and the other four (`shopper-trip`, `catchment-week`, `rival-reaction`,
`pricing-and-promotions`) are synthetic engine-behavior recipes with no relationship to any authored
`LevelDef` — `CampaignSystem` needs both a market/economy pair *and* a specific level's content to mean
anything, so forcing it into a generic recipe would be inventing a fake level for no reason. **No
existing golden hash moves, and no re-baseline commit is needed.**

Instead, `tests/golden/scenarios.ts` gains **one new, additive** `'campaign-l1'` entry built via
`buildCampaignWorld('l1', seed)` (§5.1), run long enough for the first chapter's objective to be met
and an `advanceChapter` command to fire — proving `CampaignSystem`'s own hash sequence is stable over
time, the same tripwire every other system already has, without touching anything the other ten
scenarios record.

## 10. File layout

```
src/sim/systems/campaign/
├── types.ts        # CampaignState, ChapterStatus, LevelStatus, LevelDef, ChapterDef, Objective
├── config.ts        # parseLevelConfig, DEFAULT_LEVELS (content/levels/*.json5 loader)
├── objectives.ts     # computeShareTrajectory, computeWinResult (moved from the harness), ebitdaStreak check
├── system.ts         # CampaignSystem
├── index.ts
└── *.test.ts
src/sim/campaignWorld.ts   # buildCampaignWorld, loadCampaignWorld, SaveEnvelope, migrateSaveEnvelope
src/platform/profile/
├── index.ts          # ProfileState, getProfile, markLevelComplete, isLevelUnlocked
└── profile.test.ts
src/bridge/
├── campaign-bridge.ts     # CampaignBridge — §7
└── campaign-bridge.test.ts
content/levels/
├── l1-sav-a-lott.json5
├── l2-grocerteria-24.json5
└── l3-bulkhaus-club.json5
```

`tools/sim-harness/metrics.ts` loses its two relocated functions; `tools/sim-harness/gate.ts`'s imports
update accordingly.

## 11. Testing

- **`CampaignSystem` unit tests:** chapter objective met → `chapterStatus` flips; `advanceChapter`
  before that throws; `advanceChapter` on the last chapter sets `levelStatus: 'won'` and fires
  `levelWon`; sustained negative EBITDA sets `levelStatus: 'lost'` regardless of chapter progress;
  hash changes when (and only when) tracked state actually changes.
- **`objectives.ts` unit tests:** the existing harness test cases for `computeShareTrajectory`/
  `computeWinResult` move over unchanged (crosses-and-holds, crosses-and-reverts, never-crosses,
  exactly-at-threshold) — proving the relocation didn't alter behavior.
- **Content schema tests:** `parseLevelConfig` rejects a level with zero chapters, an unknown objective
  `type`, or a `rivalId` not present in `DEFAULT_RIVAL_STORES`.
- **`buildCampaignWorld`/save-load integration test — the actual gate proof:** build L1, run to the
  last chapter's objective threshold, save mid-chapter (partial command log), `loadCampaignWorld` from
  that save, confirm `world.hash` matches a world that never saved/reloaded and instead ran the same
  command log straight through. Then finish the level, confirm `levelWon` fires and
  `markLevelComplete('l1')` unlocks `'l2'` in a fresh `ProfileState`.
- **`profile.ts` unit tests:** unlock table lookup, idempotent `markLevelComplete` (calling it twice
  doesn't duplicate an id), `isLevelUnlocked` default state (only `l1` unlocked with no prior profile).
- **Golden scenario:** the new additive `'campaign-l1'` entry per §9 — recorded fresh via
  `UPDATE_GOLDEN=1 npm test` (it has no prior baseline to compare against, unlike the existing ten),
  in the same commit that adds it. The existing ten scenarios' recorded hashes are asserted unchanged.

## 12. Explicitly out of scope

- **All UI** — intro/outro/objective cards, chapter-transition screens, any rendering at all. Content
  fields exist (`introCopy`/`outroCopy`); nothing consumes them yet. Per the standing project
  preference, that work pauses for a Figma consult before its own spec.
- **Bosses 4–10** (phase 5.1) and their signatures — L1–L3 only, matching the three rivals phase 2.0
  authored.
- **Balance tuning** (phase 5.4) — chapter thresholds and the lose condition's `maxNegativeDays` are a
  documented first pass, not derived from a passing `balance:gate` run (today's `balance:gate` output
  is an honest FAIL, unchanged by this phase).
- **Multi-slot saves, cloud sync, save UI** — one `save:active` key, local only. Cloud sync is §8.2
  (phase 3.1); this phase's `SaveEnvelope`/migration seam is designed so that lands without reshaping
  it, not built ahead of time.
- **A cumulative cash/balance-sheet concept.** The lose condition uses the daily EBITDA history
  `EconomySystem` already tracks (`ebitdaStreak`), not a new running-cash total — PLAN.md §5.7 has no
  balance sheet today and this phase doesn't introduce one.
- **Sandbox/scenario/daily-challenge mode wiring** (phases 2.4, 3.2) — `LevelDef`'s shape is meant to
  accommodate a `sandbox: true` flag later without restructuring (PLAN.md §13's "same schema, different
  flags" rule), but that flag and its handling are not built now — nothing here needs it to prove the
  2.1 gate.
