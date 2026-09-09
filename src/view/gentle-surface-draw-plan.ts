import JSON5 from 'json5';
import { z } from 'zod';
import tuningRaw from '../../content/design/gentle-surface-view.json5?raw';
import type { CampaignSnapshot, ShopperSnapshot, TellOccurrence } from '../bridge/campaign-bridge.js';
import { DEFAULT_GENTLE_SURFACE_CONTENT, type TellTerm } from '../sim/content/gentle-surface.js';
import type { Breakpoint } from '../platform/layout/index.js';
import { assetById, frameKey } from './asset-manifest.js';
import { fixtureSpritePlan, type SpritePlan } from './draw-plan.js';
import { priceMarkTint, spoiledTint } from './fixture-colors.js';
import { depthFor, worldToScreen, type ScreenPoint } from './projection.js';

/**
 * Which tell fires, for whom, and where it draws (docs/design/gentle-surface.md).
 *
 * Pure, like every other `*-draw-plan` module: no Phaser type, no `World`, no clock. Unlike
 * the rest of them, it does not decide *whether* a tell fires — that decision belongs to
 * `src/sim` (the sim boundary, CLAUDE.md), which already resolves every term's threshold
 * and emits a `tellFired` event the moment it crosses. This module only turns
 * `CampaignBridge#pendingTells()` into sprites: which bubble, which reaction pose, which
 * world mark, positioned and rate-limited per `docs/design/gentle-surface.md` §3.
 */

// ---------------------------------------------------------------------------- content

const TuningSchema = z.object({
  bubbleDurationTicks: z.number().int().positive(),
  fadeInTicks: z.number().int().positive(),
  fadeOutTicks: z.number().int().positive(),
  bubbleCapRegular: z.number().int().positive(),
  bubbleCapCompact: z.number().int().positive(),
  animationPoseTicks: z.number().int().positive(),
  abandonedCartLifetimeTicks: z.number().int().positive(),
  worldMarkTicks: z.number().int().positive(),
  worldMarkFadeInTicks: z.number().int().positive(),
  worldMarkFadeOutTicks: z.number().int().positive(),
  particleTicks: z.number().int().positive(),
  worldMarkRadiusTiles: z.number().positive(),
  priority: z.array(z.string().min(1)).min(1),
});

export const TUNING = TuningSchema.parse(JSON5.parse(tuningRaw));

export function tellFor(term: TellTerm) {
  const tell = DEFAULT_GENTLE_SURFACE_CONTENT.get(term);
  if (tell === undefined) throw new Error(`No declared tell for term "${term}"`);
  return tell;
}

// ------------------------------------------------------------------------------ terms

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
 * Three poses, not fifteen: the bubble is already unique per term and carries the primary
 * signal (gentle-surface.md §12.1), so the body only has to say *what kind* of reaction it
 * is. Terms absent here play no pose — `queuePenaltyBalk`'s shopper already walks to the
 * exit, which *is* the reaction; a term with no live sim signal yet simply never reaches
 * this map at all.
 */
const POSE_FOR_TERM: Readonly<Partial<Record<TellTerm, Pose>>> = {
  fillRateMiss: 'pause',
  queuePenaltyRising: 'pause',
  spoiledEncounters: 'recoil',
  priceSurpriseNegative: 'recoil',
  priceSurprisePositive: 'hop',
  impulsePurchase: 'hop',
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
const TINT_FOR_TERM: Readonly<Partial<Record<TellTerm, () => number>>> = {
  spoiledEncounters: spoiledTint,
  priceSurpriseNegative: priceMarkTint,
};

/** Rank by the content file's order, highest first. Unlisted terms sort last. */
const PRIORITY: ReadonlyMap<string, number> = new Map(
  TUNING.priority.map((term: string, index: number) => [term, TUNING.priority.length - index]),
);

function rank(term: TellTerm): number {
  return PRIORITY.get(term) ?? 0;
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) ** 2;
}

export function easeInQuad(t: number): number {
  return t * t;
}

/** Opacity for a bubble at the current tick: eased in, held at 1, eased out. */
function bubbleAlpha(tick: number, bubble: ActiveBubble): number {
  const elapsed = tick - bubble.startedAtTick;
  if (elapsed < TUNING.fadeInTicks) {
    return easeOutQuad(elapsed / TUNING.fadeInTicks);
  }
  const remaining = bubble.expiresAtTick - tick;
  if (remaining < TUNING.fadeOutTicks) {
    return easeInQuad(Math.max(0, remaining) / TUNING.fadeOutTicks);
  }
  return 1;
}

