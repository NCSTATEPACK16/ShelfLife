import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { BuildGrid } from '../grid/grid.js';
import { DEFAULT_CATALOG } from '../grid/catalog.js';
import { PathingSystem } from './system.js';

function worldWithPathing(seed = 1): { world: World; grid: BuildGrid; pathing: PathingSystem } {
  const world = new World({ seed });
  const grid = new BuildGrid({ width: 10, height: 10 }, DEFAULT_CATALOG);
  const pathing = new PathingSystem(grid);
  world.register(pathing);
  return { world, grid, pathing };
}

describe('PathingSystem', () => {
  it('registers a destination via a world command and computes its field within one tick', () => {
    const { world, pathing } = worldWithPathing();
    world.commands.push({
      type: 'registerPathingDestination',
      destinationId: 'exit',
      cells: [{ x: 9, y: 9 }],
    });
    world.step();
    expect(pathing.destinationIds()).toEqual(['exit']);
    expect(pathing.isDirty('exit')).toBe(false); // recomputed during the same tick's update()
    expect(pathing.distanceAt('exit', 0, 0)).toBe(18);
  });

  it('unregisters a destination', () => {
    const { world, pathing } = worldWithPathing();
    world.commands.push({ type: 'registerPathingDestination', destinationId: 'exit', cells: [{ x: 9, y: 9 }] });
    world.step();
    world.commands.push({ type: 'unregisterPathingDestination', destinationId: 'exit' });
    world.step();
    expect(pathing.destinationIds()).toEqual([]);
  });

  it('marks all destinations dirty when the grid version changes, and recomputes one per tick', () => {
    const { world, grid, pathing } = worldWithPathing();
    world.commands.push({ type: 'registerPathingDestination', destinationId: 'a', cells: [{ x: 0, y: 0 }] });
    world.commands.push({ type: 'registerPathingDestination', destinationId: 'b', cells: [{ x: 9, y: 9 }] });
    world.step(); // both registered; each gets its first compute across the next two ticks

    grid.place('shelf_basic', 5, 5, 0); // bumps grid.version outside a command, as GridSystem would do

    world.step(); // update() notices the version bump, marks both dirty, recomputes one
    const aDirty = pathing.isDirty('a');
    const bDirty = pathing.isDirty('b');
    expect(aDirty !== bDirty).toBe(true); // exactly one is still dirty, the other was just recomputed

    world.step(); // the second dirty destination gets its turn
    expect(pathing.isDirty('a')).toBe(false);
    expect(pathing.isDirty('b')).toBe(false);
  });

  it('does not claim kernel or grid command types', () => {
    const { pathing, world } = worldWithPathing();
    expect(pathing.applyCommand(world, { type: 'noop' })).toBe(false);
    expect(pathing.applyCommand(world, { type: 'placeFixture', fixtureId: 'shelf_basic', x: 0, y: 0, rotation: 0 })).toBe(
      false,
    );
  });

  it('replaying the command log reproduces the same hash', () => {
    const seed = 7;
    const { world } = worldWithPathing(seed);
    world.commands.push({ type: 'registerPathingDestination', destinationId: 'exit', cells: [{ x: 9, y: 9 }] });
    world.step();
    world.run(10);
    const finalHash = world.hash;

    const replayGrid = new BuildGrid({ width: 10, height: 10 }, DEFAULT_CATALOG);
    const replayed = new World({ seed });
    replayed.register(new PathingSystem(replayGrid));
    for (const entry of world.commands.log) {
      replayed.commands.push(entry.command);
    }
    replayed.run(11);
    expect(replayed.hash).toBe(finalHash);
  });
});
