# Styr.ing — PRD-status

Sist kontrollert: 2026-08-26  
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
- Produksjonssmoke: `LIVE API SMOKE: PASS (120 checks against https://styr.ing)` etter siste deploy, inkludert purringsutkast-endepunkt, strukturkontroll for fakturaprofil, fakturaliste, EHF XML-guard, gjentakende fakturavisninger og lønnspersonregister
- Siste deploy: Cloudflare Pages `https://bbc8164b.styr-ing.pages.dev` (produksjonsdomene `https://styr.ing/`), inkluderer bilagsarkiv på R2, globalt søk, idempotent prosjekttimer → salgsfakturakonvertering med datorekkefølge, dynamiske fakturadatoer og kreditnotakontroll, direkte fakturadetaljer via `invoiceId`, kreditnota i hovedbokskøen, kreditnota-bevisst restsaldo/betalingskontroll, server-side kalenderdato-kontroll for faktura/kreditnota/bilag, ordre/mottak/leverandørfaktura/EHF og anskaffelsesdato, dobbeltføringssikker manuell betaling for kunde- og leverandørfaktura, manuell leverandørbetaling i hurtig- og full innkjøpsflyt, restsaldo-bevisste bankmatch-forslag, robust norsk CSV-bankimport med lokal validering og server-side kalenderdato-kontroll, lønnskontroll som krever 2600/260x-konto for forskuddstrekk, korrekt inngående og utgående 12 %/15 %/25 % MVA, krav om anvisning før leverandørbetaling, restsaldo-bevisst likviditetsprognose, EHF-grunnlag med linje-/MVA-kontroll og nedlastbar UBL 2.1 / Peppol BIS Billing 3.0 XML-klargjøring, gjentakende fakturamal med månedlig/kvartalsvis/årlig idempotent utkastgenerering, kontrollert purringsutkast med checksum og godkjenning, blokkering av purringsutkast for betalte fakturaer, robust navigasjon ved smale/zoomet visninger, norsk fakturadokument med profilert godkjenning, bedrift/privatkunde, SHA-256-snapshot og utskrift/PDF, regnskap-først landingsside der tilleggskapabiliteter ligger samlet bak en tydelig utvidelse, SMB-fokusert regnskapsforside og diagnostiserbar engangsaktivering, robust quoted CSV-import for åpningsbalanse/historikk og norske tallformater, dynamiske dags-/periode-defaults i innlogget regnskapsflate og delimiter-sikker norsk CSV-tolkning, atomisk automatisk fakturanummerering per virksomhet og år, validering og tydelig duplikatbeskyttelse for kreditnotanummer, kildecommit `bb75a82`

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
- Produksjonsdeploy: Cloudflare Pages `https://d9e5d023.styr-ing.pages.dev` på branch `main`, koblet til `https://styr.ing/`.

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
