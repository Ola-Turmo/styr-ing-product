import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Switch output mode per environment:
// - 'server' + cloudflare adapter = Cloudflare Workers SSR
// - 'static' = Cloudflare Pages static hosting
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
