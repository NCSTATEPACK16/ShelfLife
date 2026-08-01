import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../../content/balance/pathing.json5?raw';

const PathingConfigSchema = z.object({
  maxSpeed: z.number().positive(),
  separationRadius: z.number().positive(),
  separationWeight: z.number().nonnegative(),
  arrivalRadius: z.number().positive(),
});

export type PathingConfig = z.infer<typeof PathingConfigSchema>;

export function parsePathingConfig(raw: unknown): PathingConfig {
  return PathingConfigSchema.parse(raw);
}

export const DEFAULT_PATHING_CONFIG: PathingConfig = parsePathingConfig(JSON5.parse(raw));
