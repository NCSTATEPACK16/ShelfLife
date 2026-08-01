export type Rotation = 0 | 90 | 180 | 270;

export interface Footprint {
  readonly width: number;
  readonly height: number;
}

export interface FixtureDef {
  readonly id: string;
  readonly name: string;
  readonly footprint: Footprint;
  readonly walkable: boolean;
}

export interface Placement {
  readonly instanceId: number;
  readonly fixtureId: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
}

export interface GridDimensions {
  readonly width: number;
  readonly height: number;
}
