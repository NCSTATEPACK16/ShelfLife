import { describe, expect, it } from 'vitest';
import { buildCampaignWorld, loadCampaignWorld, migrateSaveEnvelope } from './campaignWorld.js';

describe('buildCampaignWorld', () => {
  it('registers every system including campaign, in the canonical order', () => {
    const { world } = buildCampaignWorld('l1', 1);
    expect(world.systemNames).toEqual([
      'grid',
      'pathing',
      'inventory',
      'checkout',
      'economy',
      'rivals',
      'market',
      'shoppers',
      'loyalty',
      'reputation',
      'campaign',
    ]);
  });

  it('returns every registered system, not just world and campaign', () => {
    const handle = buildCampaignWorld('l1', 1);
    expect(handle.grid).toBeDefined();
    expect(handle.pathing).toBeDefined();
    expect(handle.inventory).toBeDefined();
    expect(handle.checkout).toBeDefined();
    expect(handle.economy).toBeDefined();
    expect(handle.rivals).toBeDefined();
    expect(handle.market).toBeDefined();
    expect(handle.shoppers).toBeDefined();
  });

  it('generates the configured household count', () => {
    const { world } = buildCampaignWorld('l1', 1);
    world.step();
    // l1's content authors householdCount: 24 (Task 6).
    expect(world.commands.log.filter((c) => c.command.type === 'addHousehold')).toHaveLength(24);
  });

  it('is deterministic: same seed produces the same household placements', () => {
    const a = buildCampaignWorld('l1', 42);
    const b = buildCampaignWorld('l1', 42);
    a.world.step();
    b.world.step();
    expect(a.world.commands.log).toEqual(b.world.commands.log);
  });

  it('varies household placement with the seed', () => {
    const a = buildCampaignWorld('l1', 1);
    const b = buildCampaignWorld('l1', 2);
    a.world.step();
    b.world.step();
    expect(a.world.commands.log).not.toEqual(b.world.commands.log);
  });

  it('the campaign system carries the requested level', () => {
    const { campaign } = buildCampaignWorld('l2', 1);
    expect(campaign.level.id).toBe('l2');
  });
});

describe('loadCampaignWorld', () => {
  it('replays a save to a hash-identical world, without doubling starting-store commands', () => {
    const live = buildCampaignWorld('l1', 20260902);
    for (let i = 0; i < 1440 * 5; i++) live.world.step();

    const save = {
      version: 1 as const,
      levelId: 'l1',
      seed: live.world.seed,
      tick: live.world.tick,
      commandLog: live.world.commands.log,
    };
    const loaded = loadCampaignWorld(save);
    expect(loaded.world.hash).toBe(live.world.hash);
    expect(loaded.world.tick).toBe(live.world.tick);

    // Confirm no doubling directly: exactly one placeFixture per fixture in the recipe.
    const placeCount = loaded.world.commands.log.filter((c) => c.command.type === 'placeFixture').length;
    expect(placeCount).toBe(4); // BASELINE_STORE places 4 fixtures (Task 7)
  });
});

describe('migrateSaveEnvelope', () => {
  it('accepts a well-formed v1 envelope', () => {
    const envelope = { version: 1, levelId: 'l1', seed: 1, tick: 0, commandLog: [] };
    expect(migrateSaveEnvelope(envelope)).toEqual(envelope);
  });

  it('rejects an envelope with an unknown version', () => {
    expect(() => migrateSaveEnvelope({ version: 2, levelId: 'l1', seed: 1, tick: 0, commandLog: [] })).toThrow();
  });

  it('rejects a malformed envelope', () => {
    expect(() => migrateSaveEnvelope({ levelId: 'l1' })).toThrow();
  });
});
