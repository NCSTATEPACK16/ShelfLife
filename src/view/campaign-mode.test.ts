// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore, setStore } from '../platform/storage/index.js';
import { mountCampaign } from './campaign-mode.js';

beforeEach(() => {
  setStore(new MemoryStore());
});

describe('mountCampaign', () => {
  it('returns null when the canvas cannot produce a rendering context', async () => {
    const canvas = document.createElement('canvas');
    // jsdom's default canvas has no real context — this exercises the same early-return
    // mountBuildMode always had.
    const uiRoot = document.createElement('div');
    const result = await mountCampaign(canvas, uiRoot);
    expect(result).toBeNull();
  });
});
