import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import type { BuildGrid } from '../grid/grid.js';
import type { PathingSystem } from '../pathing/system.js';
import { DEFAULT_STAFFING_CONFIG } from './config.js';
import type { StaffingConfig } from './config.js';
import type { CheckoutOutcome, Lane, QueuedShopper, StaffMember } from './types.js';

const REGISTER_FIXTURE_ID = 'register';
const SELF_CHECKOUT_FIXTURE_ID = 'self_checkout';

function laneDestinationId(instanceId: number): string {
  return `checkout:${instanceId}`;
}

/**
 * Checkout & staff (PLAN.md §16 phase 1.8). One lane per placed `register`/
 * `self_checkout` fixture — a register lane is open only with an assigned staff member,
 * self-checkout is always open. Direct-sibling-call pattern with `PathingSystem`, same as
 * every system since 1.5: each open lane gets its own pathing destination.
 */
export class CheckoutSystem implements System {
  readonly name = 'checkout';
  readonly #grid: BuildGrid;
  readonly #pathing: PathingSystem;
  readonly #config: StaffingConfig;
  readonly #staff = new Map<number, StaffMember>();
  readonly #lanes = new Map<number, Lane>();
  readonly #outcomes = new Map<number, CheckoutOutcome>();
  #cleanliness = 1;
  #lastSeenGridVersion = -1;

  constructor(grid: BuildGrid, pathing: PathingSystem, config: StaffingConfig = DEFAULT_STAFFING_CONFIG) {
    this.#grid = grid;
    this.#pathing = pathing;
    this.#config = config;
  }

  update(world: World): void {
    if (this.#grid.version !== this.#lastSeenGridVersion) {
      this.#lastSeenGridVersion = this.#grid.version;
      this.#refreshLanes(world);
    }

    for (const [instanceId, lane] of this.#lanes) {
      this.#advanceLane(world, instanceId, lane);
    }

    const assignedStaffCount = [...this.#staff.values()].filter((s) => s.assignedRegisterId !== null).length;
    this.#cleanliness = Math.min(
      1,
      Math.max(
        0,
        this.#cleanliness - this.#config.cleanlinessDecayPerTick + assignedStaffCount * this.#config.cleanlinessRestorePerStaffPerTick,
      ),
    );
  }

