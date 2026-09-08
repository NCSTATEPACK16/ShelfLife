import worldAtlasData from '../../assets/atlases/world.json';

export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const FRAMES = new Map<string, FrameRect>(
  worldAtlasData.textures[0]!.frames.map((f) => [f.filename, f.frame]),
);

/** Full atlas sheet size, needed to scale `background-size`/`background-position` together. */
export const WORLD_ATLAS_SIZE = worldAtlasData.textures[0]!.size;

/**
 * Looks up a TexturePacker frame rect by name in the world atlas — a pure, Phaser-free
 * read so it's safe to call from the DOM/Preact UI layer, not just `BuildScene`.
 */
export function getWorldFrameRect(frameName: string): FrameRect | null {
  return FRAMES.get(frameName) ?? null;
}
