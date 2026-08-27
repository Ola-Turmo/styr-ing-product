# Styr.ing — PRD-status

Sist kontrollert: 2026-08-27  
Kilde: `norwegian_styrearbeid_saas_prd.html` (versjon 8.0.0)

Dette er en implementasjonsstatus, ikke en påstand om regulatorisk godkjenning. «Intern» betyr at arbeidsflyten, datamodellen og autorisasjonskontrollen finnes i Styr.ing. «Adapter» betyr at leverandør, credentials, kontrakt, overvåking og juridisk godkjenning fortsatt må etableres.

## Regnskapskjerne — prioritert for norske småbedrifter

| Krav | Status | Bevis i løsningen |
|---|---|---|
| Bilagsarkiv med dokumentinnhold og kontrollsum | Intern | `functions/api/documents.ts`, `accounting_documents`, Cloudflare R2-binding `DOCS`, tenant-sjekk, SHA-256, opplastingsflate i `app/finance.astro` |
| Globalt regnskapssøk | Intern | `functions/api/search.ts` søker i bilagsarkiv, bokførte bilag, kundefakturaer, leverandørfakturaer og kontoplan; `workspace.astro` viser treffene samlet |
| Bilag, balanserte linjer og gapless sekvens | Intern | `functions/api/finance.ts`, `voucher_sequences`, atomisk validering |
| Periodelåsing og kontrollspor | Intern | `finance.ts`, period close-komponentene, audit-logg. Godkjenning sammenligner kontrollsnapshot med dagens bilag, åpne poster, bank, MVA, lønn, forslag, avskrivning og SAF-T-status; endringer krever ny kontroll før låsing |
| Faktura, kreditnota, åpne poster og betaling | Intern | `finance.ts`, `SalesInvoiceQuick`, `ReceivablesPayablesQuick`; faktura, kreditnota og bilag avviser kalender-ugyldige datoer server-side, faktura/EHF krever forfall på eller etter fakturadato, kreditnota kan ikke tilbakedateres før originalfaktura, og betalingsreferanser er idempotente |
| Automatisk fakturanummer for manuelle salgsfakturaer | Intern | `sales_invoice_sequences`, `functions/api/finance.ts`, `SalesInvoiceQuick`; tomt fakturanummer tildeles atomisk per virksomhet og fakturaår (for eksempel `2026-00001`), mens eksplisitt nummer fortsatt støttes. Duplikater og ugyldige manuelt innskrevne nummer avvises med tydelig feilmelding |
| Kontrollert purringsutkast for forfalte fakturaer | Intern klargjøring | `functions/api/collections.ts`, `CollectionReminderQuick`; bygger norsk tekst med kunde, fakturanummer, forfall, restsaldo og SHA-256-checksum, med eksplisitt menneskelig godkjenning. Renter, gebyrer og ekstern utsending er deaktivert. |
| Gjentakende fakturering for faste leveranser | Intern | `recurring_invoice_templates`/`recurring_invoice_generations`, `finance.ts`, `RecurringInvoiceQuick`; månedlig, kvartalsvis og årlig mal lager idempotente fakturautkast med neste kjøredato. Utsending og bokføring krever fortsatt separat kontroll. |
| Norsk fakturadokument med profil, kontrollert godkjenning og utskrift | Intern | `finance.ts` (`invoice-setup`, `invoice-document`, `approve_invoice`), `SalesInvoiceQuick`; selger-/kundeadresse, kundetype (bedrift eller privatkunde), org.nr. når det kreves, bankkonto, linjer og summer fryses i et versjonert SHA-256-snapshot før godkjenning |
| Dobbeltføringssikker manuell betaling | Intern | `finance.ts` og `procurement.ts` avviser gjenbruk av betalingsreferanse med annet beløp og returnerer idempotent resultat ved trygg retry, også når to faner konkurrerer om samme referanse; D1-indeks `uq_invoice_payments_manual_reference` |
| Kontrollert faktura → hovedbok | Intern | `PostingQueueQuick`, `functions/api/postings.ts`: kildehash, konto-/MVA-valg, separat godkjenning, idempotent bilagspostering og audit-logg; lønnskjøringer krever aktiv liabilitykonto 2600/260x for forskuddstrekk |
| Betaling før bokføring uten fastlåst faktura | Intern | `functions/api/postings.ts`, `PostingQueueQuick`: allerede betalte kunde- og leverandørfakturaer kan fortsatt få kontrollert bilagsforslag; bilagsoppretting er idempotent på kildereferansen, og leverandørstatus bevares som `paid` etter bokføring |
| Bankimport, matchforslag og manuell bokføring | Intern | `functions/api/bank.ts`, `BankReconciliationQuick`; CSV-importen støtter norske datoer, desimalkomma/tusenskilletegn, quoted-felter og validerer linjer før opplasting. API-et avviser også kalender-ugyldige datoer server-side. Gjentatt import med samme referanse er idempotent, bankbetalinger kan kobles til delbetalinger og trygg retry returnerer eksisterende kobling, mens gjenbruk med endrede transaksjonsdata avvises som konflikt |
| MVA-beregning, snapshot og kontroll | Intern | `functions/api/mva.ts`, `VatPeriodQuick`; inngående og utgående 12 %/15 %/25 % klassifiseres med konsekvente koder (`1_12`, `1_15`, `1`, `3_12`, `3_15`, `3`). Godkjent MVA-grunnlag og rapportforberedelse er hash-bundet og idempotent ved retry. |
| Lønnskjøring og feriepenger/OTP-kontroller | Intern | `functions/api/payroll.ts`, `PayrollQuick`; aktive ansatte registreres i personregisteret, og hver lønnskjøring valideres og lagres med brutto/skattetrekk per ansatt. Rapportgrunnlag får hash og er idempotent ved trygg retry; endrede godkjente tall gir snapshot-konflikt. Altinn, skattekort, NAV og utbetaling er ikke koblet til eksterne tjenester. |
| Leverandørflyt, mottak og 3-veis match | Intern | `functions/api/procurement.ts`, `SupplierInvoiceQuick`; sammendrag og UI viser restsaldo etter delbetaling og betaling krever godkjent/anvist faktura. Ordre, mottak, leverandørfaktura og EHF avviser kalender-ugyldige datoer server-side |
| Gjenbrukbart leverandørregister for småbedrifter | Intern | `supplier_parties`, `functions/api/procurement.ts`, `SupplierInvoiceQuick`; leverandørnavn, norsk org.nr., kontakt, betalingsfrist og standard kostnadskonto kan lagres én gang og kobles til nye ordre/fakturaer. Eksisterende fritekstflyt er fortsatt støttet |
| EHF-grunnlag, kontroll og UBL-eksport | Intern klargjøring | `functions/api/procurement.ts`, `EHFInboxQuick`; linjer, MVA og totaler valideres mot hverandre, og validerte dokumenter kan lastes ned som UBL 2.1 / Peppol BIS Billing 3.0 XML. PEPPOL-transport er ikke konfigurert. |
| Resultat, balanse, saldobalanse og hovedbok | Intern | `finance.ts`, `AccountingReportsQuick` |
| SAF-T Financial 1.3 eksport | Intern eksport | Skatteetaten-formatert 1.30 XML med firmaprofil, periodekriterier, hovedbokssaldoer, journal-totalsummer og posterte bilag; innsending er ikke aktivert |
| Årsoppgjørsnoter og årsregnskap-forberedelse | Intern forberedelse | `StatutoryNotesQuick`, `AnnualAccountsQuick` |
| Eiendeler med bok/tax-avskrivning | Intern kontroll | `functions/api/assets.ts`, `AssetRegisterQuick`; anskaffelsesdato valideres som faktisk kalenderdato før lagring |
| Intercompany og valuta/agio | Intern kontroll | `finance.ts`, `IntercompanyQuick`, `FxLedgerQuick` |
| Førstegangsoppsett for små virksomheter: kontoplan, bilagsimport og åpne perioder | Intern | `AccountingSetupQuick`, nedlastbar CSV-mal med virksomhetens konto-ID-er, `finance.ts` (`seed_smb_chart`, `import_vouchers`, `create_account`, `create_period`, `create_fiscal_year`), balansekontroll, låste perioder, ekstern referanse-idempotens, autorisert skriverolle og audit-logg. Regnskapsår kan åpnes idempotent med alle 12 måneder; enkeltmåned er fortsatt tilgjengelig. |
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
- `npm run verify:api` — PASS (43 API-moduler)
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS (63 sider)
- `git diff --check` — PASS
- Produksjon `https://styr.ing/`: landing, `/finance/`, `/app/finance/`, `/login`, `/api/health` — HTTP 200
- Produksjonssammendrag: balanserte bilag, perioder, bank-/innkjøps-/lønnskontroller returnerer JSON fra D1
- Produksjonssmoke: `LIVE API SMOKE: PASS (125 checks against https://styr.ing)` etter siste deploy, inkludert purringsutkast-endepunkt, strukturkontroll for fakturaprofil, fakturaliste, EHF XML-guard, gjentakende fakturavisninger, lønnspersonregister og årsregnskapssammendrag
- Siste deploy: Cloudflare Pages `https://5e62bf1f.styr-ing.pages.dev` (produksjonsdomene `https://styr.ing/`), inkluderer bilagsarkiv på R2, globalt søk, idempotent prosjekttimer → salgsfakturakonvertering med datorekkefølge, dynamiske fakturadatoer og kreditnotakontroll, direkte fakturadetaljer via `invoiceId`, kreditnota i hovedbokskøen, kreditnota-bevisst restsaldo/betalingskontroll, server-side kalenderdato-kontroll for faktura/kreditnota/bilag, ordre/mottak/leverandørfaktura/EHF og anskaffelsesdato, dobbeltføringssikker manuell betaling for kunde- og leverandørfaktura, manuell leverandørbetaling i hurtig- og full innkjøpsflyt, restsaldo-bevisste bankmatch-forslag, robust norsk CSV-bankimport med lokal validering og server-side kalenderdato-kontroll, lønnskontroll som krever 2600/260x-konto for forskuddstrekk, korrekt inngående og utgående 12 %/15 %/25 % MVA, krav om anvisning før leverandørbetaling, restsaldo-bevisst likviditetsprognose, EHF-grunnlag med linje-/MVA-kontroll og nedlastbar UBL 2.1 / Peppol BIS Billing 3.0 XML-klargjøring, gjentakende fakturamal med månedlig/kvartalsvis/årlig idempotent utkastgenerering, kontrollert purringsutkast med checksum og godkjenning, blokkering av purringsutkast for betalte fakturaer, robust navigasjon ved smale/zoomet visninger, norsk fakturadokument med profilert godkjenning, bedrift/privatkunde, SHA-256-snapshot og utskrift/PDF, regnskap-først landingsside der tilleggskapabiliteter ligger samlet bak en tydelig utvidelse, SMB-fokusert regnskapsforside og diagnostiserbar engangsaktivering, robust quoted CSV-import for åpningsbalanse/historikk og norske tallformater, dynamiske dags-/periode-defaults i innlogget regnskapsflate og delimiter-sikker norsk CSV-tolkning, atomisk automatisk fakturanummerering per virksomhet og år, validering og tydelig duplikatbeskyttelse for kreditnotanummer, løpende lønnstotaler før kjøring, kildecommit `d466aed`

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

