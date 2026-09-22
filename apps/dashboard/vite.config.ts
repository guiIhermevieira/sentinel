import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  resolve: {
    alias: {
      '@sentinel-aml/rules-core': fileURLToPath(new URL('../../packages/rules-core/src/index.ts', import.meta.url)),
    },
  },
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  test: { include: ['test/**/*.test.ts'] },
}));
