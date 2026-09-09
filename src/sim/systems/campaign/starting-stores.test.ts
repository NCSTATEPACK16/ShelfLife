import { describe, expect, it } from 'vitest';
import { STARTING_STORES } from './starting-stores.js';

describe('STARTING_STORES', () => {
  it('has a recipe for l1, l2, and l3', () => {
    for (const id of ['l1', 'l2', 'l3']) {
      expect(STARTING_STORES.get(id), `missing starting store for ${id}`).toBeDefined();
    }
  });

  it('every recipe stocks at least one shelf and staffs its register', () => {
    for (const [id, commands] of STARTING_STORES) {
      const hasStockedShelf = commands.some((c) => c.type === 'stockFixture');
      const hasStaffedRegister = commands.some((c) => c.type === 'assignStaffToRegister');
      expect(hasStockedShelf, `${id} has no stockFixture command`).toBe(true);
      expect(hasStaffedRegister, `${id} has no assignStaffToRegister command`).toBe(true);
    }
  });
});
