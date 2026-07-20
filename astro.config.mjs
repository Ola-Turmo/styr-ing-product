import { defineConfig } from 'astro/config';

// Static demo build for Cloudflare Pages.
// No SSR, database bindings, or production auth flows are enabled here.
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
