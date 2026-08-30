import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: ['es2022', 'safari15'],
    cssMinify: 'lightningcss',
    sourcemap: true
  }
});
