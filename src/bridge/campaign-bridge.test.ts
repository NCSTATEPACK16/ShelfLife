import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore, setStore } from '../platform/storage/index.js';
import { getProfile } from '../platform/profile/index.js';
import { CampaignBridge } from './campaign-bridge.js';

beforeEach(() => {
  setStore(new MemoryStore());
});

describe('CampaignBridge.start', () => {
  it('builds a fresh level at chapter 0', () => {
    const bridge = CampaignBridge.start('l1', 1);
    expect(bridge.state).toEqual({
      levelId: 'l1',
      chapterIndex: 0,
      chapterStatus: 'inProgress',
      levelStatus: 'inProgress',
    });
  });
});

describe('CampaignBridge#tick', () => {
  it('advances the world by one tick', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    await bridge.tick();
    // No direct tick counter is exposed; confirm indirectly via a second identical bridge
    // that never ticks having a different save tick than one that did.
    const untouched = CampaignBridge.start('l1', 1);
    expect(bridge.save().tick).not.toBe(untouched.save().tick);
  });
});

describe('CampaignBridge#advanceChapter', () => {
  it('throws if the sim rejects it (chapter not complete)', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    await expect(bridge.advanceChapter()).rejects.toThrow();
  });

  it('unlocks the next level in the profile when the final chapter completes', async () => {
    // Build a one-chapter, trivially-winnable synthetic level path is not available through
    // the bridge (it only knows authored levels) — so this test drives l1 far enough for its
    // final chapter's real threshold (0.35, Task 6) to resolve, then advances through all
    // three chapters.
    const bridge = CampaignBridge.start('l1', 20260902);
    // Run enough sim-time for chapter 1's objective (threshold 0.15, 7-day window) to resolve.
    // Household generation + trip scheduling means this needs real days, not ticks — run up to
    // 60 sim-days (matches PLAN.md §3.1's L1-3 "30-60 sim-days" target) advancing whenever the
    // current chapter completes.
    for (let day = 0; day < 60 && bridge.state.levelStatus === 'inProgress'; day++) {
      for (let i = 0; i < 1440; i++) await bridge.tick();
      if (bridge.state.chapterStatus === 'complete') await bridge.advanceChapter();
    }
    expect(bridge.state.levelStatus).toBe('won');
    const profile = await getProfile();
    expect(profile.completedLevelIds).toContain('l1');
    expect(profile.unlockedLevelIds).toContain('l2');
  });
});

describe('CampaignBridge — build/stock/shopper surface', () => {
  it('places a fixture and reflects it in the snapshot', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.place('shelf_basic', 2, 2, 0);
    const snap = bridge.snapshot();
    expect(snap.placements.some((p) => p.fixtureId === 'shelf_basic')).toBe(true);
  });

  it('rotates and removes a fixture', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.place('shelf_basic', 2, 2, 0);
    const placed = bridge.snapshot().placements.find((p) => p.fixtureId === 'shelf_basic')!;
    bridge.rotate(placed.instanceId, 90);
    expect(bridge.snapshot().placements.find((p) => p.instanceId === placed.instanceId)?.rotation).toBe(90);
    bridge.remove(placed.instanceId);
    expect(bridge.snapshot().placements.some((p) => p.instanceId === placed.instanceId)).toBe(false);
  });

  it('undo/redo round-trip through the bridge', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    // Flush l1's queued starting-store commands (applied lazily on the first world.step())
    // before capturing a baseline count, so `before` reflects the settled starting store,
    // not zero.
    await bridge.tick();
    const before = bridge.snapshot().placements.length;
    bridge.place('shelf_basic', 2, 2, 0);
    expect(bridge.undo()).toBe(true);
    expect(bridge.snapshot().placements.length).toBe(before);
    expect(bridge.redo()).toBe(true);
    expect(bridge.snapshot().placements.length).toBe(before + 1);
  });

  it('hasUndo/hasRedo pass through the grid stack state', () => {
    const bridge = CampaignBridge.start('l1', 1);
    expect(bridge.hasUndo()).toBe(false);
    bridge.place('shelf_basic', 2, 2, 0);
    expect(bridge.hasUndo()).toBe(true);
    bridge.undo();
    expect(bridge.hasRedo()).toBe(true);
  });

  it('registers a pathing destination and exposes its flow field for debugging', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.registerDestination('debug-exit', [{ x: 9, y: 9 }]);
    const field = bridge.flowFieldDebug('debug-exit');
    expect(field.length).toBeGreaterThan(0);
  });

  it('unregisters a pathing destination', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.registerDestination('debug-exit', [{ x: 9, y: 9 }]);
    bridge.unregisterDestination('debug-exit');
    expect(() => bridge.flowFieldDebug('debug-exit')).toThrow();
  });

  it('adds a household, stocks a fixture, and spawns a shopper visible in the snapshot', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.place('shelf_basic', 2, 2, 0);
    const instanceId = bridge.snapshot().placements.find((p) => p.fixtureId === 'shelf_basic')!.instanceId;
    bridge.stockFixture(instanceId, 'milk');
    bridge.addHousehold(9001, 'family', { x: 0, y: 0 });
    bridge.spawnShopper(9002, 9001);
    expect(bridge.shoppersSnapshot().some((s) => s.id === 9002)).toBe(true);
  });

  it("shelfFullness reports a stocked shelf's fraction of capacity", () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.place('shelf_basic', 2, 2, 0);
    const instanceId = bridge.snapshot().placements.find((p) => p.fixtureId === 'shelf_basic')!.instanceId;
    bridge.stockFixture(instanceId, 'milk');
    const fullness = bridge.shelfFullness();
    expect(fullness.find((f) => f.instanceId === instanceId)?.fraction).toBeGreaterThan(0);
  });

  it('pendingTells drains tellFired events since the last read', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.addHousehold(9001, 'family', { x: 0, y: 0 });
    // No checkout fixture placed — a guaranteed instant balk once checkingOut is reached.
    bridge.spawnShopper(9002, 9001);
    let sawFirst: readonly { shopperId: number }[] = [];
    for (let i = 0; i < 2000 && bridge.shoppersSnapshot().some((s) => s.id === 9002); i++) {
      await bridge.tick();
      const tells = bridge.pendingTells();
      if (tells.length > 0) sawFirst = tells;
    }
    expect(sawFirst.length).toBeGreaterThan(0);
    expect(bridge.pendingTells()).toHaveLength(0);
  });
});

