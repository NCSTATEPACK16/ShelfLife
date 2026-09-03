import { canPlay } from '../platform/entitlements/index.js';
import { markLevelComplete } from '../platform/profile/index.js';
import {
  buildCampaignWorld,
  loadCampaignWorld,
  DEFAULT_CATALOG,
  DEFAULT_SUPPLY_POLICIES,
  type CampaignState,
  type CampaignSystem,
  type CheckoutSystem,
  type DailyStatement,
  type EconomySystem,
  type FixtureDef,
  type GridDimensions,
  type GridSystem,
  type InventorySystem,
  type LedgerEntry,
  type PathingSystem,
  type Placement,
  type Position,
  type RivalsSystem,
  type Rotation,
  type SaveEnvelope,
  type Segment,
  type ShopperState,
  type ShoppersSystem,
  type StaffMember,
  type World,
} from '../sim/index.js';
import type { TellOccurrence } from '../view/tell-draw-plan.js';

export interface CampaignSnapshot {
  readonly dimensions: GridDimensions;
  readonly catalog: readonly FixtureDef[];
  readonly placements: readonly Placement[];
}

export interface RivalIntelEntry {
  readonly id: string;
  readonly name: string;
  readonly archetype: string;
  readonly communityLove: number;
  readonly quality: number;
  readonly service: number;
  readonly ambiance: number;
  readonly priceIndex: number;
}

export interface RivalIntel {
  readonly rivals: readonly RivalIntelEntry[];
  readonly player: { readonly priceLevel: number; readonly serviceScore: number };
}

export interface InventoryLevel {
  readonly goodId: string;
  readonly stock: number;
  readonly capacity: number;
  readonly fraction: number;
  readonly reorderPoint: number;
  readonly freshness: number;
}

/**
 * The only thing in the codebase that turns UI actions into World commands for real campaign
 * play. Absorbed BuildModeBridge's entire build/stock/shopper surface (phase 2.3) — see
 * docs/superpowers/specs/2026-09-03-ui-buildout-design.md §1 for why the two bridges existed
 * separately until now and why that was a real problem, not a style choice.
 */
export class CampaignBridge {
  readonly #world: World;
  #campaign: CampaignSystem;
  readonly #grid: GridSystem;
  readonly #pathing: PathingSystem;
  readonly #inventory: InventorySystem;
  readonly #checkout: CheckoutSystem;
  readonly #economy: EconomySystem;
  readonly #rivals: RivalsSystem;
  readonly #shoppers: ShoppersSystem;
  #tellBuffer: TellOccurrence[] = [];

  private constructor(
    world: World,
    campaign: CampaignSystem,
    grid: GridSystem,
    pathing: PathingSystem,
    inventory: InventorySystem,
    checkout: CheckoutSystem,
    economy: EconomySystem,
    rivals: RivalsSystem,
    shoppers: ShoppersSystem,
  ) {
    this.#world = world;
    this.#campaign = campaign;
    this.#grid = grid;
    this.#pathing = pathing;
    this.#inventory = inventory;
    this.#checkout = checkout;
    this.#economy = economy;
    this.#rivals = rivals;
    this.#shoppers = shoppers;
  }

  static start(levelId: string, seed: number): CampaignBridge {
    if (!canPlay(levelId, 0)) {
      throw new Error(`Not entitled to play level "${levelId}"`);
    }
    const h = buildCampaignWorld(levelId, seed);
    return new CampaignBridge(
      h.world, h.campaign, h.grid, h.pathing, h.inventory, h.checkout, h.economy, h.rivals, h.shoppers,
    );
  }

  static resume(save: SaveEnvelope): CampaignBridge {
    const h = loadCampaignWorld(save);
    const state = h.campaign.state();
    if (!canPlay(state.levelId, state.chapterIndex)) {
      throw new Error(`Not entitled to resume level "${state.levelId}" at chapter ${state.chapterIndex}`);
    }
    return new CampaignBridge(
      h.world, h.campaign, h.grid, h.pathing, h.inventory, h.checkout, h.economy, h.rivals, h.shoppers,
    );
  }

  get state(): CampaignState {
    return this.#campaign.state();
  }

  async tick(): Promise<void> {
    this.#world.step();
    await this.#handleEvents();
  }

  /**
   * Pushes `advanceChapter`. Throws `ChapterNotAdvanceableError` (from `src/sim`) if the sim
   * itself rejects it — the objective genuinely isn't met yet. Returns `false` without
   * touching the world if entitlements deny the *next* chapter/level (today, `canPlay` always
   * grants — see `src/platform/entitlements`).
   */
  /* ── Build/stock/shopper surface, migrated from BuildModeBridge (phase 2.3) ──────────── */

