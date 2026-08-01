import { defineConfig } from 'vite';

/**
 * The LANDING PAGE build (PLAN.md §15).
 *
 * Static, SEO-indexable, and small. Kept entirely separate from the game bundle.
 * Both outputs deploy together from `dist/` — see `netlify.toml`.
 */
export default defineConfig({
  root: 'landing',
  publicDir: false,
  build: {
    // The landing page IS the site root; the game is a subdirectory of it.
    // This build runs first (see package.json), so emptying dist is safe here
    // and must NOT be done by the game build afterwards.
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    // The landing page has a hard budget: it is the first thing anyone sees.
    chunkSizeWarningLimit: 100,
  },
  server: {
    port: 5174,
    host: true,
  },
});