  hash(_world: World, hasher: Hasher): void {
    const staffIds = [...this.#staff.keys()].sort((a, b) => a - b);
    hasher.u32(staffIds.length);
    for (const id of staffIds) {
      const s = this.#staff.get(id)!;
      hasher.u32(id).f64(s.skill).f64(s.morale).u32(s.assignedRegisterId ?? 0);
    }

    const laneIds = [...this.#lanes.keys()].sort((a, b) => a - b);
    hasher.u32(laneIds.length);
    for (const id of laneIds) {
      const lane = this.#lanes.get(id)!;
      hasher.u32(id).bool(lane.isSelfCheckout).u32(lane.staffId ?? 0);
      hasher.u32(lane.queue.length);
      for (const q of lane.queue) hasher.u32(q.shopperId).u32(q.itemCount).u32(q.joinedAtTick);
      hasher.bool(lane.serving !== null);
      if (lane.serving) hasher.u32(lane.serving.shopperId).u32(lane.serving.remainingTicks);
    }

    const outcomeIds = [...this.#outcomes.keys()].sort((a, b) => a - b);
    hasher.u32(outcomeIds.length);
    for (const id of outcomeIds) hasher.u32(id).str(this.#outcomes.get(id)!);

    hasher.f64(this.#cleanliness);
  }

  applyCommand(world: World, command: Command): boolean {
    switch (command.type) {
      case 'hireStaff':
        this.#staff.set(command.staffId, {
          id: command.staffId,
          skill: command.skill,
          morale: command.morale,
          assignedRegisterId: null,
        });
        return true;
      case 'assignStaffToRegister': {
        const staff = this.#staff.get(command.staffId);
        if (!staff) throw new Error(`Unknown staff id: ${command.staffId}`);
        this.#staff.set(command.staffId, { ...staff, assignedRegisterId: command.instanceId });
        // The lane for a fixture placed this same tick (outside a command, or in a
        // command applied earlier this same drain) may not exist yet — update()'s
        // version-triggered refresh runs after all commands this tick, not before.
        this.#refreshLanes(world);
        const lane = this.#lanes.get(command.instanceId);
        if (lane) this.#lanes.set(command.instanceId, { ...lane, staffId: command.staffId });
        return true;
      }
      case 'trainStaff': {
        const staff = this.#staff.get(command.staffId);
        if (!staff) throw new Error(`Unknown staff id: ${command.staffId}`);
        this.#staff.set(command.staffId, { ...staff, skill: Math.min(1, staff.skill + DEFAULT_STAFFING_CONFIG.trainingSkillIncrement) });
        return true;
      }
      default:
        return false;
    }
  }

  staff(id: number): StaffMember {
    const staff = this.#staff.get(id);
    if (!staff) throw new Error(`Unknown staff id: ${id}`);
    return staff;
  }

  destinationIds(): readonly string[] {
    return this.#pathing.destinationIds();
  }

  laneDestinationId(instanceId: number): string {
    return laneDestinationId(instanceId);
  }

  isSelfCheckout(instanceId: number): boolean {
    return this.#lanes.get(instanceId)?.isSelfCheckout ?? false;
  }

  /** The open lane (self-checkout, or a staffed register) with the fewest people; null if none open. */
  shortestOpenLane(): number | null {
    let best: number | null = null;
    let bestSize = Number.POSITIVE_INFINITY;
    for (const [instanceId, lane] of this.#lanes) {
      if (!this.#isOpen(lane)) continue;
      const size = lane.queue.length + (lane.serving ? 1 : 0);
      if (size < bestSize) {
        bestSize = size;
        best = instanceId;
      }
    }
    return best;
  }

  joinQueue(shopperId: number, laneId: number, itemCount: number, tick: number): void {
    const lane = this.#lanes.get(laneId);
    if (!lane) throw new Error(`Unknown checkout lane: ${laneId}`);
    const entry: QueuedShopper = { shopperId, itemCount, joinedAtTick: tick };
    if (!lane.serving) {
      this.#lanes.set(laneId, { ...lane, serving: this.#startServing(lane, entry, tick) });
      return;
    }
    this.#lanes.set(laneId, { ...lane, queue: [...lane.queue, entry] });
  }

  /** Non-consuming read — for observability/tests. Use `statusOf` to act on a terminal result. */
  peekStatus(shopperId: number): CheckoutOutcome {
    const outcome = this.#outcomes.get(shopperId);
    if (outcome) return outcome;
    for (const lane of this.#lanes.values()) {
      if (lane.serving?.shopperId === shopperId) return 'beingServed';
      if (lane.queue.some((q) => q.shopperId === shopperId)) return 'waiting';
    }
    return 'notInQueue';
  }

  /** Terminal outcomes (sold/balked/abandoned) are consumed on read — one caller acts on each. */
  statusOf(shopperId: number): CheckoutOutcome {
    const outcome = this.#outcomes.get(shopperId);
    if (outcome) {
      this.#outcomes.delete(shopperId);
      return outcome;
    }
    return this.peekStatus(shopperId);
  }

  cleanliness(): number {
    return this.#cleanliness;
  }

  #isOpen(lane: Lane): boolean {
    return lane.isSelfCheckout || lane.staffId !== null;
  }

  #startServing(lane: Lane, entry: QueuedShopper, _tick: number): { shopperId: number; remainingTicks: number } {
    return { shopperId: entry.shopperId, remainingTicks: this.#serviceTicksFor(lane, entry.itemCount) };
  }

  #serviceTicksFor(lane: Lane, itemCount: number): number {
    const staff = lane.staffId ? this.#staff.get(lane.staffId) : null;
    const factor = staff ? Math.max(0.01, staff.skill * staff.morale) : 1;
    let ticks = (itemCount * this.#config.serviceTicksPerItem) / factor;
    if (lane.isSelfCheckout) ticks *= this.#config.selfCheckoutServiceMultiplier;
    return Math.max(1, Math.round(ticks));
  }

  #advanceLane(world: World, instanceId: number, lane: Lane): void {
    let next = lane;

    if (next.serving) {
      const remainingTicks = next.serving.remainingTicks - 1;
      if (remainingTicks <= 0) {
        this.#outcomes.set(next.serving.shopperId, 'sold');
        const [head, ...rest] = next.queue;
        const serving = head ? this.#startServing(next, head, world.tick) : null;
        next = { ...next, serving, queue: rest };
      } else {
        next = { ...next, serving: { ...next.serving, remainingTicks } };
      }
    }

    const stillWaiting: QueuedShopper[] = [];
    for (const q of next.queue) {
      const wait = world.tick - q.joinedAtTick;
      if (wait >= this.#config.abandonToleranceTicks) {
        // Guaranteed exit at 2x tolerance (PLAN.md §5.6), whether or not the balk roll
        // below ever fired — the shopper does not wait forever.
        this.#outcomes.set(q.shopperId, 'abandoned');
      } else if (wait >= this.#config.balkToleranceTicks) {
        // Between the two thresholds, balking is a per-tick roll whose probability rises
        // toward 1 as the abandon threshold approaches — not a hard cutoff at
        // balkToleranceTicks, or "abandoned" could never actually be reached (balking
        // would always fire first). Uses the 'checkout' RNG stream, reserved since
        // phase 1.3 and unused until now.
        const span = this.#config.abandonToleranceTicks - this.#config.balkToleranceTicks;
        const balkProbability = span > 0 ? (wait - this.#config.balkToleranceTicks) / span : 1;
        if (world.rng.get('checkout').chance(balkProbability)) {
          this.#outcomes.set(q.shopperId, 'balked');
        } else {
          stillWaiting.push(q);
        }
      } else {
        stillWaiting.push(q);
      }
    }
    next = { ...next, queue: stillWaiting };

    this.#lanes.set(instanceId, next);
  }

  #refreshLanes(world: World): void {
    for (const placement of this.#grid.placements()) {
      if (placement.fixtureId !== REGISTER_FIXTURE_ID && placement.fixtureId !== SELF_CHECKOUT_FIXTURE_ID) continue;
      if (this.#lanes.has(placement.instanceId)) continue;

      const isSelfCheckout = placement.fixtureId === SELF_CHECKOUT_FIXTURE_ID;
      this.#lanes.set(placement.instanceId, {
        instanceId: placement.instanceId,
        isSelfCheckout,
        staffId: null,
        queue: [],
        serving: null,
      });

      const cells = this.#grid.footprintCells(placement.fixtureId, placement.x, placement.y, placement.rotation);
      this.#pathing.applyCommand(world, {
        type: 'registerPathingDestination',
        destinationId: laneDestinationId(placement.instanceId),
        cells,
      });
    }
  }
}
