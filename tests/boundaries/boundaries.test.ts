import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * The boundary rules are the load-bearing constraint of this project (docs/adr/0002).
 * A lint rule nobody tests is a lint rule that silently stops working — so these tests
 * lint deliberately-broken fixtures and assert that each rule actually fires.
 *
 * `ignore: false` is required because the fixtures are globally ignored so that
 * `npm run lint` stays green.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const eslint = new ESLint({ cwd: root, ignore: false });

async function messagesFor(relPath: string): Promise<string[]> {
  const [result] = await eslint.lintFiles([resolve(root, relPath)]);
  if (!result) throw new Error(`ESLint returned no result for ${relPath}`);
  return result.messages.map((m) => `${m.ruleId ?? 'unknown'}: ${m.message}`);
}

describe('rule 1 — the sim boundary', () => {
  const fixture = 'src/sim/__boundary_fixtures__/violates-sim-boundary.fixture.ts';

  // Longer timeout: this is the first ESLint call in the suite, so it pays for the
  // one-time flat-config + TS-parser cold start. That cold start is slow enough on
  // windows-latest CI runners to blow past vitest's default 5000ms. Every later call
  // in this file reuses the already-initialized ESLint instance and stays well under it.
  it(
    'blocks platform package imports',
    async () => {
      const msgs = await messagesFor(fixture);
      const restricted = msgs.filter((m) => m.startsWith('no-restricted-imports'));

      expect(restricted).toHaveLength(2);
      expect(restricted.join('\n')).toMatch(/persists anything/);
      expect(restricted.join('\n')).toMatch(/UI layer/);
    },
    15000,
  );

  it('blocks DOM and platform globals', async () => {
    const msgs = await messagesFor(fixture);
    const globals = msgs.filter((m) => m.startsWith('no-restricted-globals'));

    // window, document
    expect(globals.length).toBeGreaterThanOrEqual(2);
    expect(globals.join('\n')).toMatch(/headless in Node and Deno/);
  });

  it('blocks every determinism killer', async () => {
    const msgs = await messagesFor(fixture);
    const joined = msgs.join('\n');

    expect(joined).toMatch(/Math\.random\(\) breaks determinism/);
    expect(joined).toMatch(/Date\.now\(\) breaks determinism/);
    expect(joined).toMatch(/new Date\(\) breaks determinism/);
    expect(joined).toMatch(/performance\.now\(\) breaks determinism/);
  });
});

describe('rule 2 — the platform input boundary', () => {
  const fixture = 'src/ui/__boundary_fixtures__/violates-platform-boundary.fixture.ts';

  it('blocks raw pointer, mouse, touch, and wheel listeners', async () => {
    const msgs = await messagesFor(fixture);
    const raw = msgs.filter((m) => /semantic intents/.test(m));

    // 4 addEventListener calls + 2 handler assignments
    expect(raw).toHaveLength(6);
  });

  it('permits raw events inside src/platform/input', async () => {
    // The real listener module lives here and must lint clean.
    const msgs = await messagesFor('src/platform/input/pointer-source.ts');
    expect(msgs.filter((m) => /semantic intents/.test(m))).toHaveLength(0);
  });
});

describe('the rules apply to real source, not just fixtures', () => {
  it('lints the whole project clean', async () => {
    const results = await new ESLint({ cwd: root }).lintFiles(['src', 'tests']);
    const problems = results.flatMap((r) =>
      r.messages.map((m) => `${r.filePath.replace(root, '')}:${m.line} ${m.ruleId ?? ''} ${m.message}`),
    );
    expect(problems).toEqual([]);
  });
});