## Siste regnskapsforbedring (2026-08-26)

- Manuelle salgsfakturaer kan nå opprettes uten at en liten virksomhet må gjette neste nummer. D1-sekvensen `sales_invoice_sequences` reserverer neste nummer atomisk per virksomhet og år, returnerer nummeret i API-responsen og skriver nummeret til kontrollsporet. Eksisterende fakturanummer kan fortsatt oppgis eksplisitt.
- Produksjonsmigrasjon `20260912_sales_invoice_sequences.sql` er kjørt på `styr-ing-db` og verifisert med `sqlite_master`.

- Deploy: `https://554ecce7.styr-ing.pages.dev` → `https://styr.ing/` (Cloudflare Pages `main`).
- Commit: `db8b694`.
- Commit: `bb8d13a`.
- Fakturadato, forfallsdato og kreditnotadato valideres som faktiske kalenderdatoer og i riktig kronologisk rekkefølge. Prosjektfaktura følger samme kontroll.
- Kreditnotaer avviser nå ugyldige nummer (linjeskift eller over 60 tegn) og gjenbruk av et nummer med en lesbar konfliktmelding før lagring.
- Fakturaskjemaet bruker dynamisk dagens dato og foreslår 14 dagers forfall, også etter at skjemaet nullstilles.
- Verifisert med `npx tsc --noEmit`, `npm run verify:api`, `npm run verify:source`, `npm run build`, `git diff --check` og `LIVE API SMOKE: PASS (120 checks against https://styr.ing)`.