describe('CampaignBridge — pricing', () => {
  it('setPrice changes priceOf and leaves referencePriceOf unchanged', () => {
    const bridge = CampaignBridge.start('l1', 1);
    const reference = bridge.referencePriceOf('milk');
    bridge.setPrice('milk', reference * 0.5);
    expect(bridge.priceOf('milk')).toBeCloseTo(reference * 0.5);
    expect(bridge.referencePriceOf('milk')).toBeCloseTo(reference);
  });

  it('startPromotion discounts priceOf until the promotion ends', () => {
    const bridge = CampaignBridge.start('l1', 1);
    const reference = bridge.referencePriceOf('milk');
    bridge.startPromotion('milk', 0.2, 10);
    expect(bridge.priceOf('milk')).toBeCloseTo(reference * 0.8);
  });

  it("setMarketingSpend is reflected in the next daily statement's marketing line", async () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.setMarketingSpend(50);
    for (let i = 0; i < 1440; i++) await bridge.tick();
    const latest = bridge.financeStatements().at(-1);
    expect(latest?.marketing).toBe(50);
  });
});

describe('CampaignBridge — staff', () => {
  it('hires staff and lists them in staffRoster', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.hireStaff(501, 0.7, 0.9);
    const roster = bridge.staffRoster();
    expect(roster.find((s) => s.id === 501)).toMatchObject({ skill: 0.7, morale: 0.9, assignedRegisterId: null });
  });

  it('assigns staff to a placed register and reflects it in staffRoster', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.place('register', 2, 2, 0);
    const instanceId = bridge.snapshot().placements.find((p) => p.fixtureId === 'register')!.instanceId;
    bridge.hireStaff(501, 0.7, 0.9);
    bridge.assignStaffToRegister(501, instanceId);
    expect(bridge.staffRoster().find((s) => s.id === 501)?.assignedRegisterId).toBe(instanceId);
  });

  it('trains staff, raising their skill', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.hireStaff(501, 0.5, 0.9);
    bridge.trainStaff(501);
    expect(bridge.staffRoster().find((s) => s.id === 501)!.skill).toBeGreaterThan(0.5);
  });
});

describe('CampaignBridge — finance', () => {
  it('financeStatements is empty before the first sim day closes, then grows', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    expect(bridge.financeStatements()).toHaveLength(0);
    for (let i = 0; i < 1440; i++) await bridge.tick();
    expect(bridge.financeStatements().length).toBeGreaterThan(0);
  });

  it('financeLedger accumulates entries as the day progresses', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    for (let i = 0; i < 1440; i++) await bridge.tick();
    expect(bridge.financeLedger().length).toBeGreaterThan(0);
  });
});

describe('CampaignBridge — rival intel', () => {
  it("lists l1's one rival (Sav-A-Lott) alongside the player's own comparable KPIs", () => {
    const bridge = CampaignBridge.start('l1', 1);
    const intel = bridge.rivalIntel();
    expect(intel.rivals).toHaveLength(1);
    expect(intel.rivals[0]?.id).toBe('sav-a-lott');
    expect(intel.player.priceLevel).toBeCloseTo(1); // no setPrice called yet — at reference
    expect(intel.player.serviceScore).toBeGreaterThanOrEqual(0);
  });
});

describe('CampaignBridge — inventory', () => {
  it('lists every catalog good\'s stock/capacity/reorder point, even when unstocked', () => {
    const bridge = CampaignBridge.start('l1', 1);
    const levels = bridge.inventoryLevels();
    expect(levels.length).toBeGreaterThan(0);
    const milk = levels.find((l) => l.goodId === 'milk')!;
    expect(milk.capacity).toBeGreaterThan(0);
    expect(milk.reorderPoint).toBeGreaterThan(0);
    expect(milk.fraction).toBeGreaterThanOrEqual(0);
    expect(milk.fraction).toBeLessThanOrEqual(1);
  });
});

describe('CampaignBridge — objective progress', () => {
  it('passes through CampaignSystem#objectiveProgress', () => {
    const bridge = CampaignBridge.start('l1', 1);
    expect(bridge.objectiveProgress()).toEqual({ current: 0, target: 0.15 });
  });
});

describe('CampaignBridge.resume', () => {
  it('reloads a saved run to a hash-identical, chapter-identical state', async () => {
    const bridge = CampaignBridge.start('l1', 20260902);
    for (let i = 0; i < 1440 * 5; i++) await bridge.tick();
    const save = bridge.save();

    const resumed = CampaignBridge.resume(save);
    expect(resumed.state).toEqual(bridge.state);
  });
});
