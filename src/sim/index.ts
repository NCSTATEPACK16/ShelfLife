/**
 * The simulation's public API.
 *
 * Everything outside `src/sim` sees only this file. The renderer, the UI, the bridge,
 * the balance harness, and the leaderboard verifier all consume the same surface —
 * which is what keeps the boundary in docs/adr/0002 honest rather than aspirational.
 */

export { Clock, TICK_MS, TICKS_PER_SECOND, TICKS_PER_SIM_DAY, TICKS_PER_SIM_HOUR, timeFromTick } from './core/clock.js';
export type { SimTime } from './core/clock.js';

export { CommandQueue, hashCommand } from './core/commands.js';
export type { Command, CommandType, LoggedCommand } from './core/commands.js';

export { EventBus } from './core/events.js';
export type { SimEvent, SimEventType } from './core/events.js';

export { formatHash, Hasher } from './core/hash.js';

export { deriveSeed, fnv1a, Stream, StreamSet, STREAM_NAMES } from './core/rng.js';
export type { StreamName } from './core/rng.js';

export { freezeSnapshot } from './core/snapshot.js';
export type { WorldSnapshot } from './core/snapshot.js';

export { hashCommands, replay, World } from './core/world.js';
export type { System, WorldOptions } from './core/world.js';

export { BuildGrid, DEFAULT_CATALOG, GridSystem, parseCatalog, PlacementError } from './systems/grid/index.js';
export type { FixtureDef, Footprint, GridDimensions, Placement, Rotation } from './systems/grid/index.js';