## Siste rapportforbedring (2026-08-27)

- A-melding, NAV-inntektsmelding og MVA-rapportgrunnlag er nå idempotente ved trygg retry: samme hash returnerer eksisterende aktive grunnlag, mens endrede tall gir en tydelig snapshot-konflikt.
- D1-indeksen `idx_compliance_submissions_active_unique` tillater bare ett aktivt grunnlag per virksomhet, rapporttype og periode og lukker race condition ved samtidige faner.
- Produksjonsmigrasjon `20260913_compliance_submission_idempotency.sql` er kjørt og verifisert i `styr-ing-db`.
- Deploy: `https://f33b5ead.styr-ing.pages.dev` → `https://styr.ing/` (Cloudflare Pages `main`).
- Verifisert med `npm run verify`, `npm run verify:live` (120 kontroller), HTTP 200 på landing og `/api/health`.

## Siste betalingsflyt-forbedring (2026-08-27)

- Banklinje → kunde-/leverandørbetaling er nå idempotent ved trygg retry. Samme faktura, beløp og bankreferanse returnerer eksisterende kobling og betalings-ID; avvikende faktura eller beløp gir en eksplisitt konflikt.
- Konkurrerende faner håndteres ved å lese tilbake koblingen som vant D1s unike banklinje-/betalingsbegrensning. Ingen ekstra delbetaling eller betalingspost opprettes.
- Deploy: `https://e61c3636.styr-ing.pages.dev` → `https://styr.ing/` (Cloudflare Pages `main`).
- Verifisert med `npm run verify:live` (120 kontroller), HTTP 200 på landing, `/finance/` og `/api/health`.

## Siste fakturabetalingsforbedring (2026-08-27)

