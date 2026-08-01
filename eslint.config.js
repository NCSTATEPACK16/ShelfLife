import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * The two boundary rules this project depends on. See docs/adr/0002.
 *
 *   1. The sim boundary   — src/sim/** touches no platform API and no wall-clock/entropy source.
 *   2. The platform boundary — raw pointer events live only in src/platform/input/**.
 *
 * These are not style preferences. Breaking #1 silently breaks the iOS port, the balance
 * harness, and server-side leaderboard verification all at once. Breaking #2 produces a
 * game that works on a laptop and is unusable on a phone.
 */

/** Packages `src/sim` may never import. */
const PLATFORM_PACKAGES = [
  { name: 'phaser', message: 'The sim never touches the renderer. Emit a snapshot; let src/view read it.' },
  { name: 'preact', message: 'The sim never touches the UI layer.' },
  { name: '@preact/signals', message: 'The sim never touches the UI layer.' },
  { name: 'howler', message: 'The sim never plays audio. Emit an event; let src/view play it.' },
  { name: 'idb-keyval', message: 'The sim never persists anything. Go through src/platform/storage.' },
  { name: '@supabase/supabase-js', message: 'The sim must compile in a Deno edge function with no network deps.' },
  { name: 'comlink', message: 'Worker plumbing belongs in src/bridge.' },
];

/** Package name prefixes `src/sim` may never import. */
const PLATFORM_PATTERNS = [
  { group: ['@capacitor/*'], message: 'The sim is platform-agnostic. Native APIs belong in src/platform.' },
  { group: ['@view/*', '@ui/*', '@bridge/*'], message: 'The sim is the bottom layer. It does not import upward.' },
];

/** Globals that make a simulation non-deterministic or non-portable. */
const PLATFORM_GLOBALS = [
  { name: 'window', message: 'No DOM in the sim. It must run headless in Node and Deno.' },
  { name: 'document', message: 'No DOM in the sim. It must run headless in Node and Deno.' },
  { name: 'navigator', message: 'No platform detection in the sim.' },
  { name: 'localStorage', message: 'No persistence in the sim. Go through src/platform/storage.' },
  { name: 'sessionStorage', message: 'No persistence in the sim.' },
  { name: 'fetch', message: 'The sim performs no I/O.' },
  { name: 'requestAnimationFrame', message: 'The sim runs on a fixed 10 Hz tick, not on frames.' },
];

/**
 * Determinism killers (PLAN.md §6.3). The world hash must be reproducible across
 * machines, runs, and — for leaderboard verification — between a phone and a server.
 */
const NONDETERMINISM = [
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'Math.random() breaks determinism. Use an injected RNG stream (PLAN.md §6.3).',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Date.now() breaks determinism. Use the sim clock.',
  },
  {
    selector: "NewExpression[callee.name='Date']",
    message: 'new Date() breaks determinism. Use the sim clock.',
  },
  {
    selector: "MemberExpression[object.name='performance'][property.name='now']",
    message: 'performance.now() breaks determinism. Use the sim clock.',
  },
];

/** Raw input events. Allowed only inside src/platform/input. */
const RAW_INPUT = [
  {
    selector:
      "CallExpression[callee.property.name=/^(add|remove)EventListener$/][arguments.0.value=/^(pointer|mouse|touch|wheel|gesture)/i]",
    message:
      'Raw input events belong only in src/platform/input. Consume semantic intents (tap, drag, pinch, longpress) instead — see docs/adr/0002.',
  },
  {
    selector: "AssignmentExpression[left.property.name=/^on(pointer|mouse|touch|wheel)/i]",
    message: 'Raw input handlers belong only in src/platform/input. Consume semantic intents instead.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'ios/**',
      'coverage/**',
      'assets/placeholder/**',
      'assets/atlases/**',
      // Deliberately-broken files that exist to be linted by tests/boundaries.
      // The test re-lints them with `ignore: false`.
      '**/__boundary_fixtures__/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  /* ── Baseline for all TypeScript ───────────────────────────────────────── */
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  /* ── RULE 2: the platform boundary ─────────────────────────────────────── */
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/platform/input/**'],
    rules: {
      'no-restricted-syntax': ['error', ...RAW_INPUT],
    },
  },

  /* ── RULE 1: the sim boundary ───────────────────────────────────────────
     MUST come after the platform-boundary block. Flat config is last-wins per
     rule, not merge-per-rule: an earlier `no-restricted-syntax` is replaced
     wholesale, not combined. Listing NONDETERMINISM alone here previously
     silently disabled every determinism check inside src/sim — which is why
     tests/boundaries exists. Both selector sets are spread in deliberately. */
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: PLATFORM_PACKAGES, patterns: PLATFORM_PATTERNS }],
      'no-restricted-globals': ['error', ...PLATFORM_GLOBALS],
      'no-restricted-syntax': ['error', ...NONDETERMINISM, ...RAW_INPUT],
      // The sim is the most-tested code in the project; it gets the strictest bar.
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-console': 'error',
    },
  },

  /* ── The bridge is the only thing allowed to reach both ways ───────────── */
  {
    files: ['src/bridge/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  /* ── Tests and tools: relaxed, but the sim's determinism rules still apply
        to anything that drives the sim, because a test that uses Math.random
        cannot be a golden test. ────────────────────────────────────────────── */
  {
    files: ['**/*.test.ts', 'tests/**/*.ts', 'tools/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    files: ['tests/golden/**/*.ts', 'tools/sim-harness/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NONDETERMINISM],
    },
  },

  /* ── Config files ──────────────────────────────────────────────────────── */
  {
    files: ['*.config.{ts,js}', 'landing/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
