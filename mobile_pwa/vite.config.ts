import { defineConfig } from 'vite';
import { resolve } from 'node:path';
const base = process.env.PWA_BASE || '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('PWA_BASE must be / or /repository/');
export default defineConfig({
  base,
  build: { modulePreload: { polyfill: false }, rollupOptions: { input: resolve(import.meta.dirname, 'index.html') } },
  server: { fs: { strict: true } },
});