/**
 * Lerp each RGB channel of `tint` toward white (0xffffff, i.e. no tint) as `mix` falls
 * from 1 (full colour) to 0 (neutral). A world mark has no separate marker sprite — it IS
 * the fixture's own sprite, recoloured in place — so fading it means blending the tint
 * itself rather than an alpha.
 */
export function blendTint(tint: number, mix: number): number {
  const r = (tint >> 16) & 0xff;
  const g = (tint >> 8) & 0xff;
  const b = tint & 0xff;
  const lerp = (channel: number): number => Math.round(channel + (255 - channel) * (1 - mix));
  return (lerp(r) << 16) | (lerp(g) << 8) | lerp(b);
}

function markMix(tick: number, mark: ActiveMark): number {
  const elapsed = tick - mark.startedAtTick;
  if (elapsed < TUNING.worldMarkFadeInTicks) {
    return easeOutQuad(elapsed / TUNING.worldMarkFadeInTicks);
  }
  const remaining = mark.expiresAtTick - tick;
  if (remaining < TUNING.worldMarkFadeOutTicks) {
    return easeInQuad(Math.max(0, remaining) / TUNING.worldMarkFadeOutTicks);
  }
  return 1;
}

// ------------------------------------------------------------------------------- state

interface ActiveBubble {
  readonly term: TellTerm;
  readonly startedAtTick: number;
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
  readonly startedAtTick: number;
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
  bubbles: Map<number, ActiveBubble>;
  poses: Map<number, ActivePose>;
  marks: ActiveMark[];
  swarms: ActiveSwarm[];
  carts: ActiveCart[];
  firedThisTick: TellTerm[];
}

export function createGentleSurfaceState(): GentleSurfaceState {
  return {
    lastTick: -1,
    bubbles: new Map(),
    poses: new Map(),
    marks: [],
    swarms: [],
    carts: [],
    firedThisTick: [],
  };
}

// ------------------------------------------------------------------------------- plan

export interface GentleSurfacePlan {
  readonly bubbles: readonly SpritePlan[];
  readonly worldMarks: readonly SpritePlan[];
  readonly particles: readonly SpritePlan[];
  readonly cartMarkers: readonly SpritePlan[];
  readonly animationOverrides: ReadonlyMap<number, PosedShopper>;
  /**
   * Terms newly admitted to a bubble this tick (i.e. that survived the rate cap). Drained
   * on read: a second call at the same tick returns an empty array. `BuildScene` uses this
   * to trigger audio exactly once per admitted tell, never replaying it on a mid-tick
   * redraw and never sounding for a tell the cap silenced.
   */
  readonly firedThisTick: readonly TellTerm[];
}

