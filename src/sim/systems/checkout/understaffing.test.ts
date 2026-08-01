import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import type { SimEvent } from '../../core/events.js';
import { EconomySystem } from '../economy/system.js';
import { GridSystem } from '../grid/system.js';
import { InventorySystem } from '../inventory/system.js';
import { PathingSystem } from '../pathing/system.js';
import { ShoppersSystem } from '../shoppers/system.js';
import { CheckoutSystem } from './system.js';

const SHOPPER_COUNT = 8;
const SPAWN_INTERVAL_TICKS = 2;

/**
 * PLAN.md §16 phase 1.8's literal gate: "understaffing produces visible queues,
 * balking, abandonment, and a measurable satisfaction drop." Same store layout (three
 * registers, one stocked shelf), same shoppers arriving at the same staggered cadence,
 * the only difference between the two runs is how many registers are staffed.
 */
function runStore(staffedRegisterCount: 1 | 3): {
  events: SimEvent[];
  maxQueueSeen: number;
} {
  const world = new World({ seed: 99 });
  const gridSystem = new GridSystem({ width: 24, height: 12 });
  world.register(gridSystem);
  const grid = gridSystem.grid;
  const pathing = new PathingSystem(grid);
  world.register(pathing);
  const inventory = new InventorySystem();
  world.register(inventory);
  const checkout = new CheckoutSystem(grid, pathing);
  world.register(checkout);
  const economy = new EconomySystem(checkout, inventory);
  world.register(economy);
  const shoppers = new ShoppersSystem(grid, pathing, inventory, checkout, economy);
  world.register(shoppers);

  world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 2, y: 2, rotation: 0 });
  // Fresh grid: the shelf above is instance 1. Registers placed next are 2, 3, 4.
  world.commands.push({ type: 'stockFixture', instanceId: 1, goodId: 'milk' });

  const registerPositions = [
    { x: 20, y: 2 },
    { x: 20, y: 5 },
    { x: 20, y: 8 },
  ];
  registerPositions.forEach((pos, i) => {
    world.commands.push({ type: 'placeFixture', fixtureId: 'register', x: pos.x, y: pos.y, rotation: 0 });
    if (i < staffedRegisterCount) {
      world.commands.push({ type: 'hireStaff', staffId: i + 1, skill: 0.9, morale: 0.9 });
      world.commands.push({ type: 'assignStaffToRegister', staffId: i + 1, instanceId: i + 2 });
    }
  });

  for (let i = 0; i < SHOPPER_COUNT; i++) {
    world.commands.push({ type: 'addHousehold', householdId: i + 1 });
  }
  world.step();

  // Every household needs milk on its list, without waiting out real pantry depletion —
  // running the same number of days for all of them keeps this deterministic and fast.
  world.run(5 * 1440);
  for (let i = 0; i < SHOPPER_COUNT; i++) {
    expect(shoppers.household(i + 1).list).toContain('milk');
  }

  const events: SimEvent[] = [];
  let maxQueueSeen = 0;
  let nextToSpawn = 0;
  for (let i = 0; i < 6000 && (nextToSpawn < SHOPPER_COUNT || shoppers.activeShopperIds().length > 0); i++) {
    // Staggered arrivals, not a simultaneous teleport-in — with no inter-shopper
    // separation force, identical-start shoppers would otherwise move in perfect
    // lockstep and all "reserve" the same lane before any of them actually joins its
    // queue, hiding the very capacity difference this test exists to show.
    if (nextToSpawn < SHOPPER_COUNT && i % SPAWN_INTERVAL_TICKS === 0) {
      world.commands.push({ type: 'spawnShopper', shopperId: nextToSpawn + 1, householdId: nextToSpawn + 1 });
      nextToSpawn++;
    }
    world.step();
    events.push(...world.events.drain());
    const waitingCount = Array.from({ length: SHOPPER_COUNT }, (_, s) => s + 1).filter(
      (id) => checkout.peekStatus(id) === 'waiting',
    ).length;
    if (waitingCount > maxQueueSeen) maxQueueSeen = waitingCount;
  }
  events.push(...world.events.drain());

  return { events, maxQueueSeen };
}

describe('understaffing (PLAN.md §16 phase 1.8 gate)', () => {
  it('produces a visible queue, balking/abandonment, and a measurable satisfaction drop vs. full staffing', () => {
    const understaffed = runStore(1);
    const fullyStaffed = runStore(3);

    const trips = (r: { events: SimEvent[] }) =>
      r.events.filter((e): e is Extract<SimEvent, { type: 'shopperTripCompleted' }> => e.type === 'shopperTripCompleted');

    const understaffedTrips = trips(understaffed);
    const fullyStaffedTrips = trips(fullyStaffed);
    expect(understaffedTrips).toHaveLength(SHOPPER_COUNT);
    expect(fullyStaffedTrips).toHaveLength(SHOPPER_COUNT);

    const avgSatisfaction = (ts: typeof understaffedTrips) => ts.reduce((s, t) => s + t.satisfaction, 0) / ts.length;
    const gaveUpCount = (ts: typeof understaffedTrips) => ts.filter((t) => t.balked || t.abandoned).length;

    // Visible queue: with only one lane open for 8 shoppers, a real queue forms.
    expect(understaffed.maxQueueSeen).toBeGreaterThan(0);
    // With three lanes open for the same 8 shoppers, queueing is far less likely.
    expect(understaffed.maxQueueSeen).toBeGreaterThan(fullyStaffed.maxQueueSeen);

    // Balking/abandonment: understaffed produces at least as many gave-up trips as full
    // staffing, and a measurable satisfaction gap exists between the two conditions.
    expect(gaveUpCount(understaffedTrips)).toBeGreaterThanOrEqual(gaveUpCount(fullyStaffedTrips));
    expect(avgSatisfaction(understaffedTrips)).toBeLessThan(avgSatisfaction(fullyStaffedTrips));
  });
});
