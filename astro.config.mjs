// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  outDir: './docs',
  build: {
    assetsPrefix: '.',
    inlineStylesheets: 'always'
  },
  // base: './',
  trailingSlash: 'always',
});
// https://astro.build/config

