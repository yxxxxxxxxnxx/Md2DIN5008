import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  optimizeDeps: {
    exclude: ['@myriaddreamin/typst.ts', '@myriaddreamin/typst-ts-web-compiler'],
  },
});
