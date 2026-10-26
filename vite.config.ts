import { defineConfig } from 'vite';

export default defineConfig({
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // Phaser is most of the download and never changes between our deploys: in its own chunk
    // it stays in the browser's cache while the game's own code updates.
    chunkSizeWarningLimit: 1400,
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }] } } },
  },
});
