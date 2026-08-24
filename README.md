# Styr.ing Board Portal

Norwegian governance concept demo — board portal, deadline tracking, and internal-control workflows for SMB and mid-market boards.

**Stack:** Astro 4 static frontend + Cloudflare Pages Functions + Cloudflare D1 (EEUR)
**Offer status:** Styr.ing is SaaS-only. Production activation, billing, subscription terms, and customer onboarding are not enabled on this public preview.
**Commercial policy:** Any production Styr.ing subscription requires a documented order, approved data-processing terms, and an activated billing/account workflow.

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

The public preview is safe to explore with fictional data. The deployed backend now exposes a real D1/API contract for boards, operating entities, review states, events and health checks. Public pages still render illustrative data and do not accept customer data without an authenticated production workflow.

### Backend API

- `GET /api/health` — binding and service health (no secrets returned)
- `GET /api/boards` — active boards
- `GET /api/board/:id` — board plus members, meetings, actions, resolutions, documents and risks
- `GET /api/domains/:domain?boardId=...` — tenant-scoped people, goals, IT, tickets, finance, CRM, contracts, sustainability and integration records
- `GET /api/search?boardId=...&q=...` — cross-domain, source-labelled universal search
- `POST /api/assistant` — protected, rules-based evidence draft with citations; always `requiresHumanApproval: true` and `executed: false`
- `GET|POST|DELETE /api/reviews` — auditable review state (`boardId`, `entityType`, `entityId`)
- `POST /api/events` — append-only event intake contract for future event mesh adapters
- `POST /api/mcp` (API key) — MCP-compatible JSON-RPC endpoint exposing the read-only `search_board` tool; ReBAC/SSO gateway and external AI provider approval remain required
- `GET /api/finance?boardId=...&view=summary|accounts|periods|vouchers|intercompany|notes` — tenant-scoped accounting, intercompany and statutory-note preparation data
- `GET /api/finance?boardId=...&view=saf-t&from=YYYY-MM&to=YYYY-MM` — SAF‑T Financial 1.3 XML export contract
- `POST /api/finance` (API key) — balanced voucher posting, period locking, intercompany mirror preparation/approval and statutory-note approval (`action: create_voucher|lock_period|prepare_intercompany|approve_intercompany|approve_note`)
- `GET /api/assets?boardId=...&view=summary|assets|depreciation` — tenant-scoped fixed-asset register with separate financial and tax depreciation tracks
- `POST /api/assets` (API key) — approve depreciation entries; ledger posting remains separately controlled
- `GET /api/treasury?boardId=...&view=summary|payroll|submissions|liquidity|collections` — tenant-scoped payroll, statutory-submission preparation, liquidity and collections data
- `POST /api/treasury` (API key) — approve payroll/submission preparation, prepare collection reminders, or create liquidity snapshots; external senders remain unconfigured
- `GET|POST /api/payroll` — calculate and approve holiday-pay/OTP compliance checks from a payroll run; Altinn/NAV submission remains unconfigured
- `GET /api/cards?boardId=...&view=summary|cards|transactions` — tenant-scoped corporate-card, receipt and expense control data
- `POST /api/cards` (API key) — attach receipt references and approve transactions; card issuing, settlement and ledger posting remain unconfigured
- `GET /api/procurement?boardId=...&view=summary|orders|receipts|invoices` — tenant-scoped procure-to-pay control trail and three-way matching data
- `POST /api/procurement` (API key) — approve purchase orders or match supplier invoices; EHF and bank adapters remain unconfigured
- `GET /api/hcm?boardId=...&view=summary|people|candidates|handbook|training|reviews|offboarding` — tenant-scoped HCM workspace data
- `POST /api/hcm` (API key) — controlled candidate, handbook, training and offboarding actions; sensitive actions remain approval-gated
- `GET /api/it?boardId=...&view=summary|assets|tickets|saas|access|lifecycle` — tenant-scoped IT operations data
- `POST /api/it` (API key) — prepare offboarding IT tasks, review access and approve lifecycle proposals; no automatic revocation
- `GET /api/commercial?boardId=...&view=summary|pipeline|quotes|rooms|subscriptions|cases` — tenant-scoped CRM, CPQ, sales-room, recurring-revenue and customer-service data
- `GET /api/revenue?boardId=...&view=summary|contracts|obligations|schedule` — tenant-scoped revenue-contract, performance-obligation and periodization preparation data
- `POST /api/revenue` (API key) — approve schedule entries; billing and ledger posting remain separate controls
- `POST /api/commercial` (API key) — approve/send quote records and create/resolve customer cases; external delivery, e-signing and payment remain unconfigured
- `GET /api/governance?boardId=...&view=summary|contracts|redlines|mandates|equity|grants` — tenant-scoped contract reviews, AI-redline preparation, powers of attorney, equity and option grants
- `POST /api/governance` (API key) — create/review contract controls, accept redline proposals, approve grant records and activate mandate proposals; evidence, tax and legal sign-off remain required
- `GET /api/board_governance?boardId=...&view=summary|meetings|attendance|ballots` — tenant-scoped meeting attendance, quorum and ballot trail
- `POST /api/board_governance` (API key) — record attendance/conflicts and cast ballots; eID/PAdES signing remains unconfigured
- `GET /api/sustainability?boardId=...&view=summary|items` — tenant-scoped HMS, SJA, safety, carbon and supplier-diligence records
- `POST /api/sustainability` (API key) — create or close a GRC record; regulatory reporting and carbon methodology remain human-reviewed
- `GET /api/field?boardId=...&view=summary|fleet|trips|maintenance|facilities|projects|time|wip|invoice_drafts` — tenant-scoped fleet, trip-log, maintenance, FDV, project, time-entry and invoice-preparation data
- `POST /api/field` (API key) — prepare/approve invoice drafts, classify trips, approve time and complete maintenance records; GPS, tax and invoicing adapters remain unconfigured

Initialize or update the remote database with `wrangler d1 execute styr-ing-db --remote --file=d1/schema.sql`, then seed the illustrative board with `wrangler d1 execute styr-ing-db --remote --file=d1/seed.sql`.

The API is deliberately not a claim that all PRD adapters are live. Altinn/NAV, bank/payment, EHF/PEPPOL, Stripe, eID, payroll, cards, collections, CRM enrichment, AI providers and external MCP consumers each require credentials, contracts, legal approval, authentication, authorization, monitoring and dedicated adapter implementation before production use.

Preview access is intentionally limited to the fictional `board-1`. A production tenant must be issued through an authenticated SSO/service boundary and pass the same board authorization check before any customer data is readable.

## STY Issues
- STY-33 (schema/API) — DONE
- STY-34 (product app) — DONE
- STY-35 (deploy + outreach) — in progress
- STY-38 (data provisioning) — outside the active public-demo boundary
