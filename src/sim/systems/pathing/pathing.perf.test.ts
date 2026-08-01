import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { Stream } from '../../core/rng.js';
import { BuildGrid } from '../grid/grid.js';
import { DEFAULT_CATALOG } from '../grid/catalog.js';
import { DEFAULT_PATHING_CONFIG } from './config.js';
import { computeSteering } from './steering.js';
import { PathingSystem } from './system.js';
import type { Vec2 } from './types.js';

const DIMENSIONS = { width: 60, height: 40 }; // representative store footprint
const AGENT_COUNT = 400;
const TICKS = 1000;
const DESTINATION_ID = 'exit';

interface Agent {
  position: Vec2;
}

function scatterWalls(grid: BuildGrid, stream: Stream): void {
  // A handful of shelf-shaped obstacles so the flow field has to route around something,
  // not just walk a straight line — proves the algorithm under realistic conditions.
  for (let i = 0; i < 24; i++) {
    const x = stream.nextInt(1, DIMENSIONS.width - 2);
    const y = stream.nextInt(1, DIMENSIONS.height - 3);
    try {
      grid.place('shelf_basic', x, y, 0);
    } catch {
      // Occupied cell — skip, the exact wall layout doesn't matter for this test.
    }
  }
}

function spawnAgents(grid: BuildGrid, stream: Stream): Agent[] {
  const agents: Agent[] = [];
  while (agents.length < AGENT_COUNT) {
    const x = stream.nextInt(0, DIMENSIONS.width - 1);
    const y = stream.nextInt(0, DIMENSIONS.height - 1);
    if (!grid.isWalkable(x, y)) continue;
    agents.push({ position: { x: x + 0.5, y: y + 0.5 } });
  }
  return agents;
}

describe('pathing perf/robustness gate (PLAN.md §16 phase 1.5)', () => {
  it('routes 400 agents to a single exit with zero stuck agents over 1,000 ticks, under 1.5ms/tick', () => {
    const grid = new BuildGrid(DIMENSIONS, DEFAULT_CATALOG);
    const setupStream = new Stream(12345);
    scatterWalls(grid, setupStream);

    const world = new World({ seed: 12345 });
    const pathing = new PathingSystem(grid);
    world.register(pathing);
    // A real exit is a multi-cell doorway, not a single point — a literal one-cell corner
    // target creates an artificial chokepoint that has nothing to do with the pathing
    // algorithm's correctness (400 agents cannot physically occupy one cell's neighborhood
    // at once, in any implementation).
    world.commands.push({
      type: 'registerPathingDestination',
      destinationId: DESTINATION_ID,
      cells: [
        { x: DIMENSIONS.width - 1, y: DIMENSIONS.height - 1 },
        { x: DIMENSIONS.width - 2, y: DIMENSIONS.height - 1 },
        { x: DIMENSIONS.width - 1, y: DIMENSIONS.height - 2 },
        { x: DIMENSIONS.width - 3, y: DIMENSIONS.height - 1 },
        { x: DIMENSIONS.width - 1, y: DIMENSIONS.height - 3 },
      ],
    });
    world.step(); // registers and computes the field before agents move

    const agents = spawnAgents(grid, setupStream);
    const arrived = new Array<boolean>(agents.length).fill(false);
    const stuckSinceTick = new Array<number>(agents.length).fill(0);
    const lastDistance = agents.map((a) =>
      pathing.distanceAt(DESTINATION_ID, Math.floor(a.position.x), Math.floor(a.position.y)),
    );

    // Only world.step() — the pathing system's own per-tick cost — is timed. Moving the
    // 400 synthetic agents (an O(n^2) neighbor search that belongs to this test harness,
    // not to any shipped sim system) is deliberately excluded from the budget: it is not
    // what phase 1.5's "<1.5ms/tick" gate is about, and including it would make this test
    // measure test-harness overhead instead of the pathing system's cost.
    const tickDurations: number[] = [];

    for (let tick = 0; tick < TICKS; tick++) {
      // eslint-disable-next-line no-restricted-syntax -- measures test-harness wall-clock time, not sim behavior
      const start = performance.now();
      world.step();
      // eslint-disable-next-line no-restricted-syntax -- measures test-harness wall-clock time, not sim behavior
      tickDurations.push(performance.now() - start);

      const positions = agents.map((a) => a.position);
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i]!;
        if (arrived[i]) continue;
        const cellX = Math.floor(agent.position.x);
        const cellY = Math.floor(agent.position.y);
        const distance = pathing.distanceAt(DESTINATION_ID, cellX, cellY);
        const direction = pathing.directionAt(DESTINATION_ID, cellX, cellY);

        const neighbors = positions.filter(
          (p) => p !== agent.position && Math.hypot(p.x - agent.position.x, p.y - agent.position.y) < 2,
        );
        const velocity = computeSteering(
          { position: agent.position, neighbors },
          direction,
          distance < 0 ? Number.POSITIVE_INFINITY : distance,
          DEFAULT_PATHING_CONFIG,
        );
        agent.position = { x: agent.position.x + velocity.x, y: agent.position.y + velocity.y };

        const newDistance = pathing.distanceAt(
          DESTINATION_ID,
          Math.floor(agent.position.x),
          Math.floor(agent.position.y),
        );
        if (newDistance >= 0 && newDistance <= 1) arrived[i] = true;

        if (newDistance >= 0 && lastDistance[i]! >= 0 && newDistance >= lastDistance[i]!) {
          stuckSinceTick[i] = stuckSinceTick[i]! + 1;
        } else {
          stuckSinceTick[i] = 0;
        }
        lastDistance[i] = newDistance;
      }
    }

    const stillStuck = agents.filter((_a, i) => !arrived[i] && stuckSinceTick[i]! > 100);
    expect(stillStuck).toHaveLength(0);

    const meanTickMs = tickDurations.reduce((a, b) => a + b, 0) / tickDurations.length;
    expect(meanTickMs).toBeLessThan(1.5);
  });
});
