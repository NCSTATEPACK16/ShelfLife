import type { GridDimensions } from '../grid/types.js';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** Matches `BuildGrid#isWalkable`'s signature without importing `BuildGrid` itself. */
export type Walkable = (x: number, y: number) => boolean;

export interface FlowField {
  readonly dimensions: GridDimensions;
  /** BFS distance in cells from the nearest destination cell, or -1 if unreachable. */
  distanceAt(x: number, y: number): number;
  /** Direction toward the destination; {x:0,y:0} at the destination or if unreachable. */
  directionAt(x: number, y: number): Vec2;
}
