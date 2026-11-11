import { defineConfig } from 'vite';

// @horti/core is consumed as TypeScript source through the workspace link, so
// there is no build step between the simulation core and the viewer.
export default defineConfig({
  server: { port: 5193, strictPort: true },
  build: { target: 'es2023', chunkSizeWarningLimit: 1200 },
});
