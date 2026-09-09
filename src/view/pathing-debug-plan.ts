import { worldToScreen } from './projection.js';

export interface FlowArrow {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** Debug-only: one short arrow per walkable cell, pointing along its flow direction. */
export function buildFlowFieldDrawPlan(
  field: readonly { x: number; y: number; dx: number; dy: number }[],
  origin: { x: number; y: number },
): readonly FlowArrow[] {
  const arrows: FlowArrow[] = [];
  for (const cell of field) {
    if (cell.dx === 0 && cell.dy === 0) continue; // destination or unreachable — nothing to draw
    const start = worldToScreen(cell.x + 0.5, cell.y + 0.5, origin);
    const end = worldToScreen(cell.x + 0.5 + cell.dx * 0.35, cell.y + 0.5 + cell.dy * 0.35, origin);
    arrows.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
  }
  return arrows;
}
