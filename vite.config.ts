import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * The GAME build.
 *
 * Output goes to `dist/game`, which is what `capacitor.config.ts` points `webDir` at —
 * the iOS shell bundles exactly these files (PLAN.md §6.4).
 *
 * The landing page is a separate build (`vite.landing.config.ts`) on purpose: serving a
 * ~50 KB marketing page out of a multi-megabyte game bundle means search engines index
 * nothing and first paint takes seconds (PLAN.md §15).
 */
export default defineConfig({
  /**
   * Relative asset paths, so one bundle works in both places it has to live: served from
   * `/game/` on the web, and loaded from the `capacitor://` scheme inside the iOS shell.
   * An absolute base breaks the second case, and does it late — at the iOS milestone.
   */
  base: './',
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
  build: {
    outDir: 'dist/game',
    // The landing build already emptied dist/ and runs first. Emptying again here
    // would delete it.
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: true,
    // PLAN.md §10.1 — initial load budget is 3.5 MB gzipped. Warn well before that.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    // Needed to open the dev build on a physical phone on the same network,
    // which is how the phone-first rule actually gets checked.
    host: true,
  },
});
