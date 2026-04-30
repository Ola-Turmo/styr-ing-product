# Styr.ing Board Portal

Norwegian governance SaaS — board portal, compliance calendar, and internal control for SMB and mid-market boards.

**Stack:** Astro 4 (SSR), SurrealDB Cloud, Cloudflare Workers/Pages
**Pricing:** 2,490 NOK/board/month
**Pilot policy:** Free first 3 boards until 2026-06-30

## Development

```bash
npm install
npm run dev      # local dev at localhost:4321
npm run build    # production build
```

## Deployment

### Prerequisites
1. `wrangler login` — Cloudflare OAuth (https://dash.cloudflare.com)
2. SurrealDB Cloud credentials — see `.env.example`
3. GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SURREALDB_*`

### GitHub Actions (recommended)
Push to `main` → workflow at `.github/workflows/deploy.yml` auto-deploys to Cloudflare Pages.

### Manual deploy
```bash
npm install
npm run build
wrangler pages deploy dist
```

## Pages
- `/board` — Board portal: boards, members, meetings
- `/compliance` — Compliance calendar and deadlines
- `/internkontroll` — Internal control register

## Architecture
- `src/lib/db.ts` — SurrealDB REST client + demo data fallback
- `src/pages/` — Astro SSR pages
- `src/layouts/` — Shared layout

## STY Issues
- STY-33 (schema/API) — DONE
- STY-34 (product app) — DONE
- STY-35 (deploy + outreach) — in progress
- STY-38 (SurrealDB provisioning) — credentials in `.env.example`
