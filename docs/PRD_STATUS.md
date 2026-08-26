# Styr.ing — PRD-status

Sist kontrollert: 2026-08-26  
Kilde: `norwegian_styrearbeid_saas_prd.html` (versjon 8.0.0)

Dette er en implementasjonsstatus, ikke en påstand om regulatorisk godkjenning. «Intern» betyr at arbeidsflyten, datamodellen og autorisasjonskontrollen finnes i Styr.ing. «Adapter» betyr at leverandør, credentials, kontrakt, overvåking og juridisk godkjenning fortsatt må etableres.

## Regnskapskjerne — prioritert for norske småbedrifter

| Krav | Status | Bevis i løsningen |
|---|---|---|
| Bilagsarkiv med dokumentinnhold og kontrollsum | Intern | `functions/api/documents.ts`, `accounting_documents`, Cloudflare R2-binding `DOCS`, tenant-sjekk, SHA-256, opplastingsflate i `app/finance.astro` |
| Globalt søk i bilagsarkiv | Intern | `functions/api/search.ts` søker nå i `accounting_documents` på filnavn, type og kontrollsum |
| Bilag, balanserte linjer og gapless sekvens | Intern | `functions/api/finance.ts`, `voucher_sequences`, atomisk validering |
| Periodelåsing og kontrollspor | Intern | `finance.ts`, period close-komponentene, audit-logg |
| Faktura, kreditnota, åpne poster og betaling | Intern | `finance.ts`, `SalesInvoiceQuick`, `ReceivablesPayablesQuick`; faktura, kreditnota og manuell betaling avviser kalender-ugyldige datoer server-side, og betalingsreferanser er idempotente |
| Kontrollert purringsutkast for forfalte fakturaer | Intern klargjøring | `functions/api/collections.ts`, `CollectionReminderQuick`; bygger norsk tekst med kunde, fakturanummer, forfall, restsaldo og SHA-256-checksum, med eksplisitt menneskelig godkjenning. Renter, gebyrer og ekstern utsending er deaktivert. |
| Gjentakende fakturering for faste leveranser | Intern | `recurring_invoice_templates`/`recurring_invoice_generations`, `finance.ts`, `RecurringInvoiceQuick`; månedlig, kvartalsvis og årlig mal lager idempotente fakturautkast med neste kjøredato. Utsending og bokføring krever fortsatt separat kontroll. |
| Norsk fakturadokument med profil, kontrollert godkjenning og utskrift | Intern | `finance.ts` (`invoice-setup`, `invoice-document`, `approve_invoice`), `SalesInvoiceQuick`; selger-/kundeadresse, kundetype (bedrift eller privatkunde), org.nr. når det kreves, bankkonto, linjer og summer fryses i et versjonert SHA-256-snapshot før godkjenning |
| Dobbeltføringssikker manuell betaling | Intern | `finance.ts` og `procurement.ts` avviser gjenbruk av betalingsreferanse med annet beløp og returnerer idempotent resultat ved trygg retry; D1-indeks `uq_invoice_payments_manual_reference` |
| Kontrollert faktura → hovedbok | Intern | `PostingQueueQuick`, `functions/api/postings.ts`: kildehash, konto-/MVA-valg, separat godkjenning, idempotent bilagspostering og audit-logg; lønnskjøringer krever aktiv liabilitykonto 2600/260x for forskuddstrekk |
| Bankimport, matchforslag og manuell bokføring | Intern | `functions/api/bank.ts`, `BankReconciliationQuick`; CSV-importen støtter norske datoer, desimalkomma/tusenskilletegn, quoted-felter og validerer linjer før opplasting. API-et avviser også kalender-ugyldige datoer server-side |
| MVA-beregning, snapshot og kontroll | Intern | `functions/api/mva.ts`, `VatPeriodQuick`; inngående 15 % (`1_15`) klassifiseres korrekt |
| Lønnskjøring og feriepenger/OTP-kontroller | Intern | `functions/api/payroll.ts`, `PayrollQuick` |
| Leverandørflyt, mottak og 3-veis match | Intern | `functions/api/procurement.ts`, `SupplierInvoiceQuick`; sammendrag og UI viser restsaldo etter delbetaling og betaling krever godkjent/anvist faktura |
| EHF-grunnlag, kontroll og UBL-eksport | Intern klargjøring | `functions/api/procurement.ts`, `EHFInboxQuick`; linjer, MVA og totaler valideres mot hverandre, og validerte dokumenter kan lastes ned som UBL 2.1 / Peppol BIS Billing 3.0 XML. PEPPOL-transport er ikke konfigurert. |
| Resultat, balanse, saldobalanse og hovedbok | Intern | `finance.ts`, `AccountingReportsQuick` |
| SAF-T Financial 1.3 eksport | Intern eksport | XML/CSV kan genereres; innsending er ikke aktivert |
| Årsoppgjørsnoter og årsregnskap-forberedelse | Intern forberedelse | `StatutoryNotesQuick`, `AnnualAccountsQuick` |
| Eiendeler med bok/tax-avskrivning | Intern kontroll | `functions/api/assets.ts`, `AssetRegisterQuick` |
| Intercompany og valuta/agio | Intern kontroll | `finance.ts`, `IntercompanyQuick`, `FxLedgerQuick` |
| Førstegangsoppsett for små virksomheter: kontoplan, bilagsimport og åpne perioder | Intern | `AccountingSetupQuick`, nedlastbar CSV-mal med virksomhetens konto-ID-er, `finance.ts` (`seed_smb_chart`, `import_vouchers`, `create_account`, `create_period`), balansekontroll, låste perioder, ekstern referanse-idempotens, autorisert skriverolle og audit-logg |
| Godkjente prosjekttimer → salgsfakturautkast | Intern | `functions/api/field.ts` (`convert_invoice_draft`), `src/pages/field.astro`, kobling via `time_entries.invoice_draft_id`, oppretter `sales_invoices`/`sales_invoice_lines` med MVA og kontrollert review-steg; sending/EHF er fortsatt deaktivert |
| Hash-verifiserbar audit-kjede | Intern | `functions/api/_lib.ts`, `functions/api/audit.ts`, `audit_log.prev_hash/event_hash`, integritetsstatus i `/audit` |
| Invitasjon og kontoaktivering | Intern | `functions/api/auth.ts`, `src/pages/activate.astro`; hash-lagret engangstoken, 24-timers utløp, årsak for ugyldig/brukt/utløpt lenke, eldre aktive invitasjoner til samme e-post ugyldiggjøres ved ny invitasjon |

