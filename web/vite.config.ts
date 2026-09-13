import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this app at https://<user>.github.io/AlumorPricing/, not at the
  // domain root, so every asset URL needs this prefix. Kept unconditional (rather than
  // dev-only root) so `npm run preview` — the local check before deploying — actually
  // matches what gets served in production; local dev just lives at this same subpath now.
  base: '/AlumorPricing/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
});
