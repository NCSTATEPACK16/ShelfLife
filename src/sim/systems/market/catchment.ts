import type { CatchmentConfig } from './config.js';
import type { Position } from './types.js';

/**
 * Travel cost between two points on the coarse catchment grid (PLAN.md §5.1).
 *
 * Manhattan, not Euclidean: §5.1 specifies road-network distance on a coarse catchment
 * graph. Manhattan distance is the direct reading of "roads, not straight lines" without
 * modelling actual road geometry.
 *
 * Pure — no RNG, no sim state, no clock. Same tier as `consumptionMultiplierFor`.
 */
export function travelCost(a: Position, b: Position, config: CatchmentConfig): number {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) * config.distanceCostPerUnit;
}