export interface GentleSurfaceInput {
  /** Every tell the sim fired since the last read (`CampaignBridge#pendingTells()`). */
  readonly tells: readonly TellOccurrence[];
  readonly shoppers: readonly ShopperSnapshot[];
  /** Placements and catalog, for the world marks that land on a fixture. */
  readonly snapshot: CampaignSnapshot;
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
  // re-renders what is already active instead of re-admitting the same tells twice.
  if (input.tick !== state.lastTick) {
    expire(state, input.tick);
    state.firedThisTick = [];
    detect(input, state);
    state.lastTick = input.tick;
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

/** One tell the sim fired, resolved against the shopper it fired for. */
interface Trigger {
  readonly shopper: ShopperSnapshot;
  readonly tell: TellOccurrence;
}

function detect(input: GentleSurfaceInput, state: GentleSurfaceState): void {
  const byId = new Map(input.shoppers.map((shopper) => [shopper.id, shopper]));

  const triggers: Trigger[] = [];
  for (const tell of input.tells) {
    const shopper = byId.get(tell.shopperId);
    // A shopper who already left before this frame drained their own tell — draws
    // nothing rather than guessing where they were.
    if (shopper !== undefined) triggers.push({ shopper, tell });
  }

  // Highest priority first, so what survives the cap is what matters most
  // (gentle-surface.md §3 rules 2 and 3).
  triggers.sort((a, b) => rank(b.tell.term) - rank(a.tell.term));

  const cap = input.breakpoint === 'compact' ? TUNING.bubbleCapCompact : TUNING.bubbleCapRegular;
  for (const trigger of triggers) {
    admit(trigger, input, state, cap);
  }
}

function admit(
  trigger: Trigger,
  input: GentleSurfaceInput,
  state: GentleSurfaceState,
  cap: number,
): void {
  const { shopper, tell: occurrence } = trigger;
  const term = occurrence.term;
  const tell = tellFor(term);

  // Silence is a feature (gentle-surface.md §3): a bubble that does not fit the screen's
  // budget is dropped, not queued. Nothing about this event is worth showing late.
  const existing = state.bubbles.get(shopper.id);
  const holdsASlot = existing !== undefined;
  const outranksExisting = existing === undefined || rank(term) > rank(existing.term);
  if (tell.bubble !== null && outranksExisting && (holdsASlot || state.bubbles.size < cap)) {
    state.bubbles.set(shopper.id, {
      term,
      startedAtTick: input.tick,
      expiresAtTick: input.tick + TUNING.bubbleDurationTicks,
    });
    state.firedThisTick.push(term);
  }

  // The body beat, the world mark, and the particles are not rate-limited. They are
  // quieter than a bubble by construction, and the world marks are what carry the signal
  // once the bubble budget is spent — which is the §3 rule, not an exception to it.
  const pose = POSE_FOR_TERM[term];
  if (pose !== undefined && tell.animation !== null) {
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

  const target = resolveWorldTarget(trigger, input);
  if (target === null) return;

  if (tint !== undefined) {
    state.marks.push({
      instanceId: target.instanceId,
      tint: tint(),
      startedAtTick: input.tick,
      expiresAtTick: input.tick + TUNING.worldMarkTicks,
    });
  }
  if (tell.particle !== null) {
    state.swarms.push({
      x: target.x,
      y: target.y,
      startedAtTick: input.tick,
      expiresAtTick: input.tick + TUNING.particleTicks,
    });
  }
}

/**
 * Which fixture a world mark or particle should land on.
 *
 * The sim names the exact fixture when it knows one (`tellFired`'s optional `worldRef` —
 * the shelf a pickup came from, the lane a queue formed at). When it doesn't (a price
 * surprise fires mid-aisle, tied to no single fixture), the fixture the shopper is
 * standing closest to is the right approximation for a mark that lasts under a second.
 */
function resolveWorldTarget(
  trigger: Trigger,
  input: GentleSurfaceInput,
): { instanceId: number; x: number; y: number } | null {
  const instanceId = trigger.tell.worldRef?.instanceId;
  if (instanceId !== undefined) {
    const centre = fixtureCentre(instanceId, input.snapshot);
    if (centre !== null) return { instanceId, ...centre };
    return null; // bulldozed between emission and render
  }
  return nearestFixture(trigger.shopper, input);
}

function fixtureCentre(
  instanceId: number,
  snapshot: CampaignSnapshot,
): { x: number; y: number } | null {
  const placement = snapshot.placements.find((p) => p.instanceId === instanceId);
  if (placement === undefined) return null;
  const def = snapshot.catalog.find((d) => d.id === placement.fixtureId);
  return {
    x: placement.x + (def?.footprint.width ?? 1) / 2,
    y: placement.y + (def?.footprint.height ?? 1) / 2,
  };
}

/**
 * The placed fixture a shopper is standing closest to, or null if none is near enough.
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

    const alpha = bubbleAlpha(input.tick, bubble);
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
      alpha,
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
      alpha,
    });
  }

  const catalogById = new Map(input.snapshot.catalog.map((def) => [def.id, def]));
  const placementsById = new Map(input.snapshot.placements.map((p) => [p.instanceId, p]));
  const worldMarks: SpritePlan[] = [];
  for (const mark of state.marks) {
    const placement = placementsById.get(mark.instanceId);
    if (placement === undefined) continue; // bulldozed mid-flash
    worldMarks.push(
      fixtureSpritePlan(placement, catalogById, input.origin, {
        tint: blendTint(mark.tint, markMix(input.tick, mark)),
        subOrder: 1,
      }),
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

  const firedThisTick = state.firedThisTick;
  state.firedThisTick = [];

  return { bubbles, worldMarks, particles, cartMarkers, animationOverrides, firedThisTick };
}
