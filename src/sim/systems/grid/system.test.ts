import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { GridSystem } from './system.js';

function worldWithGrid(seed = 1): { world: World; grid: GridSystem } {
  const world = new World({ seed });
  const grid = new GridSystem({ width: 20, height: 20 });
  world.register(grid);
  return { world, grid };
}

describe('GridSystem', () => {
  it('applies placeFixture via a world command and updates the grid', () => {
    const { world, grid } = worldWithGrid();
    world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 2, y: 2, rotation: 0 });
    world.step();
    expect(grid.grid.placements()).toHaveLength(1);
  });

  it('applies rotateFixture and removeFixture', () => {
    const { world, grid } = worldWithGrid();
    world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 2, y: 2, rotation: 0 });
    world.step();
    const instanceId = grid.grid.placements()[0]!.instanceId;

    world.commands.push({ type: 'rotateFixture', instanceId, rotation: 90 });
    world.step();
    expect(grid.grid.placements()[0]!.rotation).toBe(90);

    world.commands.push({ type: 'removeFixture', instanceId });
    world.step();
    expect(grid.grid.placements()).toEqual([]);
  });

  it('applies undoBuild and redoBuild', () => {
    const { world, grid } = worldWithGrid();
    world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 2, y: 2, rotation: 0 });
    world.step();
    world.commands.push({ type: 'undoBuild' });
    world.step();
    expect(grid.grid.placements()).toEqual([]);
    world.commands.push({ type: 'redoBuild' });
    world.step();
    expect(grid.grid.placements()).toHaveLength(1);
  });

  it('does not claim kernel command types', () => {
    const { grid, world } = worldWithGrid();
    expect(grid.applyCommand(world, { type: 'noop' })).toBe(false);
  });

  it('replaying the command log reproduces the same hash', () => {
    const seed = 7;
    const { world } = worldWithGrid(seed);
    for (let i = 0; i < 50; i++) {
      world.commands.push({
        type: 'placeFixture',
        fixtureId: 'cart_corral',
        x: i % 20,
        y: Math.floor(i / 20),
        rotation: 0,
      });
      world.step();
    }
    const finalHash = world.hash;

    const replayed = new World({ seed });
    replayed.register(new GridSystem({ width: 20, height: 20 }));
    for (const entry of world.commands.log) {
      replayed.commands.push(entry.command);
      replayed.step();
    }
    expect(replayed.hash).toBe(finalHash);
  });

  it('placing 50 fixtures then undoing all 50 hashes identically to a fresh world with the same registration', () => {
    const seed = 99;

    const fresh = new World({ seed });
    fresh.register(new GridSystem({ width: 20, height: 20 }));

    const built = new World({ seed });
    const builtGrid = new GridSystem({ width: 20, height: 20 });
    built.register(builtGrid);
    for (let i = 0; i < 50; i++) {
      built.commands.push({
        type: 'placeFixture',
        fixtureId: 'cart_corral',
        x: i % 20,
        y: Math.floor(i / 20),
        rotation: 0,
      });
      built.step();
    }
    for (let i = 0; i < 50; i++) {
      built.commands.push({ type: 'undoBuild' });
      built.step();
    }
    fresh.run(100); // same tick count as built (50 place + 50 undo steps)

    expect(builtGrid.grid.placements()).toEqual([]);
    expect(built.hash).toBe(fresh.hash);
  });
});
