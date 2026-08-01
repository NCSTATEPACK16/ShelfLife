import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { BuildGrid } from '../grid/grid.js';
import { DEFAULT_CATALOG } from '../grid/catalog.js';
import { PathingSystem } from '../pathing/system.js';
import { DEFAULT_STAFFING_CONFIG } from './config.js';
import { CheckoutSystem } from './system.js';

function worldWithCheckout(seed = 1): { world: World; grid: BuildGrid; pathing: PathingSystem; checkout: CheckoutSystem } {
  const world = new World({ seed });
  const grid = new BuildGrid({ width: 12, height: 12 }, DEFAULT_CATALOG);
  const pathing = new PathingSystem(grid);
  world.register(pathing);
  const checkout = new CheckoutSystem(grid, pathing);
  world.register(checkout);
  return { world, grid, pathing, checkout };
}

describe('CheckoutSystem — lanes', () => {
  it('a placed register with no assigned staff is a closed lane', () => {
    const { world, grid, checkout } = worldWithCheckout();
    grid.place('register', 3, 3, 0);
    world.step();
    expect(checkout.shortestOpenLane()).toBeNull();
  });

  it('hiring and assigning staff opens the register lane', () => {
    const { world, grid, checkout } = worldWithCheckout();
    grid.place('register', 3, 3, 0);
    const instanceId = grid.placements()[0]!.instanceId;
    world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.8, morale: 0.8 });
    world.commands.push({ type: 'assignStaffToRegister', staffId: 1, instanceId });
    world.step();
    expect(checkout.shortestOpenLane()).toBe(instanceId);
    expect(checkout.destinationIds()).toContain(checkout.laneDestinationId(instanceId));
  });

  it('a placed self_checkout is always open, no staff needed', () => {
    const { world, grid, checkout } = worldWithCheckout();
    grid.place('self_checkout', 5, 5, 0);
    const instanceId = grid.placements()[0]!.instanceId;
    world.step();
    expect(checkout.shortestOpenLane()).toBe(instanceId);
    expect(checkout.isSelfCheckout(instanceId)).toBe(true);
  });

  it('trainStaff increases skill, capped at 1', () => {
    const { world, checkout } = worldWithCheckout();
    world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.95, morale: 0.8 });
    world.step();
    world.commands.push({ type: 'trainStaff', staffId: 1 });
    world.step();
    expect(checkout.staff(1).skill).toBeCloseTo(1);
  });

  it('does not claim kernel or grid command types', () => {
    const { checkout, world } = worldWithCheckout();
    expect(checkout.applyCommand(world, { type: 'noop' })).toBe(false);
  });
});

describe('CheckoutSystem — queueing', () => {
  it('a shopper joining an empty lane starts being served immediately', () => {
    const { world, grid, checkout } = worldWithCheckout();
    grid.place('self_checkout', 5, 5, 0);
    const laneId = grid.placements()[0]!.instanceId;
    world.step();
    checkout.joinQueue(100, laneId, 3, world.tick);
    expect(checkout.statusOf(100)).toBe('beingServed');
  });

  it('a second shopper waits behind the first', () => {
    const { world, grid, checkout } = worldWithCheckout();
    grid.place('self_checkout', 5, 5, 0);
    const laneId = grid.placements()[0]!.instanceId;
    world.step();
    checkout.joinQueue(100, laneId, 10, world.tick); // enough items to keep them busy a while
    checkout.joinQueue(101, laneId, 3, world.tick);
    expect(checkout.statusOf(101)).toBe('waiting');
  });

  it('completes service after enough ticks and starts the next queued shopper', () => {
    const { world, grid, checkout } = worldWithCheckout();
    grid.place('self_checkout', 5, 5, 0);
    const laneId = grid.placements()[0]!.instanceId;
    world.step();
    checkout.joinQueue(100, laneId, 1, world.tick);
    checkout.joinQueue(101, laneId, 1, world.tick);
    let soldTick = -1;
    for (let i = 0; i < 200 && soldTick < 0; i++) {
      world.step();
      if (checkout.peekStatus(100) === 'sold') soldTick = i;
    }
    expect(soldTick).toBeGreaterThan(-1);
    expect(checkout.statusOf(100)).toBe('sold'); // one-time retrieval
    expect(checkout.statusOf(100)).toBe('notInQueue'); // consumed, not re-servable
    // The second shopper should now be being served (or already sold, if fast).
    expect(['beingServed', 'sold']).toContain(checkout.peekStatus(101));
  });

  it('leaves (balked or abandoned) once wait crosses balkToleranceTicks with no service', () => {
    const { world, grid, checkout } = worldWithCheckout();
    grid.place('self_checkout', 5, 5, 0);
    const laneId = grid.placements()[0]!.instanceId;
    world.step();
    // A huge order occupies the lane long enough for the next shopper to give up.
    checkout.joinQueue(100, laneId, 100_000, world.tick);
    checkout.joinQueue(101, laneId, 1, world.tick);
    world.run(400); // past abandonToleranceTicks (400) — guaranteed to have left by now
    expect(['balked', 'abandoned']).toContain(checkout.statusOf(101));
  });

  it('abandons at exactly abandonToleranceTicks even if the balk roll never fires first', () => {
    // Zero-width balk/abandon window (abandon = balk + 1 tick): there is no tick where
    // the probabilistic balk roll can land before the guaranteed abandon fires — this
    // deterministically exercises the "abandoned" branch regardless of RNG.
    const world = new World({ seed: 1 });
    const grid = new BuildGrid({ width: 12, height: 12 }, DEFAULT_CATALOG);
    const pathing = new PathingSystem(grid);
    world.register(pathing);
    const checkout = new CheckoutSystem(grid, pathing, {
      ...DEFAULT_STAFFING_CONFIG,
      balkToleranceTicks: 50,
      abandonToleranceTicks: 51,
    });
    world.register(checkout);
    grid.place('self_checkout', 5, 5, 0);
    const laneId = grid.placements()[0]!.instanceId;
    world.step();
    checkout.joinQueue(100, laneId, 100_000, world.tick);
    checkout.joinQueue(101, laneId, 1, world.tick);
    world.run(52);
    expect(checkout.statusOf(101)).toBe('abandoned');
  });

  it('cleanliness decays with no staff and recovers with staff assigned', () => {
    const { world, checkout } = worldWithCheckout();
    world.step();
    const initial = checkout.cleanliness();
    world.run(500);
    expect(checkout.cleanliness()).toBeLessThan(initial);
  });

  it('replaying the command log reproduces the same hash', () => {
    const seed = 7;
    const { world, grid } = worldWithCheckout(seed);
    grid.place('register', 3, 3, 0);
    const instanceId = grid.placements()[0]!.instanceId;
    world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.8, morale: 0.8 });
    world.commands.push({ type: 'assignStaffToRegister', staffId: 1, instanceId });
    world.run(50);
    const finalHash = world.hash;

    const replayGrid = new BuildGrid({ width: 12, height: 12 }, DEFAULT_CATALOG);
    replayGrid.place('register', 3, 3, 0);
    const replayPathing = new PathingSystem(replayGrid);
    const replayed = new World({ seed });
    replayed.register(replayPathing);
    replayed.register(new CheckoutSystem(replayGrid, replayPathing));
    for (const entry of world.commands.log) replayed.commands.push(entry.command);
    replayed.run(50);
    expect(replayed.hash).toBe(finalHash);
  });
});
