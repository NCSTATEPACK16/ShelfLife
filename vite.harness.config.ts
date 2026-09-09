import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist/harness',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        cli: 'tools/sim-harness/cli.ts',
        gate: 'tools/sim-harness/gate.ts',
        sweepWorker: 'tools/sim-harness/sweep-worker.ts',
      },
      output: { format: 'es', entryFileNames: '[name].js' },
    },
  },
});