- Manuell kunde- og leverandørbetaling håndterer nå samtidige retries på samme betalingsreferanse uten 503-feil eller dobbeltføring. Vinnerens betalings-ID leses tilbake; annet beløp gir `payment_reference_conflict`.
- Deploy: `https://79e3e4a0.styr-ing.pages.dev` → `https://styr.ing/` (Cloudflare Pages `main`).
- Verifisert med `npm run verify:live` (120 kontroller), HTTP 200 på landing, `/finance/` og `/api/health`.

## Siste periodelåsingsforbedring (2026-08-27)

- Godkjenning av periodeavslutning sammenligner nå den lagrede kontrollsnapshothashen med dagens regnskapsdata før perioden kan låses. Nye eller endrede bilag, åpne poster, MVA-grunnlag, lønn, avskrivninger, forslag eller SAF-T-kontroll krever en ny kontroll.
- `prepare_period_close` leser tilbake og returnerer den faktiske persisted closure-ID-en etter UPSERT. Dette gjør trygg retry entydig også når samme periode åpnes i flere faner.
- Deploy: `https://51c0d6c4.styr-ing.pages.dev` → `https://styr.ing/` (Cloudflare Pages `main`).
- Verifisert med `npm run verify`, `npm run verify:live` (120 kontroller), HTTP 200 på landing, `/finance/` og `/api/health`.

## Siste korrigeringsforbedring (2026-08-27)

- Bokførte bilag kan nå korrigeres fra regnskapsflaten uten sletting eller omskriving. Brukeren velger originalbilaget og oppretter et motsatt, balansert bilag med `reversal:<original-id>` som sporbar kobling.
- Reverseringer avvises i låste perioder, beholder originalens MVA-koder og er idempotente ved retry eller samtidige faner.
- Arbeidsflaten viser korrigeringsflyten rett under manuell bokføring, med forklaring tilpasset små virksomheter.
- Deploy: `https://8389625c.styr-ing.pages.dev` → `https://styr.ing/` (Cloudflare Pages `main`).
- Verifisert med `npm run verify`, `npm run verify:api`, `npm run build`, `npm run verify:live` (120 kontroller) og HTTP 200 på landing, `/app/finance/` og `/api/health`.

## Siste manuelle bilagsforbedring (2026-08-27)

- Manuell bokføring med `externalReference` er nå idempotent: retry av samme balanserte bilag returnerer originalt bilagsnummer uten å lage en ny post eller bruke nytt sekvensnummer.
- Samme referanse med endret dato, periode, beskrivelse eller linjer avvises tydelig med `external_reference_conflict` (HTTP 409), også ved samtidige forespørsler.
- Verifisert med `npm run verify`, `npm run verify:api`, `npm run build`, `git diff --check` og `npm run verify:live` (120 kontroller).
- Produksjonsdeploy: Cloudflare Pages `https://b89fded6.styr-ing.pages.dev` på branch `main`, koblet til `https://styr.ing/`.

## Siste bankposteringsforbedring (2026-08-27)

- Samtidige forsøk på å bokføre samme godkjente bankmatch leser nå tilbake bilaget som vant den unike `bank:<transactionId>`-referansen og returnerer det som en idempotent retry.
- Bilag, banklinje, betalingskobling og fakturasaldo fullføres gjennom samme kontrollerte sideeffektsett; en konkurrerende fane får ikke lenger en generell databasefeil eller et ekstra bilagsnummer.
- Verifisert med `npm run verify`, `npm run verify:api`, `git diff --check` og `npm run verify:live` (120 kontroller).
- Produksjonsdeploy: Cloudflare Pages `https://ea8ffd88.styr-ing.pages.dev` på branch `main`, koblet til `https://styr.ing/`.

## Siste bankklassifiseringsforbedring (2026-08-27)

- Vanlige banklinjer uten faktura- eller kortmatch kan nå plasseres på en valgt aktiv hovedbokskonto med en obligatorisk forklaring. Dette dekker typiske småbedriftsbehov som husleie, bankgebyr, overføring og eierinnskudd.
- Klassifisering og endelig bokføring er to separate steg. Motkontoen velges av en autorisert bruker, og systemet gjetter ikke MVA-behandling. Låste perioder og konto-/virksomhetssperrer gjelder fortsatt.
- Gjentatt bokføring av samme bankreferanse er idempotent og returnerer det eksisterende bilaget i stedet for å opprette en ny post.
- Ny migrasjon er definert i `d1/migrations/20260914_bank_manual_classification.sql`. I produksjon ble de to additive kolonnene (`manual_counter_account_id` og `classification_note`) lagt til med en kontrollert D1-kommando fordi historisk migreringslogg ikke samsvarer med skjemaet som allerede ligger i `d1/schema.sql`; full replay stopper tidligere på en allerede eksisterende `attested_by`-kolonne. Kolonnene er verifisert i produksjon.
- Verifisert med `npm run verify`, `npm run verify:api`, `npm run build`, `git diff --check` og `npm run verify:live` (120 kontroller). Landing, `/app/finance/` og `/api/health` svarer HTTP 200.
- Produksjonsdeploy: Cloudflare Pages `https://2afeabf0.styr-ing.pages.dev` på branch `main`, koblet til `https://styr.ing/`.

