import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(process.cwd(), 'site'),
  publicDir: 'public',
  build: {
    outDir: resolve(process.cwd(), 'dist/site'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(process.cwd(), 'site/index.html'),
        demo: resolve(process.cwd(), 'site/demo/index.html'),
        privacy: resolve(process.cwd(), 'site/privacy/index.html'),
        terms: resolve(process.cwd(), 'site/terms/index.html'),
        notFound: resolve(process.cwd(), 'site/404.html')
      }
    }
  }
});
