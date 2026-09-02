import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('harness CLI (integration)', () => {
  it(
    'builds and runs a short sweep end to end',
    () => {
      execFileSync('npx', ['vite', 'build', '--config', 'vite.harness.config.ts'], { stdio: 'pipe' });
      const output = execFileSync(
        'node',
        ['dist/harness/cli.js', '--level', '1', '--strategy', 'do-nothing', '--runs', '3', '--days', '5'],
        { encoding: 'utf-8' },
      );
      expect(output).toContain('seed,won,daysToWin,totalEbitda');
      expect(output).toContain('winRate=');
      const rows = output.split('\n').filter((line) => /^\d+,(true|false),/.test(line));
      expect(rows).toHaveLength(3);
    },
    30_000,
  );
});
