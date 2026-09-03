// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { StaffPanel } from './StaffPanel.js';
import type { StaffMember } from '../sim/index.js';

const roster: StaffMember[] = [
  { id: 1, skill: 0.5, morale: 0.9, assignedRegisterId: null },
  { id: 2, skill: 0.8, morale: 0.6, assignedRegisterId: 42 },
];

describe('StaffPanel', () => {
  it('lists every staff member with skill/morale shown against the roster average', () => {
    const root = document.createElement('div');
    render(
      <StaffPanel roster={roster} openRegisterIds={[42, 43]} breakpoint="compact" onHire={() => {}} onAssign={() => {}} onTrain={() => {}} />,
      root,
    );
    expect(root.querySelectorAll('div[data-testid^="staff-row-"]').length).toBe(2);
    expect(root.textContent).toMatch(/avg|average/i);
  });

  it('Hire calls onHire', () => {
    const root = document.createElement('div');
    let hired = false;
    render(
      <StaffPanel
        roster={[]}
        openRegisterIds={[]}
        breakpoint="compact"
        onHire={() => {
          hired = true;
        }}
        onAssign={() => {}}
        onTrain={() => {}}
      />,
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-testid="staff-hire"]')!.click();
    expect(hired).toBe(true);
  });

  it('Train calls onTrain with that staff id', () => {
    const root = document.createElement('div');
    let trained: number | null = null;
    render(
      <StaffPanel
        roster={roster}
        openRegisterIds={[]}
        breakpoint="compact"
        onHire={() => {}}
        onAssign={() => {}}
        onTrain={(id) => {
          trained = id;
        }}
      />,
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-testid="staff-row-1-train"]')!.click();
    expect(trained).toBe(1);
  });

  it('an unassigned staff member can be assigned to an open register', () => {
    const root = document.createElement('div');
    let assigned: [number, number] | null = null;
    render(
      <StaffPanel
        roster={roster}
        openRegisterIds={[42, 43]}
        breakpoint="compact"
        onHire={() => {}}
        onAssign={(s, r) => {
          assigned = [s, r];
        }}
        onTrain={() => {}}
      />,
      root,
    );
    const select = root.querySelector<HTMLSelectElement>('[data-testid="staff-row-1-assign"]')!;
    select.value = '43';
    select.dispatchEvent(new Event('change'));
    expect(assigned).toEqual([1, 43]);
  });
});
