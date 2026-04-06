// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  outDir: './doc',
  build: {
    assetsPrefix: '.',
    inlineStylesheets: 'always'
  },
  // base: './',
  trailingSlash: 'always',
});
// https://astro.build/config