## Siste leverandørregisterforbedring (2026-08-27)

- Leverandørregisteret er utvidet med gjenbrukbare leverandørkort for navn, norsk organisasjonsnummer, e-post, betalingsfrist og valgfri standard kostnadskonto. Nye innkjøpsordrer og leverandørfakturaer kan velge en registrert leverandør, mens små engangskjøp fortsatt kan skrives inn manuelt.
- API-et validerer org.nr. med norsk kontrollsiffer, avviser duplikat per virksomhet, håndhever aktiv konto og virksomhetssperre, og logger opprettelse/oppdatering. Leverandørkoblingen er valgfri og påvirker ikke historiske ordre/fakturaer.
- Produksjonsskjema: `supplier_parties` og additive `supplier_party_id`-kolonner på ordre/faktura ble lagt til med den kontrollerte migrasjonen `20260915_supplier_parties.sql`. Migreringshistorikken har samme tidligere avvik som beskrevet over; derfor ble denne additive migrasjonen kjørt direkte mot D1 og verifisert med `PRAGMA table_info`.
- Verifisert med `npm run verify`, `npm run verify:live` (120 kontroller), HTTP 200 på landing og `/api/procurement?view=suppliers`.
- Produksjonsdeploy: Cloudflare Pages `https://51843f11.styr-ing.pages.dev` på branch `main`, koblet til `https://styr.ing/`.

## Siste kontoaktiveringsforbedring (2026-08-26)

- Invitasjon på styremedlemsiden bruker nå et inline-skjema med e-post, navn, rolle, tydelig 24-timers utløp og kopieringsknapp. Nettleserens flertrinns `prompt`-dialoger er fjernet.
- `functions/api/auth.ts` returnerer `expiresAt` og gjør en betinget token-claim før bruker-/styrekobling opprettes. Dette avviser parallelle eller allerede brukte aktiveringsforsøk.
- Produksjonsdeploy: Cloudflare Pages `https://7ebcc542.styr-ing.pages.dev` på branch `main`, koblet til `https://styr.ing/`; `LIVE API SMOKE: PASS (120 checks)`.

## Siste SMB-forbedring (2026-08-26)

- CSV-importen i førstegangsoppsettet støtter nå quoted-felter, semikolon/komma som skilletegn og norske tall med tusenskilletegn/desimalkomma. Dette gjør åpningsbalanse og historikkimport mer robust for små norske virksomheter uten å gjette konto eller MVA.
- Verifisert med `npx tsc --noEmit`, `npm run verify:api`, `npm run verify:source`, `npm run build` og `git diff --check`.

## Siste regnskapsflyt-forbedring (2026-08-26)

- Åpne kunde- og leverandørposter har fått en ny, ryddig komponent med tydelige restbeløp, norske statusetiketter, delbetaling, godkjent bankkobling og kontrollert purringsutkast. Flyten skiller mellom registrering og endelig bokføring, og viser ingen automatisk ekstern utsending.
- La til kildeintegritetskontrakt for `ReceivablesPayablesQuick.astro`, slik at manglende seksjon, skjema, script eller style stopper verifikasjonen før bygg/deploy.
- Verifisert med `npx tsc --noEmit`, `npm run verify:api`, `npm run verify:source`, `npm run build` og `git diff --check`.

## Siste MVA-forbedring (2026-08-26)

- Norsk 12 % MVA støttes nå gjennom hele den interne regnskapsflyten: salgsfaktura, leverandørfaktura, EHF-grunnlag, gjentakende faktura, prosjektfakturering, manuelle bilag og CSV-import.
- Inngående og utgående MVA bruker separate koder, slik at salg ikke feilklassifiseres som kjøp i MVA-grunnlaget.
- Gjeldende satser er kontrollert mot Skatteetatens publiserte satsoversikt. Ekstern innsending av MVA-melding er fortsatt ikke konfigurert.

## Produksjonsdatabase — MVA-skjema (2026-08-26)

- D1-migrasjon `20260911_norwegian_vat_12_percent.sql` er kjørt på database `styr-ing-db` (`745ab44e-8069-489d-8333-d1fd4049ae1d`).
- `supplier_invoice_lines` og `ehf_document_lines` har nå databasebegrensningen `vat_rate IN (0,12,15,25)`; eksisterende rader ble kopiert og indeksene gjenopprettet.
- Produksjonskontroll etter migrering: begge tabeller har 0 rader tapt og inneholder den nye 12 %-begrensningen.
- Migreringen er kjørt idempotent etter en kontrollert retry; gjeldende produksjonsskjema er bekreftet med `CHECK(vat_rate IN (0,12,15,25))`.

## Siste kunderegisterforbedring (2026-08-27)

