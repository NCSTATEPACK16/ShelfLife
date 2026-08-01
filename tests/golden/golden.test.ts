import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formatHash } from '../../src/sim/index.js';
import { runScenario, SCENARIOS } from './scenarios.js';

/**
 * Golden sim tests (PLAN.md §11.2).
 *
 * The recorded world-hash sequences are the project's tripwire. Any unintended change
 * in simulation behaviour fails here loudly, instead of quietly shifting every balance
 * number and invalidating results nobody re-ran.
 *
 * To re-baseline deliberately:  UPDATE_GOLDEN=1 npm test
 * Do that in its own commit, explaining exactly what behaviour changed and why.
 */

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_FILE = join(here, 'hashes.json');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

type GoldenFile = Record<string, { seed: number; ticks: number; sampleEvery: number; hashes: string[] }>;

function loadGolden(): GoldenFile {
  if (!existsSync(GOLDEN_FILE)) return {};
  return JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) as GoldenFile;
}

const golden = loadGolden();
const recorded: GoldenFile = {};

describe('golden sim hashes', () => {
  /**
   * Written in afterAll rather than per-test so a failure partway through cannot leave
   * a half-written baseline. (A process 'exit' hook does not fire reliably inside
   * Vitest's worker pool.)
   */
  afterAll(() => {
    if (!UPDATE) return;
    const ordered: GoldenFile = {};
    for (const s of SCENARIOS) {
      const entry = recorded[s.name];
      if (entry) ordered[s.name] = entry;
    }
    writeFileSync(GOLDEN_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
    console.warn(`\nGolden hashes re-baselined: ${GOLDEN_FILE}`);
  });

  for (const scenario of SCENARIOS) {
    it(`${scenario.name} matches its recorded hash sequence`, () => {
      const hashes = runScenario(scenario).map(formatHash);
      recorded[scenario.name] = {
        seed: scenario.seed,
        ticks: scenario.ticks,
        sampleEvery: scenario.sampleEvery,
        hashes,
      };

      if (UPDATE) return;

      const expected = golden[scenario.name];
      expect(
        expected,
        `No golden baseline for "${scenario.name}". Record one with UPDATE_GOLDEN=1 npm test`,
      ).toBeDefined();

      // Check the recipe itself first: if the scenario definition drifted, a hash
      // mismatch would be misleading.
      expect(expected?.seed, 'scenario seed changed').toBe(scenario.seed);
      expect(expected?.ticks, 'scenario tick count changed').toBe(scenario.ticks);

      expect(hashes, `${scenario.name}: simulation behaviour changed`).toEqual(expected?.hashes);
    });
  }

  it('is reproducible within a single process', () => {
    for (const scenario of SCENARIOS) {
      expect(runScenario(scenario), `${scenario.name} is not reproducible`).toEqual(
        runScenario(scenario),
      );
    }
  });

  it('produces a different sequence when the seed changes', () => {
    const base = SCENARIOS[0];
    expect(base).toBeDefined();
    if (!base) return;

    const shifted = { ...base, seed: base.seed + 1, build: () => base.build() };
    // Same recipe, different seed object — confirm the recipe actually reads its seed.
    expect(runScenario({ ...shifted, build: base.build.bind(shifted) })).not.toEqual(
      runScenario(base),
    );
  });
});