  place(fixtureId: string, x: number, y: number, rotation: Rotation): void {
    this.#step({ type: 'placeFixture', fixtureId, x, y, rotation });
  }

  rotate(instanceId: number, rotation: Rotation): void {
    this.#step({ type: 'rotateFixture', instanceId, rotation });
  }

  remove(instanceId: number): void {
    this.#step({ type: 'removeFixture', instanceId });
  }

  undo(): boolean {
    const hadUndo = this.#grid.grid.hasUndo();
    this.#step({ type: 'undoBuild' });
    return hadUndo;
  }

  redo(): boolean {
    const hadRedo = this.#grid.grid.hasRedo();
    this.#step({ type: 'redoBuild' });
    return hadRedo;
  }

  hasUndo(): boolean {
    return this.#grid.grid.hasUndo();
  }

  hasRedo(): boolean {
    return this.#grid.grid.hasRedo();
  }

  registerDestination(id: string, cells: readonly { x: number; y: number }[]): void {
    this.#step({ type: 'registerPathingDestination', destinationId: id, cells });
  }

  unregisterDestination(id: string): void {
    this.#step({ type: 'unregisterPathingDestination', destinationId: id });
  }

  /** Every walkable cell's direction toward `destinationId`, for the debug overlay only. */
  flowFieldDebug(destinationId: string): readonly { x: number; y: number; dx: number; dy: number }[] {
    const { width, height } = this.#grid.grid.dimensions;
    const out: { x: number; y: number; dx: number; dy: number }[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!this.#grid.grid.isWalkable(x, y)) continue;
        const dir = this.#pathing.directionAt(destinationId, x, y);
        out.push({ x, y, dx: dir.x, dy: dir.y });
      }
    }
    return out;
  }

  addHousehold(householdId: number, segment: Segment, position: Position): void {
    this.#step({ type: 'addHousehold', householdId, segment, position });
  }

  stockFixture(instanceId: number, goodId: string): void {
    this.#step({ type: 'stockFixture', instanceId, goodId });
  }

  spawnShopper(shopperId: number, householdId: number): void {
    this.#step({ type: 'spawnShopper', shopperId, householdId });
  }

  /** Every active shopper's position and FSM state, for rendering only. */
  shoppersSnapshot(): readonly { id: number; x: number; y: number; state: ShopperState }[] {
    return this.#shoppers.activeShopperIds().map((id) => {
      const shopper = this.#shoppers.shopper(id);
      return { id: shopper.id, x: shopper.position.x, y: shopper.position.y, state: shopper.state };
    });
  }

  /** Every tellFired event since the last read, accumulated by `#handleEvents` (see its
   *  docstring for why this can't just re-drain `world.events` itself). */
  pendingTells(): readonly TellOccurrence[] {
    const tells = this.#tellBuffer;
    this.#tellBuffer = [];
    return tells;
  }

  /** Every stocked shelf's fraction of capacity (0-1) — feeds the visibility world-mark
   *  tell (full/half/empty), a per-frame world read rather than an event. */
  shelfFullness(): readonly { instanceId: number; fraction: number }[] {
    const result: { instanceId: number; fraction: number }[] = [];
    for (const placement of this.#grid.grid.placements()) {
      const goodId = this.#shoppers.stockedGoodAt(placement.instanceId);
      if (!goodId) continue;
      const capacity = this.#inventory.capacityOf(goodId);
      const fraction = capacity > 0 ? Math.min(1, this.#inventory.stockOf(goodId) / capacity) : 0;
      result.push({ instanceId: placement.instanceId, fraction });
    }
    return result;
  }

  snapshot(): CampaignSnapshot {
    return {
      dimensions: this.#grid.grid.dimensions,
      catalog: DEFAULT_CATALOG,
      placements: this.#grid.grid.placements(),
    };
  }

  async advanceChapter(): Promise<boolean> {
    const before = this.state;
    const isLastChapter = before.chapterIndex === this.#campaign.level.chapters.length - 1;
    const targetChapterIndex = isLastChapter ? before.chapterIndex : before.chapterIndex + 1;
    if (!canPlay(before.levelId, targetChapterIndex)) return false;

    this.#world.commands.push({ type: 'advanceChapter' });
    this.#world.step();
    await this.#handleEvents();
    return true;
  }

  /* ── Pricing ──────────────────────────────────────────────────────────────────────────── */

  setPrice(goodId: string, price: number): void {
    this.#step({ type: 'setPrice', goodId, price });
  }

  startPromotion(goodId: string, discountFraction: number, durationTicks: number): void {
    this.#step({ type: 'startPromotion', goodId, discountFraction, durationTicks });
  }

  setMarketingSpend(dailyAmount: number): void {
    this.#step({ type: 'setMarketingSpend', dailyAmount });
  }

  priceOf(goodId: string): number {
    return this.#economy.priceOf(goodId, this.#world.tick);
  }

  referencePriceOf(goodId: string): number {
    return this.#economy.referencePriceOf(goodId);
  }

  /* ── Staff ────────────────────────────────────────────────────────────────────────────── */

  hireStaff(staffId: number, skill: number, morale: number): void {
    this.#step({ type: 'hireStaff', staffId, skill, morale });
  }

  assignStaffToRegister(staffId: number, instanceId: number): void {
    this.#step({ type: 'assignStaffToRegister', staffId, instanceId });
  }

  trainStaff(staffId: number): void {
    this.#step({ type: 'trainStaff', staffId });
  }

  staffRoster(): readonly StaffMember[] {
    return this.#checkout.staffIds().map((id) => this.#checkout.staff(id));
  }

  /* ── Finance ──────────────────────────────────────────────────────────────────────────── */

  financeStatements(): readonly DailyStatement[] {
    return this.#economy.statements();
  }

  financeLedger(): readonly LedgerEntry[] {
    return this.#economy.ledger();
  }

  /* ── Rival intel ──────────────────────────────────────────────────────────────────────── */

  rivalIntel(): RivalIntel {
    const rivals: RivalIntelEntry[] = [];
    // 'family' is a fixed representative segment for this cross-segment summary view — the
    // same documented-proxy pattern phase 2.2 used for needState (see the gentle-surface
    // spec §2). Signature-driven per-segment variance is real (RivalsSystem#effectiveStore
    // takes a segment) but a single UI card can't show all seven at once; this is a
    // deliberate simplification, not a bug.
    for (let i = 0; i < this.#rivals.count(); i++) {
      const store = this.#rivals.effectiveStore(i, 'family');
      rivals.push({
        id: store.id,
        name: store.name,
        archetype: store.archetype,
        communityLove: store.communityLove,
        quality: store.quality,
        service: store.service,
        ambiance: store.ambiance,
        priceIndex: store.priceIndex,
      });
    }
    return {
      rivals,
      player: {
        priceLevel: this.#economy.priceLevel(this.#world.tick),
        serviceScore: this.#checkout.serviceScore(),
      },
    };
  }

  /* ── Inventory ────────────────────────────────────────────────────────────────────────── */

  inventoryLevels(): readonly InventoryLevel[] {
    return DEFAULT_SUPPLY_POLICIES.map((policy) => {
      const stock = this.#inventory.stockOf(policy.goodId);
      const capacity = this.#inventory.capacityOf(policy.goodId);
      return {
        goodId: policy.goodId,
        stock,
        capacity,
        fraction: capacity > 0 ? Math.min(1, stock / capacity) : 0,
        reorderPoint: policy.reorderPoint,
        freshness: this.#inventory.freshnessOf(policy.goodId, this.#world.tick),
      };
    });
  }

  /* ── Objective progress ──────────────────────────────────────────────────────────────── */

  objectiveProgress(): { readonly current: number; readonly target: number } {
    return this.#campaign.objectiveProgress();
  }

  save(): SaveEnvelope {
    return {
      version: 1,
      levelId: this.state.levelId,
      seed: this.#world.seed,
      tick: this.#world.tick,
      commandLog: this.#world.commands.log,
    };
  }

  #step(command: Parameters<World['commands']['push']>[0]): void {
    this.#world.commands.push(command);
    this.#world.step();
  }

  /**
   * `world.events.drain()` is destructive — only one caller can consume a given tick's batch.
   * `tick()`/`advanceChapter()` must react to `levelWon` immediately (it's async, awaiting
   * `markLevelComplete`), but `pendingTells()` is a separate, synchronous consumer the UI polls
   * on its own cadence. Draining once here into `#tellBuffer` and handling admin events in the
   * same pass is what lets both consumers see every event exactly once.
   */
  async #handleEvents(): Promise<void> {
    for (const event of this.#world.events.drain()) {
      if (event.type === 'levelWon') {
        await markLevelComplete(event.levelId);
      } else if (event.type === 'tellFired') {
        this.#tellBuffer.push({ shopperId: event.shopperId, term: event.term, magnitude: event.magnitude });
      }
    }
  }
}
