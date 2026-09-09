import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('harness CLI (integration)', () => {
  it(
    'builds and runs a short sweep end to end',
    () => {
      // `execFileSync` resolves a bare command against PATHEXT itself only with `shell:
      // true` on Windows — spawnSync('npx', ...) otherwise throws ENOENT there, since
      // Windows' npx is actually `npx.cmd`.
      execFileSync('npx', ['vite', 'build', '--config', 'vite.harness.config.ts'], {
        stdio: 'pipe',
        shell: process.platform === 'win32',
      });
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
