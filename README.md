# Styr.ing Board Portal

Norwegian governance concept demo — board portal, deadline tracking, and internal-control workflows for SMB and mid-market boards.

**Stack:** Astro 4 static output, deployed on Cloudflare Pages
**Offer status:** No separate active Styr.ing offer, public price, self-service account, or checkout. Samsvarlig is the active front door for the frozen control-cycle offer.
**Commercial policy:** Any later Styr.ing scope, onboarding, functionality, data processing, and price require a separate documented order or customer agreement.

## Development

```bash
npm install
npm run dev      # local dev at localhost:4321
npm run build    # production build
```

## Deployment

### Prerequisites
1. `wrangler login` — Cloudflare OAuth (https://dash.cloudflare.com)
2. GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

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
- `src/lib/db.ts` — dormant D1 helpers plus the static illustrative data used by the public demo
- `src/pages/` — statically generated Astro pages
- `src/layouts/` — Shared layout

The deployed public site has no active database binding, authentication, lead capture, billing, notifications, signing, export, or AI execution. Do not add production credentials to this static offer-boundary release.

## STY Issues
- STY-33 (schema/API) — DONE
- STY-34 (product app) — DONE
- STY-35 (deploy + outreach) — in progress
- STY-38 (data provisioning) — outside the active public-demo boundary