- Nye kunder kan opprettes direkte fra fakturaflyten med navn, kundetype, norsk organisasjonsnummer, adresse, postnummer, poststed og e-post. Opprettelsen skriver CRM-kunden og `customer_invoice_profiles` i én D1-batch, slik at kunden er klar for fakturautkast uten et ekstra oppsettsteg.
- API-et (`finance.ts`, `action=create_customer`) validerer norske kontrollsifre, postnummer, e-post og påkrevde fakturafelt, avviser duplikate aktive organisasjonsnummer og logger opprettelsen. Eksisterende CRM-ID-er og fritekstfri fakturaflyt er beholdt.
- Kunderegisteret kan hentes med `view=customer-register` og viser om fakturaprofilen er komplett. Profilredigering oppdaterer både kundens navn/org.nr. og fakturaprofilen, med samme kontroll mot duplikater.
- Verifisert med `npm run verify`, `npm run verify:live` (122 kontroller), HTTP 200 på landing og `/api/finance?boardId=board-1&view=customer-register`.
- Produksjonsdeploy: Cloudflare Pages `https://d8cfed5f.styr-ing.pages.dev` på branch `main`, koblet til `https://styr.ing/`.
- Kundekortet lagrer også betalingsfrist (0–365 dager, standard 14), og feltet er tilgjengelig i `customer-register`/`invoice-setup` for å gi riktig forfallsdato i videre fakturaflyt.
- Når en kunde velges i nytt fakturautkast, beregnes forfallsdatoen fra kundens lagrede betalingsfrist hvis feltet er tomt. Brukeren kan fortsatt overstyre datoen før utkastet lagres.
- Additiv D1-migrasjon `20260916_customer_payment_terms.sql` er kjørt og bekreftet i produksjon med `PRAGMA table_info(customer_invoice_profiles)`.
### Produkt- og tjenesteregister (2026-08-27)

- Tenant-scoped D1-tabell `product_services` med varenummer, navn, beskrivelse, pris i øre, MVA-sats, inntektskonto og aktiv/inaktiv-status.
- `GET /api/finance?boardId=...&view=products` og skrivehandlingene `create_product` / `update_product` er tilgjengelige med validering, duplikatkontroll og audit-logg.
- Den innloggede regnskapsflaten har et eget, lite SMB-skjema (`ProductCatalogQuick`) for å lagre, liste og redigere vanlige varer og tjenester i NOK. Navn, varenummer, pris, MVA, beskrivelse og aktiv/inaktiv-status kan oppdateres, mens historiske fakturaer ikke endres. Registeret er foreløpig separat fra fakturautkastet; brukeren kan fortsatt skrive og kontrollere fakturalinjer manuelt. Det sender ikke fakturaer eller betalinger eksternt.
- Produksjon verifisert etter deploy med lokal full verifisering, live smoke (123 kontroller) og HTTP-kontroll av landing, `/app/finance/` og produktregister-endepunktet. Preview: `https://c94e51d2.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`. Release commit: `a176d29`.
- Fakturautkastet har nå en valgfri produktvelger som henter aktive varer/tjenester fra samme register og fyller inn beskrivelse, pris og MVA. Linjen kan fortsatt overstyres manuelt, og fakturaen går gjennom vanlig kontroll/godkjenning.
- Produktkortet har også et valgfritt forslag til aktiv inntektskonto. Når et produkt velges i fakturalinjen, følger kontoen med til bokføringsforslaget; manglende konto blokkerer ikke manuell fakturering.

### Regnskapsprioritert offentlig produktkart (2026-08-27)

- Hovednavigasjonen starter nå med `Regnskap`, etterfulgt av `Produkt`, abonnement og tillit. CTA-en bruker tydelig handlingstekst: `Prøv regnskapsdemo`.
- Produktkartet viser `Komplett regnskap` som én bred, fremhevet kjerneflate først. Styre, risiko, mennesker, drift, kunder, prosjekt og AI ligger samlet under en lukket `Utvid med styring`-seksjon.
- Copy forklarer eksplisitt at utvidelsene er valgfrie og bygger på regnskapet, slik at små norske AS og ENK møter det de trenger i hverdagen før nye moduler.
- Verifisert lokalt med `npm run verify` og HTTP 200/content-kontroll på `https://styr.ing/` og `https://styr.ing/capabilities/`.
- Preview: `https://40f60a54.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`. Release commit: `742a341`.

- Søk/filter i produktkartet er forenklet til én regnskapskjerne først; tilleggskortene åpnes automatisk når brukeren søker, slik at småbedrifter ikke mister treff på valgfrie arbeidsflater. Preview: `https://3f03f481.styr-ing.pages.dev`; release commit: `33f48f6`.

### Bilagsarkiv — bedre opplastingsflyt (2026-08-27)

- Bilagsarkivet viser nå filnavn og størrelse før opplasting, stopper filer over 10 MB i nettleseren og gir norsk tilbakemelding. Hintet nullstilles etter vellykket opplasting.
- Dette forbedrer den vanlige «last opp kvittering → knytt til regnskap»-flyten uten å endre lagring, tenant-isolasjon eller R2-grensen i API-et.
- Produksjon verifisert med `npm run verify` og `npm run verify:live` (123 kontroller). Preview: `https://277d82e4.styr-ing.pages.dev`; release commit: `f911fb9`.

