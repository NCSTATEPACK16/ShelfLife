import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('./src/sim', import.meta.url)),
      '@platform': fileURLToPath(new URL('./src/platform', import.meta.url)),
      '@view': fileURLToPath(new URL('./src/view', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@bridge': fileURLToPath(new URL('./src/bridge', import.meta.url)),
      '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
    },
  },
  test: {
    // Default is node: the simulation must run headless, so it gets no DOM by default.
    // Files that need one opt in with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'tools/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // PLAN.md §11.1 — 80% in src/sim, un-negotiated. src/view gets smoke coverage only,
      // so it is excluded rather than dragging the number down and hiding a real gap.
      include: ['src/sim/**', 'src/platform/**'],
      exclude: ['**/__boundary_fixtures__/**', '**/index.ts'],
      thresholds: {
        'src/sim/**': { lines: 80, functions: 80, branches: 70, statements: 80 },
      },
    },
  },
});
