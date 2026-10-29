import { defineConfig } from 'vitest/config';
import path from 'path';

// Une seule instance de React : celle de ce dossier (le code testé vit dans ../src).
const nm = (p) => path.resolve(__dirname, 'node_modules', p);
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [
      { find: /^react$/, replacement: nm('react') },
      { find: /^react\/jsx-runtime$/, replacement: nm('react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: nm('react/jsx-dev-runtime') },
      { find: /^react-dom$/, replacement: nm('react-dom') },
      { find: /^react-dom\/client$/, replacement: nm('react-dom/client') },
    ],
  },
  server: { fs: { allow: [path.resolve(__dirname, '..')] } },
  test: { environment: 'jsdom', globals: false, include: ['*.test.jsx', '*.test.js', '*.test.ts'], restoreMocks: false },
});
