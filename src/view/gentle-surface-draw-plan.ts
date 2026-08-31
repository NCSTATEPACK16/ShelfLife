import JSON5 from 'json5';
import { z } from 'zod';
import tellTableRaw from '../../content/design/gentle-surface.json5?raw';
import tuningRaw from '../../content/design/gentle-surface-view.json5?raw';
import type { BuildModeSnapshot, ShopperSnapshot } from '../bridge/build-bridge.js';
import { DEFAULT_STAFFING_CONFIG, type SimEvent } from '../sim/index.js';
import type { Breakpoint } from '../platform/layout/index.js';
import { assetById, frameKey } from './asset-manifest.js';
import { fixtureSpritePlan, type SpritePlan } from './draw-plan.js';
import { priceMarkTint, spoiledTint } from './fixture-colors.js';
import { depthFor, worldToScreen, type ScreenPoint } from './projection.js';

/**
 * Which tell fires, for whom, and where it draws (docs/design/gentle-surface.md).
 *
 * Pure, like every other `*-draw-plan` module: no Phaser type, no `World`, no clock. It is
 * handed the events and the shopper counters the bridge exposes, diffs them against the
 * previous tick, and returns sprites. That is what makes "does a spoiled pickup fire a
 * stink cloud" a unit test rather than something you have to look at a browser to know.
 *
 * It computes nothing the simulation does not already compute. Every trigger below is a
 * delta over a counter `ShoppersSystem` already keeps and already hashes, or an event it
 * already emits — which is what keeps ADR 0007's no-moved-hash invariant true by
 * construction rather than by care.
 */

// ---------------------------------------------------------------------------- content

const TuningSchema = z.object({
  bubbleDurationTicks: z.number().int().positive(),
  bubbleCapRegular: z.number().int().positive(),
  bubbleCapCompact: z.number().int().positive(),
  animationPoseTicks: z.number().int().positive(),
  abandonedCartLifetimeTicks: z.number().int().positive(),
  worldMarkTicks: z.number().int().positive(),
  particleTicks: z.number().int().positive(),
  worldMarkRadiusTiles: z.number().positive(),
  priority: z.array(z.string().min(1)).min(1),
});

const TellSchema = z.object({
  term: z.string().min(1),
  bubble: z.string().min(1).nullable(),
  animation: z.string().min(1).nullable(),
  particle: z.string().min(1).nullable(),
  worldMark: z.boolean(),
  threshold: z.number(),
});

const TellTableSchema = z.object({
  satisfaction: z.array(TellSchema),
  impulse: z.array(TellSchema),
});

export type Tell = z.infer<typeof TellSchema>;

export const TUNING = TuningSchema.parse(JSON5.parse(tuningRaw));

const TELL_TABLE = TellTableSchema.parse(JSON5.parse(tellTableRaw));

/**
 * Every declared tell by term, satisfaction and impulse together.
 *
 * The two lists are separate in the content file because §5.3 and §5.4 are separate
 * formulas. Nothing here cares which formula a term came from — it cares what the tell
 * looks like — so they merge on the way in.
 */
const TELLS: ReadonlyMap<string, Tell> = new Map(
  [...TELL_TABLE.satisfaction, ...TELL_TABLE.impulse].map((tell) => [tell.term, tell]),
);

export function tellFor(term: string): Tell {
  const tell = TELLS.get(term);
  if (tell === undefined) throw new Error(`No declared tell for term "${term}"`);
  return tell;
}

// ------------------------------------------------------------------------------ terms

/**
 * The seven terms with a live signal in the simulation today.
 *
 * The other eight are declared, drawn, and wired to nothing — see the phase spec §1.1 and
 * the CHANGELOG entry. They are absent here rather than present-and-never-firing so that
 * `PRIORITY` below cannot silently rank something that cannot happen.
 */