### Bankimport — kontroller CSV før innlesing (2026-08-27)

- Bankimporten viser nå filnavn, antall gyldige linjer, inn-/ut-antall, nettobeløp og de fem første transaksjonene før brukeren importerer.
- Ugyldige linjer og filer over 10 MB varsles i forhåndsvisningen. Ingen banklinjer skrives før brukeren uttrykkelig trykker «Importer kontoutdrag».
- Forbedringen er prioritert som en vanlig regnskapsoppgave for små virksomheter; den endrer ikke kontrollsporet eller kravet om manuell godkjenning før bokføring.
- Produksjon verifisert med `npm run verify`, `git diff --check`, HTTP 200/content-kontroll på `/app/finance/` og `npm run verify:live` (123 kontroller). Preview: `https://509e1a82.styr-ing.pages.dev`; release commit: `ce4133c`.

### MVA — vis kildelinjer før godkjenning (2026-08-27)

- MVA-perioder har nå en «Se grunnlag»-visning med bokførte bilag, dato, konto, tekst, retning, sats, beregningsgrunnlag og MVA-beløp.
- Kontrollsummens begynnelse vises sammen med kildene, slik at en liten virksomhet eller regnskapsfører kan forklare totalsummen før godkjenning.
- Detaljvisningen bruker eksisterende `GET /api/mva?view=detail` og endrer ikke godkjennings- eller innsendingstrinnet.
- Produksjon verifisert med `npm run verify`, `git diff --check`, HTTP 200/content-kontroll på `/app/finance/` og `npm run verify:live` (124 kontroller, inkludert detalj-endepunktet). Preview: `https://bc565e5f.styr-ing.pages.dev`; release commit: `81b3117` (smoke-test commit `9896041`).
### Leverandørfaktura — kostnadskonto per linje (2026-08-27)

- `SupplierInvoiceQuick` viser kostnadskonto på hver fakturalinje fra virksomhetens aktive kontoplan.
- Registrert leverandør foreslår sin standard kostnadskonto på nye linjer; brukeren kan overstyre per linje.
- `POST /api/procurement` bruker leverandørens standardkonto som server-side fallback og avviser kontoer som ikke finnes aktivt på samme virksomhet.
- Flyten er fortsatt manuell og etterprøvbar før attestasjon/anvisning; ingen betaling eller automatisk bokføring er aktivert.
- Produksjon verifisert med `npm run verify:live` (124 kontroller) og HTTP 200/content-kontroll på `/app/finance/`. Preview: `https://05002bd4.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `788af19`.

### Bokføringskø — synlige bilagslinjer før godkjenning (2026-08-27)

- Åpne bokføringsforslag viser nå alle debet-/kreditlinjer, konto, tekst, summer og kildehash før godkjenning.
- Godkjenningsknappen er deaktivert hvis forslaget mangler linjer eller ikke balanserer. Dette gjør kontrollsteget forståelig for små virksomheter og regnskapsfører.
- Produksjon verifisert med `npm run verify`, `npm run verify:live` (124 kontroller) og HTTP 200/content-kontroll på `/app/finance/`. Preview: `https://05a22114.styr-ing.pages.dev`; release commit: `3a7caa9`.

### Salgsfaktura — løpende totalsjekk i utkast (2026-08-27)

- Fakturautkastet viser netto, MVA og «Å betale» i NOK mens linjene fylles ut.
- Summeringen oppdateres ved endring av antall, pris, MVA-sats, produktvalg og når nye linjer legges til. Dette gir små virksomheter en enkel kontroll før utkastet lagres.
- Produksjon verifisert med `npm run verify:live` (124 kontroller) og HTTP 200/content-kontroll på `/app/finance/`. Preview: `https://c296f207.styr-ing.pages.dev`; release commit: `f573bf5`.

### Salgsfaktura — rediger utkast før kontroll (2026-08-27)

- Utkast kan åpnes fra fakturalisten, endres og lagres på nytt med samme kunde-, dato-, linje-, MVA- og kontovalidering som ved opprettelse.
- API-handlingen `update_invoice_draft` er eksplisitt begrenset til `status='draft'`; fakturaer i kontroll, godkjent eller senere status kan ikke overskrives.
- Linjene erstattes atomisk i samme batch som fakturahodet, og endringen logges i audit-kjeden. Produksjon verifisert med `npm run verify:live` (124 kontroller) og HTTP 200/content-kontroll på `/app/finance/`. Preview: `https://356f9499.styr-ing.pages.dev`; release commit: `24d6e16`.

### Salgsfaktura — forkast utkast uten hull i nummerrekken (2026-08-27)

