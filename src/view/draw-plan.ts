import type { BuildModeSnapshot } from '../bridge/build-bridge.js';
import { colorForFixture, selectionColor } from './fixture-colors.js';
import { TILE_HEIGHT, TILE_WIDTH, worldToScreen } from './iso.js';

export interface DrawRect {
  readonly instanceId: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: number;
  readonly selected: boolean;
}

export interface DrawPlan {
  readonly gridLines: readonly { x1: number; y1: number; x2: number; y2: number }[];
  readonly fixtures: readonly DrawRect[];
}

export function buildDrawPlan(
  snapshot: BuildModeSnapshot,
  origin: { x: number; y: number },
  selectedInstanceId: number | null,
): DrawPlan {
  const { width, height } = snapshot.dimensions;
  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (let i = 0; i <= width; i++) {
    const a = worldToScreen(i, 0, origin);
    const b = worldToScreen(i, height, origin);
    gridLines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  for (let j = 0; j <= height; j++) {
    const a = worldToScreen(0, j, origin);
    const b = worldToScreen(width, j, origin);
    gridLines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  const catalogById = new Map(snapshot.catalog.map((def) => [def.id, def]));
  const fixtures: DrawRect[] = snapshot.placements.map((placement) => {
    const def = catalogById.get(placement.fixtureId);
    const footprintW = def?.footprint.width ?? 1;
    const footprintH = def?.footprint.height ?? 1;
    const screen = worldToScreen(placement.x, placement.y, origin);
    const selected = placement.instanceId === selectedInstanceId;
    return {
      instanceId: placement.instanceId,
      x: screen.x - (TILE_WIDTH / 2) * footprintH,
      y: screen.y,
      width: (footprintW + footprintH) * (TILE_WIDTH / 2),
      height: (footprintW + footprintH) * (TILE_HEIGHT / 2),
      color: selected ? selectionColor() : colorForFixture(placement.fixtureId),
      selected,
    };
  });

  return { gridLines, fixtures };
}