export const LIVE_TERMS = [
  'fillRateMiss',
  'priceSurpriseNegative',
  'priceSurprisePositive',
  'queuePenaltyRising',
  'queuePenaltyBalk',
  'spoiledEncounters',
  'impulsePurchase',
] as const;

export type LiveTerm = (typeof LIVE_TERMS)[number];

export type Pose = 'pause' | 'recoil' | 'hop';

/**
 * A reaction pose and which of its two frames to draw.
 *
 * The frame comes from here rather than from `ShopperAnimator` because the animator times
 * the walk cycle by distance travelled, and a shopper holding a pose is standing still —
 * their walk phase never advances, so the pose would freeze on its first frame. Timing it
 * on the sim clock keeps it honest for the same reason the walk cycle is timed on
 * distance: neither should depend on how often the renderer happens to redraw.
 */
export interface PosedShopper {
  readonly pose: Pose;
  readonly frame: number;
}

/**
 * Which shared reaction pose each term plays (spec §1.2).
 *
 * Three poses, not seven: the bubble is already unique per term and carries the primary
 * signal (gentle-surface.md §12.1), so the body only has to say *what kind* of reaction it
 * is. `queuePenaltyBalk` has none — the shopper's existing walk-to-exit already *is*
 * "abandons the cart and walks out"; the new part is the cart they leave behind.
 */
const POSE_FOR_TERM: Readonly<Record<LiveTerm, Pose | null>> = {
  fillRateMiss: 'pause',
  queuePenaltyRising: 'pause',
  spoiledEncounters: 'recoil',
  priceSurpriseNegative: 'recoil',
  priceSurprisePositive: 'hop',
  impulsePurchase: 'hop',
  queuePenaltyBalk: null,
};

/**
 * The tint each term flashes on the fixture the shopper is standing at, if any.
 *
 * Only two terms mark the world this way. `fillRateMiss` declares `worldMark: true` in the
 * tell table and is deliberately absent here: docs/design/gentle-surface.md §1 says its
 * world mark is "the facing shows a visible gap" — the shelf's own empty state, which S2's
 * art already renders and which no tint should stand in for. Flashing a colour there both
 * says the wrong thing and, since a dry shelf misses for every shopper who walks up to it,
 * turns the store's most common tell into its loudest.
 *
 * `visibility` is the same story from the other direction: a well-faced shelf *is* the
 * tell. Neither needs anything from this module.
 */
const TINT_FOR_TERM: Readonly<Partial<Record<LiveTerm, () => number>>> = {
  spoiledEncounters: spoiledTint,
  priceSurpriseNegative: priceMarkTint,
};

/** Rank by the content file's order, highest first. Unlisted terms sort last. */
const PRIORITY: ReadonlyMap<string, number> = new Map(
  TUNING.priority.map((term, index) => [term, TUNING.priority.length - index]),
);

function rank(term: LiveTerm): number {
  return PRIORITY.get(term) ?? 0;
}

/**
 * §5.3's queuePenalty(t) = (t / balkTolerance)^1.6, superlinear.
 *
 * The exponent is written inline in `ShoppersSystem#stepLeaving` rather than exported, so
 * this is the one number in this file that is a copy instead of an import. `queue penalty
 * matches the simulation's own formula` in the test file pins the two together; if Track A
 * ever exports it, delete this and import it instead.
 */
const QUEUE_PENALTY_EXPONENT = 1.6;

export function queuePenalty(waitedTicks: number): number {
  if (waitedTicks <= 0) return 0;
  return Math.min(1, (waitedTicks / DEFAULT_STAFFING_CONFIG.balkToleranceTicks) ** QUEUE_PENALTY_EXPONENT);
}

// ------------------------------------------------------------------------------ state

interface ActiveBubble {
  readonly term: LiveTerm;
  readonly expiresAtTick: number;
}

interface ActivePose {
  readonly pose: Pose;
  readonly startedAtTick: number;
  readonly expiresAtTick: number;
}

interface ActiveMark {
  readonly instanceId: number;
  readonly tint: number;
  readonly expiresAtTick: number;
}

