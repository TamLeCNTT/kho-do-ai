import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'copy-service-worker',
    closeBundle() {
      copyFileSync(resolve('service-worker.js'), resolve('dist/service-worker.js'));
    },
  }],
  build: { chunkSizeWarningLimit: 1200 },
});
