import { defineConfig } from 'astro/config';

// Static mode — no SSR, no Workers, no D1 dependency.
// Deploy: Cloudflare Pages (static hosting) or GitHub Pages.
// All data uses demo fallbacks. Auth is client-side stub.
export default defineConfig({
  output: 'static',
  site: 'https://styr.ing',
  image: {
    service: { entrypoint: 'astro/assets/services/noop' },
  },
});