interface ActiveSwarm {
  readonly x: number;
  readonly y: number;
  readonly startedAtTick: number;
  readonly expiresAtTick: number;
}

interface ActiveCart {
  readonly x: number;
  readonly y: number;
  readonly expiresAtTick: number;
}

/**
 * Everything the gentle surface has to remember between ticks.
 *
 * Owned and threaded by the caller (`BuildScene`), never by this module — the same
 * arrangement `ShopperAnimator` already uses for facing and walk phase. It is entirely
 * view-local: nothing here reaches the world hash, and losing it costs at most one
 * frame's worth of bubbles.
 *
 * `bubbles` is keyed by shopper id rather than being a list, which makes
 * gentle-surface.md §3's "one bubble per shopper at a time" structural instead of a rule
 * somebody has to remember to enforce.
 */
export interface GentleSurfaceState {
  lastTick: number;
  previous: Map<number, ShopperSnapshot>;
  bubbles: Map<number, ActiveBubble>;
  poses: Map<number, ActivePose>;
  marks: ActiveMark[];
  swarms: ActiveSwarm[];
  carts: ActiveCart[];
  /** Shoppers whose rising-queue tell has already fired for their current wait. */
  queueAlerted: Set<number>;
}

export function createGentleSurfaceState(): GentleSurfaceState {
  return {
    lastTick: -1,
    previous: new Map(),
    bubbles: new Map(),
    poses: new Map(),
    marks: [],
    swarms: [],
    carts: [],
    queueAlerted: new Set(),
  };
}

// ------------------------------------------------------------------------------- plan

export interface GentleSurfacePlan {
  readonly bubbles: readonly SpritePlan[];
  readonly worldMarks: readonly SpritePlan[];
  readonly particles: readonly SpritePlan[];
  readonly cartMarkers: readonly SpritePlan[];
  readonly animationOverrides: ReadonlyMap<number, PosedShopper>;
}

export interface GentleSurfaceInput {
  /** This tick's drained events. Only `cartAbandoned` is read. */
  readonly events: readonly SimEvent[];
  readonly shoppers: readonly ShopperSnapshot[];
  /** Placements and catalog, for the world marks that land on a fixture. */
  readonly snapshot: BuildModeSnapshot;
  readonly tick: number;
  readonly origin: ScreenPoint;
  readonly breakpoint: Breakpoint;
}

export function gentleSurfaceDrawPlan(
  input: GentleSurfaceInput,
  state: GentleSurfaceState,
): GentleSurfacePlan {
  // Redraws happen more often than ticks — a tap, a selection, a camera pan all force
  // one. Detection runs on tick boundaries only, so a second redraw at the same tick
  // re-renders what is already active instead of firing every tell a second time.
  if (input.tick !== state.lastTick) {
    expire(state, input.tick);
    detect(input, state);
    state.lastTick = input.tick;
    state.previous = new Map(input.shoppers.map((shopper) => [shopper.id, shopper]));
  }

  return render(input, state);
}

// -------------------------------------------------------------------------- detection

function expire(state: GentleSurfaceState, tick: number): void {
  for (const [id, bubble] of state.bubbles) {
    if (bubble.expiresAtTick <= tick) state.bubbles.delete(id);
  }
  for (const [id, pose] of state.poses) {
    if (pose.expiresAtTick <= tick) state.poses.delete(id);
  }
  state.marks = state.marks.filter((mark) => mark.expiresAtTick > tick);
  state.swarms = state.swarms.filter((swarm) => swarm.expiresAtTick > tick);
  state.carts = state.carts.filter((cart) => cart.expiresAtTick > tick);
}

/** One shopper, one term, already resolved against everything else they tripped. */
interface Trigger {
  readonly shopper: ShopperSnapshot;
  readonly term: LiveTerm;
}

