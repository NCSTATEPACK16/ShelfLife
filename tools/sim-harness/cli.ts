import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { STRATEGY_NAMES, type StrategyName } from './strategies/index.js';
import { sweep, type LevelStrategyResult } from './sweep.js';

const DEFAULT_BASE_SEED = 20260901;

export interface CliArgs {
  readonly level: number;
  readonly strategy: StrategyName;
  readonly runs: number;
  readonly days: number;
  readonly seed: number;
  readonly out: 'csv' | 'json';
  readonly outFile: string | null;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  let level: number | null = null;
  let strategy: StrategyName | null = null;
  let runs = 100;
  let days = 90;
  let seed = DEFAULT_BASE_SEED;
  let out: 'csv' | 'json' = 'csv';
  let outFile: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = (): string => {
      i++;
      const value = argv[i];
      if (value === undefined) throw new Error(`${flag} requires a value`);
      return value;
    };

    switch (flag) {
      case '--level':
        level = Number(next());
        break;
      case '--strategy': {
        const value = next();
        if (!(STRATEGY_NAMES as readonly string[]).includes(value)) {
          throw new Error(`Unknown strategy: ${value}`);
        }
        strategy = value as StrategyName;
        break;
      }
      case '--runs':
        runs = Number(next());
        break;
      case '--days':
        days = Number(next());
        break;
      case '--seed':
        seed = Number(next());
        break;
      case '--out': {
        const value = next();
        if (value !== 'csv' && value !== 'json') throw new Error(`--out must be csv or json, got ${value}`);
        out = value;
        break;
      }
      case '--out-file':
        outFile = next();
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (level === null) throw new Error('--level is required');
  if (strategy === null) throw new Error('--strategy is required');
  return { level, strategy, runs, days, seed, out, outFile };
}

export function formatCsv(result: LevelStrategyResult): string {
  const header = 'seed,won,daysToWin,totalEbitda';
  const rows = result.runs.map(
    (r) => `${r.seed},${r.won},${r.daysToWin ?? ''},${r.totalEbitda.toFixed(2)}`,
  );
  const summary = [
    '',
    `# level=${result.level} strategy=${result.strategy}`,
    `# winRate=${result.winRate.toFixed(3)}`,
    `# medianDaysToWin=${result.medianDaysToWin ?? 'n/a'}`,
    `# ebitdaMean=${result.ebitda.mean.toFixed(2)} p10=${result.ebitda.p10.toFixed(2)} p50=${result.ebitda.p50.toFixed(2)} p90=${result.ebitda.p90.toFixed(2)}`,
  ];
  return [header, ...rows, ...summary].join('\n');
}

export function formatJson(result: LevelStrategyResult): string {
  return JSON.stringify(result, null, 2);
}

export function main(argv: readonly string[]): void {
  const args = parseArgs(argv);
  const result = sweep(args.level, args.strategy, args.runs, args.days, args.seed);
  const output = args.out === 'csv' ? formatCsv(result) : formatJson(result);
  if (args.outFile) writeFileSync(args.outFile, output);
  else console.log(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