- Et fakturautkast kan nå forkastes fra detaljvisningen med en tydelig bekreftelse. Utkastet markeres som `cancelled` i stedet for å slettes, slik at fakturanummer, revisjonsspor og kontrollhistorikk blir bevart.
- `POST /api/finance` med `action=cancel_invoice_draft` aksepteres bare når fakturaen tilhører virksomheten og fortsatt har status `draft`; fakturaer under kontroll eller allerede godkjent kan ikke forkastes.
- Handlingen logges som `sales_invoice_draft_cancelled` og er bevisst irreversibel i brukergrensesnittet. Ingen ekstern sending eller betaling påvirkes.
- Verifisert lokalt med `npm run verify`, `git diff --check` og `npm run verify:live` (124 kontroller). Preview: `https://42fc4454.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `e8ddecb`.

### Årsoppgjør — grunnlag fra bokførte tall og noter (2026-08-27)

- Årsregnskapsklargjøring henter nå bokførte bilag for hele året og årsoppgjørsnoter fra samme virksomhet, og bygger resultat-, balanse- og kontrollsummer inn i snapshotet.
- Grunnlaget avvises hvis debet/kredit eller balansen mellom eiendeler, gjeld, egenkapital og årets resultat ikke går opp. Det hindrer at et tomt eller ufullstendig årsoppgjør ser godkjent ut.
- UI-et viser antall bokførte bilag, noter og om grunnlaget balanserer. Payload-hashen er fortsatt idempotent; endrede bokførte tall gir snapshot-konflikt.
- Dette er intern klargjøring for små norske virksomheter. Regnskapsfører må fortsatt kontrollere noter og sende manuelt inntil Regnskapsregisteret-adapter er etablert.
- Produksjon verifisert med `npm run verify:live` (124 kontroller), HTTP 200 på landing og regnskapsflate. Preview: `https://46c9d580.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `daf1ace`.

### Innkjøp — godkjenning før mottak og fakturakontroll (2026-08-27)

- Leverandørbildet har nå et eksplisitt «Godkjenn innkjøpsordre»-steg. Åpne ordre listes med leverandør og beløp, og godkjenningen logges før mottak kan registreres.
- API-et avviser varemottak på ordre som fortsatt er `pending_approval`; dette håndheves server-side og kan ikke omgås ved å kalle grensesnittet direkte.
- Leverandørfakturaen viser netto, MVA og «Å betale» løpende per linje, med samme avrundingsregel som serveren bruker ved registrering. Bare godkjente ordre kan kobles som grunnlag.
- Flyten er fortsatt SaaS-intern og manuell: ingen ekstern bestilling, bankbetaling eller EHF-transport aktiveres av denne endringen.
- Verifisert med `npm run verify`, `git diff --check`, rendret regnskapsside og `npm run verify:live` (124 kontroller). Preview: `https://cd2db669.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `60e7ff8`.

### Årsoppgjør — lesbart kontrollgrunnlag (2026-08-27)

- Årsoppgjørslisten har nå «Se tall», som henter årets bokførte bilag, resultat, balanse, gjeld/egenkapital og noter fra `GET /api/payroll?view=annual-summary`.
- Kontrollpanelet viser debet/kredit, antall bilag/noter og tydelig «Balansert» eller «Avvik» før brukeren godkjenner grunnlaget.
- Oppslaget er read-only og bygger på samme periodiseringsregler som klargjøringen; det aktiverer ikke Regnskapsregisteret eller annen ekstern innsending.
- Verifisert med `npm run verify`, `git diff --check`, HTTP 200/content-kontroll og `npm run verify:live` (125 kontroller). Preview: `https://522eac07.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `289d301`.

### Årsoppgjør — felles fortegnslogikk for klargjøring og visning (2026-08-27)

- Resultat-/balanseberegningen er flyttet til én server-side hjelpefunksjon som brukes av både `prepare_submission` og `view=annual-summary`.
- Dette hindrer at en egenkapitalpost vises med annet fortegn enn det som faktisk ble kontrollert før godkjenning.
- Produksjon verifisert med `npm run verify:live` (125 kontroller), direkte årsoppgjørs-API (HTTP 200, `balanced=true`, `balanceDifferenceMinor=0`) og HTTP 200/content-kontroll på regnskapsflaten. Preview: `https://fa3dafdc.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `3e79e0e`.

### Lønn — løpende totalsjekk før kjøring (2026-08-27)

- Lønnskjøringen viser nå samlet brutto, skattetrekk og netto mens beløp per ansatt fylles inn.
- Arbeidsgiverkostnadsteksten viser om kostnaden dekker samlet brutto, før brukeren oppretter utkastet.
- Dette er kun en klientkontroll for forståelighet; serverens validering av brutto, skattetrekk, ansatte og arbeidsgiverkostnad er fortsatt autoritativ.
- Produksjon verifisert med `npm run verify:live` (125 kontroller) og HTTP 200/content-kontroll på `/app/finance/` som bekrefter både totalsammendraget og inline-funksjonen. Preview: `https://5e62bf1f.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `d466aed`.
