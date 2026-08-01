import type { PathingConfig } from './config.js';
import type { Vec2 } from './types.js';

export interface SteeringAgent {
  readonly position: Vec2;
  readonly neighbors: readonly Vec2[];
}

const ZERO: Vec2 = { x: 0, y: 0 };

function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

function normalize(v: Vec2): Vec2 {
  const len = length(v);
  return len === 0 ? ZERO : { x: v.x / len, y: v.y / len };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function clampLength(v: Vec2, max: number): Vec2 {
  const len = length(v);
  return len > max ? scale(v, max / len) : v;
}

/**
 * RVO-lite local steering (PLAN.md §6.5.4): blend "follow the flow field" with "push away
 * from nearby agents," clamp to max speed, and taper to a stop inside the arrival radius.
 */
export function computeSteering(
  agent: SteeringAgent,
  flowDirection: Vec2,
  distanceToDestination: number,
  config: PathingConfig,
): Vec2 {
  if (distanceToDestination <= config.arrivalRadius) return ZERO;

  const follow = scale(normalize(flowDirection), config.maxSpeed);

  let separation: Vec2 = ZERO;
  for (const neighbor of agent.neighbors) {
    const away: Vec2 = { x: agent.position.x - neighbor.x, y: agent.position.y - neighbor.y };
    const dist = length(away);
    if (dist === 0 || dist >= config.separationRadius) continue;
    // Weight inversely by distance: a neighbor about to overlap pushes harder than one
    // just inside the radius.
    const strength = (config.separationRadius - dist) / config.separationRadius;
    separation = add(separation, scale(normalize(away), strength));
  }

  const desired = add(follow, scale(separation, config.separationWeight * config.maxSpeed));
  return clampLength(desired, config.maxSpeed);
}
