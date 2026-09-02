import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist/harness',
    emptyOutDir: true,
    rollupOptions: {
      input: { cli: 'tools/sim-harness/cli.ts' },
      output: { format: 'es', entryFileNames: '[name].js' },
    },
  },
});
