import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore, setStore } from '../platform/storage/index.js';
import { CampaignBridge } from './campaign-bridge.js';

beforeEach(() => {
  setStore(new MemoryStore());
});

/**
 * One deliberately thorough scenario exercising every command/accessor phase 2.3 added at
 * once — the same "run it for real" pattern every prior phase's gate-proof test has used
 * (see docs/handoff.md's phase 2.2 entry for the precedent this follows).
 */
describe('phase 2.3 gate — every new bridge command and accessor, exercised together', () => {
  it('build, stock, price, staff, and read every new accessor consistently', async () => {
    const bridge = CampaignBridge.start('l1', 20260903);

    // Build: place and stock a shelf, place a register.
    bridge.place('shelf_basic', 5, 5, 0);
    const shelfId = bridge.snapshot().placements.find((p) => p.fixtureId === 'shelf_basic')!.instanceId;
    bridge.stockFixture(shelfId, 'milk');
    bridge.place('register', 6, 5, 0);
    const registerId = bridge.snapshot().placements.find((p) => p.fixtureId === 'register' && p.instanceId !== 3)!
      .instanceId;

    // Staff: hire, assign, train.
    bridge.hireStaff(9001, 0.5, 0.8);
    bridge.assignStaffToRegister(9001, registerId);
    bridge.trainStaff(9001);
    const staff = bridge.staffRoster().find((s) => s.id === 9001)!;
    expect(staff.assignedRegisterId).toBe(registerId);
    expect(staff.skill).toBeGreaterThan(0.5);

    // Pricing: set a price, start a promotion, set marketing spend.
    const reference = bridge.referencePriceOf('milk');
    bridge.setPrice('milk', reference * 0.8);
    bridge.startPromotion('milk', 0.1, 500);
    bridge.setMarketingSpend(25);
    expect(bridge.priceOf('milk')).toBeLessThan(reference);

    // Run a full sim day so finance/inventory/rival state all have real data.
    for (let i = 0; i < 1440; i++) await bridge.tick();

    // Finance: a statement closed with the marketing spend reflected.
    const statement = bridge.financeStatements().at(-1);
    expect(statement).toBeDefined();
    expect(statement!.marketing).toBe(25);
    expect(bridge.financeLedger().length).toBeGreaterThan(0);

    // Inventory: the stocked good shows up with consistent stock/capacity/fraction.
    const milk = bridge.inventoryLevels().find((l) => l.goodId === 'milk')!;
    expect(milk.capacity).toBeGreaterThan(0);
    expect(milk.fraction).toBeCloseTo(milk.stock / milk.capacity, 5);

    // Rival intel: l1's one rival is present with the player's comparable KPIs alongside it.
    const intel = bridge.rivalIntel();
    expect(intel.rivals).toHaveLength(1);
    expect(intel.rivals[0]!.id).toBe('sav-a-lott');
    expect(intel.player.priceLevel).toBeLessThan(1); // milk was discounted above

    // Objective progress: a real number, not NaN or a placeholder.
    const progress = bridge.objectiveProgress();
    expect(Number.isFinite(progress.current)).toBe(true);
    expect(progress.target).toBe(0.15);

    // Tells: at least the shelf-fullness/queue mechanics from phase 2.2 are still reachable
    // through the merged bridge (regression guard — the bridge merge must not have dropped
    // this).
    bridge.addHousehold(9002, 'family', { x: 0, y: 0 });
    bridge.spawnShopper(9003, 9002);
    let sawTell = false;
    for (let i = 0; i < 2000 && !sawTell; i++) {
      await bridge.tick();
      if (bridge.pendingTells().length > 0) sawTell = true;
    }
    expect(sawTell).toBe(true);
  });
});