## Adaptere som ikke skal fremstilles som live

Følgende er bevisst markert `not_configured` eller tilsvarende i kode og UI: Altinn 3/Skatteetaten/NAV/Aa-registeret, skattekort, Regnskapsregisteret, EHF/PEPPOL sending og mottak, direkte banktilkoblinger/AutoPay, Stripe Billing, kortutstedelse, Vipps/Klarna, inkasso/ekstern post, BankID/eID/PAdES-signering, Brønnøysund-oppslag, Creditsafe, GPS, e-postlevering og eksterne AI/MCP-leverandører.

For hver adapter kreves minimum: leverandøravtale, produksjonscredentials, databehandleravtale, scopes/autorisasjon, idempotens og retry-policy, overvåking, hendelseslogg, feilhåndtering, testmiljø og juridisk/regulatorisk godkjenning.

## Andre PRD-domener

CRM/revenue, styre/govenance, HCM, IT, felt, HMS/ESG, treasury, kort, risiko, compliance, event mesh og evidence-basert assistent har interne D1-backed read/write-kontrakter og UI på utvalgte flater. De er ikke dermed fullverdige erstatninger for de eksterne systemene i PRD-en. Før produksjonsløfte må hvert domene få egne ende-til-ende tester, rolle-/tenant-matrise, dataklassifisering, retention og leverandøradaptere.

## Verifikasjon utført

