import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import type { GoodDef } from '../goods/types.js';
import { DEFAULT_SEGMENT_CONFIG } from './config.js';
import type { SegmentConfig } from './config.js';
import { advancePantryDay, deriveShoppingList } from './household.js';
import type { Household } from './types.js';

/**
 * The market (PLAN.md §5.1, §16 phase 2.0c).
 *
 * Owns households — pantry, shopping list, segment, and catchment position. Phase 1.6
 * put these in `ShoppersSystem` because the in-store agent was their only consumer;
 * store choice inverts that, since the scheduler must reason about a household before
 * any shopper exists. `ShoppersSystem` is left owning the in-store agent alone.
 *
 * This task is the relocation only. Scheduling and the logit arrive in a later task.
 */
export class MarketSystem implements System {
  readonly name = 'market';
  readonly #catalog: readonly GoodDef[];
  readonly #segments: SegmentConfig;
  readonly #households = new Map<number, Household>();

  constructor(catalog: readonly GoodDef[] = DEFAULT_GOODS_CATALOG, segments: SegmentConfig = DEFAULT_SEGMENT_CONFIG) {
    this.#catalog = catalog;
    this.#segments = segments;
  }

  update(world: World): void {
    if (world.tick % TICKS_PER_SIM_DAY !== 0) return;
    for (const id of this.householdIds()) {
      this.#households.set(id, advancePantryDay(this.#households.get(id)!, this.#catalog, this.#segments));
    }
  }

  hash(_world: World, hasher: Hasher): void {
    const ids = this.householdIds();
    hasher.u32(ids.length);
    for (const id of ids) {
      const household = this.#households.get(id)!;
      hasher.u32(id).str(household.segment).i32(household.position.x).i32(household.position.y);
      for (const good of this.#catalog) hasher.f64(household.pantry[good.id] ?? 1);
      hasher.u32(household.list.length);
      for (const goodId of household.list) hasher.str(goodId);
    }
  }

  applyCommand(_world: World, command: Command): boolean {
    if (command.type !== 'addHousehold') return false;
    this.#households.set(command.householdId, {
      id: command.householdId,
      segment: command.segment,
      position: command.position,
      pantry: {},
      list: deriveShoppingList({}, this.#catalog),
    });
    return true;
  }

  household(id: number): Household {
    const household = this.#households.get(id);
    if (!household) throw new Error(`Unknown household id: ${id}`);
    return household;
  }

  hasHousehold(id: number): boolean {
    return this.#households.has(id);
  }

  /**
   * A completed sale refills the pantry for everything in the cart and recomputes the
   * list. Called by `ShoppersSystem`, which used to do this inline when it owned the
   * household map; a no-op for an unknown id, exactly as the old `if (household)` guard
   * was.
   */
  replenishPantry(householdId: number, goodIds: readonly string[]): void {
    const household = this.#households.get(householdId);
    if (!household) return;
    const pantry = { ...household.pantry };
    for (const goodId of goodIds) pantry[goodId] = 1;
    const list = deriveShoppingList(pantry, this.#catalog);
    this.#households.set(householdId, { ...household, pantry, list });
  }

  /** Ascending — never Map insertion order, since this drives hashing and RNG draws. */
  householdIds(): readonly number[] {
    return [...this.#households.keys()].sort((a, b) => a - b);
  }
}
