import { defineConfig } from 'astro/config';

// Cloudflare Pages build. Static pages remain fast while Pages Functions expose
// the production-ready D1 contract when a DB binding is configured.
export default defineConfig({
  output: 'static',
  site: 'https://styr.ing',
  build: {
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
  image: {
    service: { entrypoint: 'astro/assets/services/noop' },
  },
});
