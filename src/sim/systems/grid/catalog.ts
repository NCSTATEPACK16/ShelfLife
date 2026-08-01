import { z } from 'zod';
import catalogJson from '../../../../content/fixtures/catalog.json';
import type { FixtureDef } from './types.js';

const FootprintSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const FixtureDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  footprint: FootprintSchema,
  walkable: z.boolean(),
});

const CatalogSchema = z.array(FixtureDefSchema).min(1);

export function parseCatalog(raw: unknown): readonly FixtureDef[] {
  const parsed = CatalogSchema.parse(raw);
  const seen = new Set<string>();
  for (const def of parsed) {
    if (seen.has(def.id)) throw new Error(`Duplicate fixture id in catalog: ${def.id}`);
    seen.add(def.id);
  }
  return parsed;
}

export const DEFAULT_CATALOG: readonly FixtureDef[] = parseCatalog(catalogJson);