function detect(input: GentleSurfaceInput, state: GentleSurfaceState): void {
  const abandonedBy = new Set(
    input.events.filter((event) => event.type === 'cartAbandoned').map((event) => event.shopperId),
  );

  const live = new Set(input.shoppers.map((shopper) => shopper.id));
  for (const id of state.queueAlerted) {
    if (!live.has(id)) state.queueAlerted.delete(id);
  }

  const triggers: Trigger[] = [];
  for (const shopper of input.shoppers) {
    const term = triggeredTerm(shopper, state, input.tick, abandonedBy.has(shopper.id));
    if (term !== null) triggers.push({ shopper, term });
  }

  // Highest priority first, so what survives the cap is what matters most
  // (gentle-surface.md §3 rules 2 and 3).
  triggers.sort((a, b) => rank(b.term) - rank(a.term));

  const cap = input.breakpoint === 'compact' ? TUNING.bubbleCapCompact : TUNING.bubbleCapRegular;
  for (const trigger of triggers) {
    admit(trigger, input, state, cap);
  }
}

function triggeredTerm(
  shopper: ShopperSnapshot,
  state: GentleSurfaceState,
  tick: number,
  abandonedThisTick: boolean,
): LiveTerm | null {
  // The cart abandonment is an event, not a delta, so it does not need a previous
  // snapshot — which matters, because a shopper can abandon on the tick they appear.
  const candidates: LiveTerm[] = [];
  if (abandonedThisTick) candidates.push('queuePenaltyBalk');

  if (shopper.state === 'checkingOut' && shopper.checkoutJoinedAtTick !== null) {
    const penalty = queuePenalty(tick - shopper.checkoutJoinedAtTick);
    // Edge-triggered: fires the tick the wait crosses the declared threshold, not on
    // every tick above it. Otherwise a long queue is a strobe.
    if (penalty >= tellFor('queuePenaltyRising').threshold && !state.queueAlerted.has(shopper.id)) {
      state.queueAlerted.add(shopper.id);
      candidates.push('queuePenaltyRising');
    }
  } else {
    // Left the queue: arm the tell again for their next trip.
    state.queueAlerted.delete(shopper.id);
  }

  const previous = state.previous.get(shopper.id);
  if (previous !== undefined) {
    const dSpoiled = shopper.spoiledEncounters - previous.spoiledEncounters;
    const dImpulse = shopper.impulseHits - previous.impulseHits;
    const dCart = shopper.cartSize - previous.cartSize;
    const dList = shopper.listRemaining - previous.listRemaining;
    const dSurprise = shopper.priceSurpriseSum - previous.priceSurpriseSum;

    if (dSpoiled > 0) candidates.push('spoiledEncounters');
    if (dImpulse > 0) candidates.push('impulsePurchase');

    // A real purchase happened, so the change in the running surprise sum is this one
    // item's surprise. Positive means they paid less than the reference price.
    if (dCart === 1) {
      if (dSurprise <= -tellFor('priceSurpriseNegative').threshold) candidates.push('priceSurpriseNegative');
      else if (dSurprise >= tellFor('priceSurprisePositive').threshold) candidates.push('priceSurprisePositive');
    }

    // The list shrank without a sale and without a spoiled pickup — which is what
    // `#stepShopping` does when the shelf is empty, or when nothing in the store stocks
    // the good at all. Both are the same thing to the shopper: they wanted it and left
    // without it. This is gentle-surface.md's "single most important tell in the game".
    if (dList === -1 && dCart === 0 && dSpoiled === 0) candidates.push('fillRateMiss');
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((best, term) => (rank(term) > rank(best) ? term : best));
}

function admit(
  trigger: Trigger,
  input: GentleSurfaceInput,
  state: GentleSurfaceState,
  cap: number,
): void {
  const { shopper, term } = trigger;
  const tell = tellFor(term);

  // Silence is a feature (gentle-surface.md §3): a bubble that does not fit the screen's
  // budget is dropped, not queued. Nothing about this event is worth showing late.
  const existing = state.bubbles.get(shopper.id);
  const holdsASlot = existing !== undefined;
  const outranksExisting = existing === undefined || rank(term) > rank(existing.term);
  if (tell.bubble !== null && outranksExisting && (holdsASlot || state.bubbles.size < cap)) {
    state.bubbles.set(shopper.id, { term, expiresAtTick: input.tick + TUNING.bubbleDurationTicks });
  }

  // The body beat, the world mark, and the particles are not rate-limited. They are
  // quieter than a bubble by construction, and the world marks are what carry the signal
  // once the bubble budget is spent — which is the §3 rule, not an exception to it.
  const pose = POSE_FOR_TERM[term];
  if (pose !== null && tell.animation !== null) {
    state.poses.set(shopper.id, {
      pose,
      startedAtTick: input.tick,
      expiresAtTick: input.tick + TUNING.animationPoseTicks,
    });
  }

  if (term === 'queuePenaltyBalk') {
    state.carts.push({
      x: shopper.x,
      y: shopper.y,
      expiresAtTick: input.tick + TUNING.abandonedCartLifetimeTicks,
    });
    return;
  }

  const tint = TINT_FOR_TERM[term];
  if (tint === undefined && tell.particle === null) return;

  const nearest = nearestFixture(shopper, input);
  if (nearest === null) return;

  if (tint !== undefined) {
    state.marks.push({
      instanceId: nearest.instanceId,
      tint: tint(),
      expiresAtTick: input.tick + TUNING.worldMarkTicks,
    });
  }
  if (tell.particle !== null) {
    state.swarms.push({
      x: nearest.x,
      y: nearest.y,
      startedAtTick: input.tick,
      expiresAtTick: input.tick + TUNING.particleTicks,
    });
  }
}

/**
 * The placed fixture a shopper is standing closest to, or null if none is near enough.
 *
 * Proximity, not a shelf → good lookup: which shelf holds which good lives in
 * `ShoppersSystem`'s private state with no accessor, and exposing it is a Track A change
 * (the gap S2 already recorded). For a mark that lasts under a second, "the fixture they
 * are standing at" is the right answer anyway — and returning null past the radius is
 * better than tinting an unrelated shelf across the aisle.
 */
function nearestFixture(
  shopper: ShopperSnapshot,
  input: GentleSurfaceInput,
): { instanceId: number; x: number; y: number } | null {
  const catalogById = new Map(input.snapshot.catalog.map((def) => [def.id, def]));
  let best: { instanceId: number; x: number; y: number } | null = null;
  let bestDistance = TUNING.worldMarkRadiusTiles;

  for (const placement of input.snapshot.placements) {
    const def = catalogById.get(placement.fixtureId);
    const centreX = placement.x + (def?.footprint.width ?? 1) / 2;
    const centreY = placement.y + (def?.footprint.height ?? 1) / 2;
    const distance = Math.hypot(centreX - shopper.x, centreY - shopper.y);
    if (distance > bestDistance) continue;
    bestDistance = distance;
    best = { instanceId: placement.instanceId, x: centreX, y: centreY };
  }
  return best;
}

// ------------------------------------------------------------------------- projection

/** Rows of the bubble frame the tail occupies — mirrors `tools/art/generate/overlays.py`. */
const BUBBLE_TAIL_HEIGHT = 5;

/** Pixels between the top of a shopper's head and the point of their bubble's tail. */
const BUBBLE_GAP = 2;

/** Animation frames per reaction pose — the manifest declares two for every shopper state. */
const POSE_FRAMES = 2;

function render(input: GentleSurfaceInput, state: GentleSurfaceState): GentleSurfacePlan {
  const byId = new Map(input.shoppers.map((shopper) => [shopper.id, shopper]));

  const frameAsset = assetById('bubble_frame');
  const shopperAsset = assetById('shopper');
  const bubbles: SpritePlan[] = [];

  for (const [shopperId, bubble] of state.bubbles) {
    const shopper = byId.get(shopperId);
    // A shopper who left takes their bubble with them. Drawing it over an empty aisle
    // would read as a bug, not as a memory.
    if (shopper === undefined) continue;

    const screen = worldToScreen(shopper.x, shopper.y, input.origin);
    // The shopper sprite is bottom-anchored, so its head is one sprite-height up.
    const tailY = screen.y - shopperAsset.size[1] - BUBBLE_GAP;
    const depth = depthFor('overlay', shopper.y);

    bubbles.push({
      key: frameKey('bubble_frame'),
      atlas: frameAsset.atlas,
      x: screen.x,
      y: tailY,
      depth,
      originX: frameAsset.anchor[0],
      originY: frameAsset.anchor[1],
      flipX: false,
      tint: null,
    });

    const iconId = `bubble_${tellFor(bubble.term).bubble!}`;
    const iconAsset = assetById(iconId);
    bubbles.push({
      key: frameKey(iconId),
      atlas: iconAsset.atlas,
      x: screen.x,
      // Centred in the bubble's body — everything above the tail.
      y: tailY - BUBBLE_TAIL_HEIGHT - (frameAsset.size[1] - BUBBLE_TAIL_HEIGHT) / 2,
      depth: depth + 1,
      originX: iconAsset.anchor[0],
      originY: iconAsset.anchor[1],
      flipX: false,
      tint: null,
    });
  }

  const catalogById = new Map(input.snapshot.catalog.map((def) => [def.id, def]));
  const placementsById = new Map(input.snapshot.placements.map((p) => [p.instanceId, p]));
  const worldMarks: SpritePlan[] = [];
  for (const mark of state.marks) {
    const placement = placementsById.get(mark.instanceId);
    if (placement === undefined) continue; // bulldozed mid-flash
    worldMarks.push(
      fixtureSpritePlan(placement, catalogById, input.origin, { tint: mark.tint, subOrder: 1 }),
    );
  }

  const fliesAsset = assetById('particle_flies');
  const fliesFrames = fliesAsset.frames ?? 1;
  const particles: SpritePlan[] = state.swarms.map((swarm) => {
    const screen = worldToScreen(swarm.x, swarm.y, input.origin);
    return {
      key: frameKey('particle_flies', { frame: (input.tick - swarm.startedAtTick) % fliesFrames }),
      atlas: fliesAsset.atlas,
      x: screen.x,
      y: screen.y,
      depth: depthFor('overlay', swarm.y),
      originX: fliesAsset.anchor[0],
      originY: fliesAsset.anchor[1],
      flipX: false,
      tint: null,
    };
  });

  const cartAsset = assetById('cart_abandoned');
  const cartMarkers: SpritePlan[] = state.carts.map((cart) => {
    const screen = worldToScreen(cart.x, cart.y, input.origin);
    return {
      key: frameKey('cart_abandoned'),
      atlas: cartAsset.atlas,
      x: screen.x,
      y: screen.y,
      // A dropped cart is a world object, not an overlay: a shopper walking past it
      // should pass in front of or behind it like any other fixture.
      depth: depthFor('fixture', cart.y),
      originX: cartAsset.anchor[0],
      originY: cartAsset.anchor[1],
      flipX: false,
      tint: null,
    };
  });

  // Both frames of a pose get equal time, so a six-tick pose is three ticks of the
  // drawing and three of its derived second frame — one beat, not a flicker.
  const ticksPerPoseFrame = Math.max(1, Math.round(TUNING.animationPoseTicks / POSE_FRAMES));
  const animationOverrides = new Map<number, PosedShopper>();
  for (const [shopperId, active] of state.poses) {
    if (!byId.has(shopperId)) continue;
    const elapsed = input.tick - active.startedAtTick;
    animationOverrides.set(shopperId, {
      pose: active.pose,
      frame: Math.floor(elapsed / ticksPerPoseFrame) % POSE_FRAMES,
    });
  }

  return { bubbles, worldMarks, particles, cartMarkers, animationOverrides };
}