- `npm run verify:source` — PASS (54 sider, 46 nettleserskript)
- `npm run verify:api` — PASS (42 API-moduler)
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS (63 sider)
- `git diff --check` — PASS
- Produksjon `https://styr.ing/`: landing, `/finance/`, `/app/finance/`, `/login`, `/api/health` — HTTP 200
- Produksjonssammendrag: balanserte bilag, perioder, bank-/innkjøps-/lønnskontroller returnerer JSON fra D1
- Produksjonssmoke: `LIVE API SMOKE: PASS (119 checks against https://styr.ing)` etter siste deploy, inkludert purringsutkast-endepunkt, strukturkontroll for fakturaprofil, fakturaliste, EHF XML-guard og gjentakende fakturavisninger
- Siste deploy: Cloudflare Pages `https://694cf2cf.styr-ing.pages.dev` (produksjonsdomene `https://styr.ing/`), inkluderer bilagsarkiv på R2, globalt søk, idempotent prosjekttimer → salgsfakturakonvertering, direkte fakturadetaljer via `invoiceId`, kreditnota i hovedbokskøen, kreditnota-bevisst restsaldo/betalingskontroll, server-side kalenderdato-kontroll for faktura/kreditnota/bilag, dobbeltføringssikker manuell betaling for kunde- og leverandørfaktura, manuell leverandørbetaling i hurtig- og full innkjøpsflyt, restsaldo-bevisste bankmatch-forslag, robust norsk CSV-bankimport med lokal validering og server-side kalenderdato-kontroll, lønnskontroll som krever 2600/260x-konto for forskuddstrekk, korrekt inngående 15 % MVA, krav om anvisning før leverandørbetaling, restsaldo-bevisst likviditetsprognose, EHF-grunnlag med linje-/MVA-kontroll og nedlastbar UBL 2.1 / Peppol BIS Billing 3.0 XML-klargjøring, gjentakende fakturamal med månedlig/kvartalsvis/årlig idempotent utkastgenerering, kontrollert purringsutkast med checksum og godkjenning, blokkering av purringsutkast for betalte fakturaer, robust navigasjon ved smale/zoomet visninger, norsk fakturadokument med profilert godkjenning, bedrift/privatkunde, SHA-256-snapshot og utskrift/PDF, regnskap-først landingsside der tilleggskapabiliteter ligger samlet bak en tydelig utvidelse, SMB-fokusert regnskapsforside og diagnostiserbar engangsaktivering, kildecommit `c8962da`

## Brukerflyt — månedsavslutning

Periodeavslutning ligger nå i den daglige regnskapsflyten i `app/finance`: kontroller åpne bankposter, fakturaer, MVA, lønn, bilagsforslag, avskrivning, balanse og SAF-T-grunnlag før godkjenning og låsing. Kontrollene lagres med hash og audit-spor; en låst periode avvises av bokføringsendepunktene.

## Brukerflyt — betaling og åpne poster

Betalinger kan kobles til åpne kunde-/leverandørposter fra samme regnskapsflate. `ReceivablesPayablesQuick` krever retning og eksakt beløp, oppretter en kontrollert betalingskobling i bank-API-et og sender deretter brukeren til bankavstemming for endelig bokføring. En kobling endrer ikke saldoen; `functions/api/bank.ts` oppdaterer fakturastatus først etter at det balanserte bankbilaget er opprettet. Bilag, bankstatus, åpne-poster-status og betalingsstatus lagres i samme D1-batch, og en idempotent retry reparerer eventuelle manglende sideeffekter. Matchforslag, godkjenning, idempotent postering og audit-spor er internt implementert. Direkte banktilkoblinger og automatisk betaling er fortsatt ikke konfigurert.

## Neste leveranse før reell kunde

1. Koble og godkjenne én konkret e-postleverandør; intern engangsaktivering, klokke-/utløpsstatus og replay-avvisning er implementert, men utsending og leverandør-overvåking mangler.
2. Etabler Stripe-produkter/priser, skatt, abonnementsvilkår og webhook-secret før Billing aktiveres.
3. Velg én bank- og én EHF-partner; implementer adapterkontrakter i sandbox før produksjon.
4. Fullfør juridisk godkjenning av personvern, DPA, vilkår, retention og DPIA.
5. Kjør tenant-isolasjon, rolle, eksport/sletting og hendelsesreplay som automatiserte ende-til-ende-tester.
