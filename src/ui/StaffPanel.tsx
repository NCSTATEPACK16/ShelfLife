import type { StaffMember } from '../sim/index.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface StaffPanelProps {
  readonly roster: readonly StaffMember[];
  readonly openRegisterIds: readonly number[];
  readonly breakpoint: Breakpoint;
  readonly onHire: () => void;
  readonly onAssign: (staffId: number, instanceId: number) => void;
  readonly onTrain: (staffId: number) => void;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function StaffPanel(props: StaffPanelProps): preact.JSX.Element {
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3)'
      : 'display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);padding:var(--space-4)';
  const avgSkill = average(props.roster.map((s) => s.skill));
  const avgMorale = average(props.roster.map((s) => s.morale));

  return (
    <div style={containerStyle} data-testid="staff-panel">
      <button type="button" data-testid="staff-hire" style="min-width:44px;min-height:44px" onClick={props.onHire}>
        Hire
      </button>
      {props.roster.map((staff) => (
        <div key={staff.id} data-testid={`staff-row-${staff.id}`} style="display:flex;align-items:center;gap:var(--space-2)">
          <span>Staff #{staff.id}</span>
          <span class="num">
            skill {staff.skill.toFixed(2)} <span style="color:var(--ink-faint)">(avg {avgSkill.toFixed(2)})</span>
          </span>
          <span class="num">
            morale {staff.morale.toFixed(2)} <span style="color:var(--ink-faint)">(avg {avgMorale.toFixed(2)})</span>
          </span>
          <button
            type="button"
            data-testid={`staff-row-${staff.id}-train`}
            style="min-width:44px;min-height:44px"
            onClick={() => props.onTrain(staff.id)}
          >
            Train
          </button>
          <select
            data-testid={`staff-row-${staff.id}-assign`}
            value={staff.assignedRegisterId ?? ''}
            onChange={(e) => {
              const value = (e.target as HTMLSelectElement).value;
              if (value) props.onAssign(staff.id, Number(value));
            }}
          >
            <option value="">Unassigned</option>
            {props.openRegisterIds.map((id) => (
              <option key={id} value={id}>
                Register {id}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
