# Styr.ing — PRD-status

Sist kontrollert: 2026-08-27  
Kilde: `norwegian_styrearbeid_saas_prd.html` (versjon 8.0.0)

## Posisjoneringsgrunnlag for norsk SMB-forside (2026-08-27)

- Forsiden prioriterer nå komplett regnskap som hovedprodukt: bilag, faktura, bank, MVA, lønn, rapporter og årsoppgjør. Styre-, HCM-, CRM-, IT- og kontrollflater er fortsatt tilgjengelige, men presenteres som utvidelser etter regnskapskjernen.
- Målgruppen er formulert som små AS og ENK, inkludert eiere som driver selv, små team og virksomheter som samarbeider med regnskapsfører. Dette er et bevisst valg basert på SSBs virksomhetsstatistikk: tabell 07091 viser for 2026 103 298 bedrifter med 1–4 ansatte, 40 367 med 5–9 ansatte og 448 658 uten ansatte (hele landet, alle næringer). Kilde: [SSB tabell 07091](https://data.ssb.no/api/v0/no/table/07091).
- Budskapet følger den faktiske norske regnskapshverdagen og pliktbildet: Altinn beskriver regnskap som en løpende oppgave for virksomheten, mens markedsledende norske løsninger fremhever regnskap, faktura, bank, MVA, lønn og årsoppgjør før tillegg. Kilder: [Altinn – Regnskap](https://info.altinn.no/starte-og-drive/regnskap-og-revisjon/regnskap/), [Fiken](https://fiken.no/), [Conta](https://conta.no/), [Tripletex](https://www.tripletex.no/).
- Forsiden lover ikke aktive eksterne innsendinger, bankkoblinger eller betalinger. Den offentlige flaten bruker fortsatt illustrasjonsdata, og adapterstatus er synlig i arbeidsflytene.
- Release: `https://8ccb4637.styr-ing.pages.dev` → `https://styr.ing/`; kildecommit `393d10b`. Verifisert med `npm run verify:source`, `npm run verify:api`, `npm run build`, HTTP/content-kontroll og `npm run verify:live` (128 kontroller).

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

- Dedikert innkjøpsside synkronisert — `/procurement/` har nå samme SMB-flyt som regnskapsflaten: koble mottatt/avviksmekret leverandørfaktura uten ordre til en godkjent ordre, nullstill matching og kjør kontrollert treveis matching på nytt. Preview: `https://ab593fbb.styr-ing.pages.dev/procurement/`; produksjon: `https://styr.ing/procurement/`; kildecommit `98d5b15`. HTTP 200 og produksjonsinnhold kontrollert.

- Treveis-match styrket — mottak kan flytte en godkjent ordre til `received`, kobling/matching bruker bare gyldige ordrestatusser, og matching avviser nå eksplisitt manglende bekreftet mottak, leverandøravvik eller beløpsavvik. Avvik lagres i audit-sporet med konkrete årsaker. Preview: `https://9b41a636.styr-ing.pages.dev`; produksjon: `https://styr.ing/`; kildecommit `c4abce2`. `npm run verify:live` passerer med 127 kontroller.

- SMB-fullmaktsmatrise — eier kan nå sette beløpsgrense for fireøyne-kontroll og velge om eier kan overstyre alene. Regelen lagres tenant-avgrenset i D1, vises i både regnskaps- og innkjøpsflaten, håndheves server-side før anvisning og logges i audit-sporet. Standard er 0 kr (to ulike personer), med eieroverstyring aktivert for å unngå blokkering i enmannsforetak. Migrasjon `20260920_procurement_approval_policy.sql`; produksjonstabell verifisert i `styr-ing-db`. Preview: `https://3cc3b9fa.styr-ing.pages.dev`; produksjon: `https://styr.ing/`; kildecommit `df906ae`. `npm run verify:live` passerer med 128 kontroller.

- Dokumentasjon i bilagsflyten — åpne kvitteringer og andre arkiverte dokumenter kan velges direkte når et manuelt bilag bokføres. API-et verifiserer tenant-eierskap, at referansen faktisk finnes i riktig register og hindrer gjenbruk, og kobler dokumentet i samme D1-batch som bilag og linjer; audit-detaljene inneholder dokument-ID-ene. Preview: `https://a5a4db45.styr-ing.pages.dev/app/finance/`; produksjon: `https://styr.ing/app/finance/`; kildecommit `26e88c2`. Kilde/API/build passerer, og preview/produksjon viser feltet «Dokumentasjon (valgfritt)».

- Bankgrense tydeliggjort for små virksomheter — bankimporten viser eksplisitt at tilkobling, automatisk betaling og automatisk bokføring ikke er aktivert; hver linje må fortsatt kontrolleres og bokføres manuelt. Preview: `https://62b260d5.styr-ing.pages.dev/`; produksjon: `https://styr.ing/`; kildecommit `e8fd7bd`. Produksjonssider returnerer HTTP 200.

- Delbetalinger i bankmatch — forslag finner nå åpne kunde- og leverandørposter der bankbeløpet er mindre enn eller lik restsaldo, og sorterer forfall først. UI-et merker mindre beløp som «delbetaling». Den eksisterende serverkontrollen av retning, restsaldo, betalingkobling og kontrollert bokføring gjelder fortsatt. Preview: `https://dc423e08.styr-ing.pages.dev/`; produksjon: `https://styr.ing/`; kildecommit `1766b92`. Kilde/API/build passerer, og preview viser bankgrense-teksten.

- Leverandørordre-kobling — en mottatt eller avviksmerket leverandørfaktura uten ordre kan nå kobles til en godkjent ordre fra samme leverandør. Koblingen nullstiller matchstatus til `unmatched`, krever ny treveis matching og skriver tidligere status/ordre i audit-sporet. Preview: `https://1c490523.styr-ing.pages.dev`; produksjon: `https://styr.ing/`; kildecommit `0bc0a16`.

- Leverandøridentitet — ordre-koblingen sammenligner nå normaliserte leverandørnavn også når én side bruker leverandørregister og den andre fritekst. Ulike leverandører avvises før kobling. Preview: `https://a91a90c9.styr-ing.pages.dev`; produksjon: `https://styr.ing/`; kildecommit `f4d412c`; smoke-testen dekker autorisasjonsvakten (`127/127`).

- Leverandøravvik — treveis matching kan kjøres på nytt etter korrigering. Fakturaer med `status=exception` vises igjen i match-køen; API-et aksepterer `received` og `exception`, og revisjonssporet merker ommatching. Preview: `https://67ddb15d.styr-ing.pages.dev`; produksjon: `https://styr.ing/`; kildecommit `95f6a95`.

- Bankavstemming — komplett avvisningsløp: forslag kan nå avvises med obligatorisk forklaring, avvisningen logges i kontrollsporet, og samme banklinje kan deretter plasseres manuelt på valgt hovedbokskonto. Dette gjør feil match-forslag håndterbare for små virksomheter uten å åpne for automatisk bokføring. Preview: `https://0f6ecb8f.styr-ing.pages.dev`; produksjon: `https://styr.ing/`; kildecommit `a6c296b`.

- Navigasjonsforbedring for små norske virksomheter: primærmenyen viser nå «Regnskap», «Funksjoner», «Priser» og «Sikkerhet», mens øvrige arbeidsflater ligger samlet under «Mer». Dette holder regnskapet som førstevalg uten å skjule eksisterende funksjoner på store eller små skjermer. Preview: `https://65a8b0ec.styr-ing.pages.dev`; produksjon: `https://styr.ing/`; kildecommit `a254131`.
- Navigasjons-stabilitetsfix: dropdown-styling og åpen-tilstand bruker nå riktig `details > summary`-struktur, slik at «Mer»-menyen er lesbar og funksjonell på desktop, zoomede visninger og mobil. Preview: `https://04e4cb28.styr-ing.pages.dev`; produksjon: `https://styr.ing/`; kildecommit `6f4198f`.

- `npm run verify:source` — PASS (54 sider, 47 nettleserskript)
- `npm run verify:api` — PASS (43 API-moduler)
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS (63 sider)
- `git diff --check` — PASS
- `npm run verify:live` — PASS (128 kontroller mot `https://styr.ing` etter duplikatfakturavalidering og dokumentkobling)
- Produksjon `https://styr.ing/`: landing, `/finance/`, `/app/finance/`, `/login`, `/api/health` — HTTP 200
- Produksjonssammendrag: balanserte bilag, perioder, bank-/innkjøps-/lønnskontroller returnerer JSON fra D1
- Produksjonssmoke: `LIVE API SMOKE: PASS (125 checks against https://styr.ing)` etter siste deploy, inkludert purringsutkast-endepunkt, strukturkontroll for fakturaprofil, fakturaliste, EHF XML-guard, gjentakende fakturavisninger, lønnspersonregister og årsregnskapssammendrag
- Regnskapsflaten har nå en SMB-oppgavevelger øverst: «Før et bilag», «Send en faktura», «Registrer et kjøp», «Avstem banken», «Gjør MVA klar», «Kjør lønn», «Avslutt måneden» og «Se rapporter». Valget viser kun relevant arbeidsflyt, markerer startpunktet og kan nullstilles med «Vis hele regnskapet»; ingen API-kontrakter eller kontrollkrav hoppes over.
- Siste deploy: Cloudflare Pages `https://5e62bf1f.styr-ing.pages.dev` (produksjonsdomene `https://styr.ing/`), inkluderer bilagsarkiv på R2, globalt søk, idempotent prosjekttimer → salgsfakturakonvertering med datorekkefølge, dynamiske fakturadatoer og kreditnotakontroll, direkte fakturadetaljer via `invoiceId`, kreditnota i hovedbokskøen, kreditnota-bevisst restsaldo/betalingskontroll, server-side kalenderdato-kontroll for faktura/kreditnota/bilag, ordre/mottak/leverandørfaktura/EHF og anskaffelsesdato, dobbeltføringssikker manuell betaling for kunde- og leverandørfaktura, manuell leverandørbetaling i hurtig- og full innkjøpsflyt, restsaldo-bevisste bankmatch-forslag, robust norsk CSV-bankimport med lokal validering og server-side kalenderdato-kontroll, lønnskontroll som krever 2600/260x-konto for forskuddstrekk, korrekt inngående og utgående 12 %/15 %/25 % MVA, krav om anvisning før leverandørbetaling, restsaldo-bevisst likviditetsprognose, EHF-grunnlag med linje-/MVA-kontroll og nedlastbar UBL 2.1 / Peppol BIS Billing 3.0 XML-klargjøring, gjentakende fakturamal med månedlig/kvartalsvis/årlig idempotent utkastgenerering, kontrollert purringsutkast med checksum og godkjenning, blokkering av purringsutkast for betalte fakturaer, robust navigasjon ved smale/zoomet visninger, norsk fakturadokument med profilert godkjenning, bedrift/privatkunde, SHA-256-snapshot og utskrift/PDF, regnskap-først landingsside der tilleggskapabiliteter ligger samlet bak en tydelig utvidelse, SMB-fokusert regnskapsforside og diagnostiserbar engangsaktivering, robust quoted CSV-import for åpningsbalanse/historikk og norske tallformater, dynamiske dags-/periode-defaults i innlogget regnskapsflate og delimiter-sikker norsk CSV-tolkning, atomisk automatisk fakturanummerering per virksomhet og år, validering og tydelig duplikatbeskyttelse for kreditnotanummer, løpende lønnstotaler før kjøring, kildecommit `d466aed`
- Oppgavevelger-release: `https://2fa9f4e9.styr-ing.pages.dev` → `https://styr.ing/` (Cloudflare Pages `main`), kildecommit `c2a760a`. Verifisert med `npm run verify:source`, `npm run verify:api`, `npm run build`, `npm run verify:live` (125 kontroller) og produksjons-/preview-content-kontroll som bekrefter `finance-task-start` og «Start med oppgaven, ikke modulen.».
- Statuskort-rekkefølge-release: `https://1b962b81.styr-ing.pages.dev` → `https://styr.ing/`, kildecommit `32da569`. Statusoversikten ligger nå rett under oppgavevelgeren, før oppsett og dokumentarkiv, slik at små virksomheter ser avvik og neste handling først. `npm run verify:source`, `npm run verify:api`, `npm run build`, `git diff --check` og `npm run verify:live` (125 kontroller) passerer.
- Oppsett-veiviser-release: `https://6f7bb978.styr-ing.pages.dev` → `https://styr.ing/`, kildecommit `c87de67`. Førstegangsoppsettet viser nå live-status for kontoplan, regnskapsår, virksomhetsprofil og bankkonto, med lenker til riktig neste handling. Veiviseren er informativ og ikke-blokkerende; preview- og produksjonsinnhold er kontrollert, og `npm run verify:live` passerer med 125 kontroller.
- Handlingsbare-statuskort-release: `https://c9e039ce.styr-ing.pages.dev` → `https://styr.ing/`, kildecommit `7bd8761`. Statuskortene for bilag, bankposter, leverandøravvik og lønn åpner nå riktig oppgave direkte; preview/produksjon bekreftet, `npm run verify` og `npm run verify:live` (125 kontroller) passerer.
- Kundeområde-regnskap-først-release: `https://aa23e369.styr-ing.pages.dev` → `https://styr.ing/`, kildecommit `5ca56ef`. Etter innlogging vises den komplette regnskapsflaten før generiske styre-/risikokort; øvrige arbeidsflater er fortsatt tilgjengelige under. Preview/produksjon bekreftet og `npm run verify:live` passerer med 125 kontroller.
- Oversikts-tallfix-release: `https://6bb7c41d.styr-ing.pages.dev` → `https://styr.ing/`, kildecommit `79303bb`. D1-aggregater normaliseres nå konsekvent før de vises i statuskortene, slik at åpne lønnskontroller og øvrige tellinger aldri faller gjennom som `NaN`. Preview/produksjon bekreftet og `npm run verify:live` passerer med 125 kontroller.
- Kvittering-i-regnskapsflyt-release: `https://8cbdf73c.styr-ing.pages.dev` → `https://styr.ing/`, kildecommit `d5a3aea`. Oppgavevelgeren har nå et eget «Last opp kvittering»-startpunkt. Bilagsarkivet kan hente åpne firmakortkjøp, koble valgt kjøp til den opplastede dokument-ID-en og flytte kjøpet til «Til kontroll» i samme SMB-nære arbeidssekvens. Kortutstedelse, OCR og ekstern betaling er fortsatt ikke konfigurert. Lokal verifisering, preview/produksjonsinnhold og `npm run verify:live` (125 kontroller) passerer.
- Kortkjøp-MVA-release: `https://bef722dd.styr-ing.pages.dev` → `https://styr.ing/`, kildecommit `10839f9`. Godkjente firmakortkjøp kan nå bokføres med eksplisitt 0/12/15/25 % inngående MVA. API-et splitter brutto kortbeløp til nettokostnad og inngående MVA, krever aktiv MVA-konto når satsen er større enn 0, beholder balansert bilag og skriver sats/summer i kontrollsporet. Ingen MVA gjettet automatisk; OCR, kortutsteder og ekstern betaling er fortsatt ikke konfigurert. `npm run verify:source`, `npm run verify:api`, `npm run build`, preview/produksjonsinnhold og `npm run verify:live` (125 kontroller) passerer.

## Brukerflyt — månedsavslutning

Periodeavslutning ligger nå i den daglige regnskapsflyten i `app/finance`: kontroller åpne bankposter, fakturaer, MVA, lønn, bilagsforslag, avskrivning, balanse og SAF-T-grunnlag før godkjenning og låsing. Kontrollene lagres med hash og audit-spor; en låst periode avvises av bokføringsendepunktene.

## Brukerflyt — betaling og åpne poster

Betalinger kan kobles til åpne kunde-/leverandørposter fra samme regnskapsflate. `ReceivablesPayablesQuick` krever retning og eksakt beløp, oppretter en kontrollert betalingskobling i bank-API-et og sender deretter brukeren til bankavstemming for endelig bokføring. En kobling endrer ikke saldoen; `functions/api/bank.ts` oppdaterer fakturastatus først etter at det balanserte bankbilaget er opprettet. Bilag, bankstatus, åpne-poster-status og betalingsstatus lagres i samme D1-batch, og en idempotent retry reparerer eventuelle manglende sideeffekter. Matchforslag, godkjenning, idempotent postering og audit-spor er internt implementert. Direkte banktilkoblinger og automatisk betaling er fortsatt ikke konfigurert.

### Leverandørkreditnota — komplett kontrollert regnskapsflyt (2026-08-27)
- Små virksomheter kan nå registrere kreditnota fra leverandør mot en godkjent/matchet leverandørfaktura, med beløp, MVA, valuta, dato, unik kreditnotareferanse og kontrollert restgrense.
- Flyten følger samme fireøyneprinsipp som øvrig regnskap: utkast → kontroll → godkjenning → bilagsforslag → godkjenning av balanserte linjer → bokføring. Kreditnotaen reduserer kostnad og inngående MVA mot leverandørgjeld, med kildehash, idempotent ekstern referanse og audit-spor.
- Hovedbokskøen har nå «Leverandørkreditnota» som kilde, og leverandørkreditnotaer inngår i forslagssammendraget og live-smoketesten. Ingen automatisk leverandørrefusjon eller ekstern betalingsadapter er aktivert.
- Migrasjon `d1/migrations/20260919_supplier_credit_notes.sql` er kjørt direkte og verifisert i `styr-ing-db` før applikasjonsdeploy.
- Verifisert med `npm run verify` (kilde/API/TypeScript/build/konseptgrense), `git diff --check` og `npm run verify:live` — 126/126 kontroller mot `https://styr.ing`. Preview: `https://b8446e22.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commits: `86d7e3c`, `6f7d13d`.

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

### Firmakort — idempotent kvitteringskobling (2026-08-27)

- Kvitteringer kan nå kobles til firmakortkjøp uten at et nytt klikk eller en retry gir falsk konflikt. Samme transaksjon og samme dokumentreferanse returnerer et eksplisitt idempotent svar.
- Serveren avviser samtidig kobling mot en annen dokumentreferanse og logger bare én faktisk statusendring til `ready_for_review`. Dette beskytter små virksomheter mot doble dokumentkoblinger ved tregt nett eller gjentatt opplasting.
- Flyten er fortsatt intern SaaS-funksjonalitet: ingen kortleverandør, OCR eller ekstern betaling aktiveres av dette steget.
- Verifisert med kildeintegritet, API-integritet, TypeScript, build og live smoke. Preview: `https://bb39e4ae.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `44d0788`.

### Leverandørfaktura — dokumentvalg uten intern ID (2026-08-27)

- Bilagsarkivet viser nå åpne leverandørfakturaer når brukeren velger «Leverandørfaktura» som kildetype. Valget viser fakturanummer, leverandør og beløp og setter riktig faktura-ID ved opplasting.
- Små virksomheter trenger dermed ikke kopiere tekniske database-ID-er for å knytte PDF eller skannet faktura til riktig kjøp. Dokumentet lagres fortsatt tenant-avgrenset i R2 med SHA-256-kontrollsum og audit-spor.
- Flyten endrer ikke fakturastatus, godkjenning, betaling eller bokføring automatisk. EHF/PEPPOL-transport og OCR er fortsatt ikke konfigurert.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript og build. Preview: `https://d07373e2.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `33a561a`.

### Salgsfaktura — dokumentvalg uten intern ID (2026-08-27)

- Bilagsarkivet viser nå åpne salgsfakturaer når brukeren velger «Salgsfaktura» som kildetype. Valget viser fakturanummer, kunde og beløp og setter riktig faktura-ID ved opplasting.
- Dette gjør dokumentasjon av utsendte fakturaer enklere for små virksomheter, uten kopiering av tekniske ID-er. Kontrollsum, tenant-sperre og audit-spor fra dokumentarkivet beholdes.
- Opplastingen er kun intern dokumentasjon; den sender ikke fakturaen, endrer status eller bokfører automatisk.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, build og live smoke (125 kontroller). Preview: `https://1f0bff72.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `9443093`.

### Kort og utlegg — virksomhetskontekst for flerbedriftsbrukere (2026-08-27)
- Kortflaten velger nå aktiv virksomhet fra `/api/auth` og faller tilbake til første tilgjengelige virksomhet dersom URL-en mangler eller peker på en utilgjengelig virksomhet.
- Eksisterende kort-/transaksjons- og godkjenningskall blir automatisk tenant-avgrenset; brukeren kan ikke lenger få feil virksomhet fra den tidligere demo-ID-en `board-1`.
- Ingen betalings- eller kortutstedelsesfunksjon er aktivert; kontrollsporet og menneskelig godkjenning er uendret.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, build og live smoke (125 kontroller). Preview: `https://b9f62e73.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `930a74a`.

### Salgsfaktura og purring — ingen demo-fallback i kundeområdet (2026-08-27)
- Salgsfakturaens produktvelger og kansellering av utkast bruker nå den validerte virksomhetskonteksten fra kundeområdet.
- Purringsutkast krever eksplisitt valgt virksomhet og stopper uten fallback til offentlig demo-ID. Dette hindrer at en kunde uten ferdig kontekst leser eller skriver mot feil virksomhet.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, build og live smoke (125 kontroller). Preview: `https://e3a4f2d3.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `8b24168`.

### Fakturaflyt — publisert med full verifikasjon (2026-08-27)
- Endringen er bygget og publisert til Cloudflare Pages etter full lokal verifikasjon.
- Preview og kundeområdet svarer HTTP 200, og produksjonens API-smoke passerer 125/125 kontroller.
- Preview: `https://3ca3337d.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`.

### Forside — regnskapskjernen prioriterer leverandørfaktura (2026-08-27)
- Forsiden viser nå leverandører og innkjøp som del av regnskapskjernen, sammen med bilag, faktura, bank, MVA, lønn og rapporter.
- Styringsmodulene ligger fortsatt samlet under tilleggene, slik at små AS og ENK møter det komplette regnskapet først.
- Endringen er kun posisjonering og navigasjon; ingen backend- eller bokføringslogikk er endret.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, Astro build og live smoke (125 kontroller). Preview: `https://3ecc3c67.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `48c03e3`.

### SAF-T i innlogget rapportflate (2026-08-27)
- SAF-T Financial 1.3-eksport er nå tilgjengelig direkte under rapportene i kundeområdet, med fra/til-periode, XML-nedlasting, kontrollsum og antall bilagslinjer.
- Autoriserte brukere kan registrere eksporten i tenant-avgrenset historikk og se de fem siste kontrollsporene. Eksporten bygger kun på bokførte bilag; innsending til Skatteetaten er fortsatt ikke konfigurert.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, Astro build, konseptgrense og live smoke (125 kontroller). Preview: `https://ac944cfc.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `58b2cb0`.

### MVA i statusoversikten (2026-08-27)
- Kundeområdets statusoversikt teller nå MVA-perioder med status beregnet, godkjent eller klargjort, og åpner MVA-arbeidsflyten direkte fra kortet.
- Tallet kommer fra den valgte virksomhetens tenant-avgrensede MVA-API og inngår i samlet antall kontrollpunkter. Ingen ekstern innsending er aktivert.
- Verifisert med full lokal verifikasjon, live smoke (125 kontroller) og HTTP/content-kontroll på preview og produksjon. Preview: `https://6c45a124.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `abad532`.

### SAF-T-eksport — idempotent kontrollspor (2026-08-27)
- Gjentatt registrering av samme SAF-T Financial 1.3-eksport (virksomhet, periode og innholdskontrollsum) returnerer nå eksisterende historikkrad i stedet for å opprette duplikater.
- D1 har en unik indeks på eksportinnholdet, og samtidige faner håndteres som trygg retry. Tre identiske, eldre preview-rader ble ryddet etter kontroll; den eldste raden ble beholdt. Ingen bokførings- eller XML-data ble endret.
- Migrasjon: `d1/migrations/20260918_saf_t_export_idempotency.sql`, kjørt og verifisert i `styr-ing-db`. Verifisert med full lokal verifikasjon, live smoke (125 kontroller) og HTTP/content-kontroll. Preview: `https://5a1d8853.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `5e00838`.

### Økonomioversikt — utestående kundefordringer (2026-08-27)
- Statusoversikten viser nå samlet utestående salgsfakturabeløp i kroner, antall åpne fakturaer og forfalt beløp.
- Beløpene kommer fra det eksisterende tenant-avgrensede fakturasammendraget, med innbetalinger og bokførte kreditnotaer trukket fra. Kortet er informativt og åpner den vanlige fakturaflyten; det endrer ikke bokføring eller betalingsstatus.
- Utformingen er prioritert for små norske virksomheter: brukeren ser hva som faktisk mangler å bli betalt uten å gå gjennom en egen rapport først.
- Verifisert med full lokal verifikasjon, `git diff --check`, live smoke (125 kontroller) og HTTP/content-kontroll. Preview: `https://3d2fc147.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `d00fe69`.

### Kundefordringer — aldersfordeling og korrekt grunnlag (2026-08-27)
- Betalingsbildet viser nå aldersfordeling for åpne kundefordringer: ikke forfalt, 1–30, 31–60 og 61+ dager, med kroner og antall fakturaer.
- Fordringsgrunnlaget inkluderer bare godkjente/sendte/forfalte fakturaer med positiv restsaldo. Utkast og fakturaer til kontroll er fortsatt synlige i arbeidsflyten, men telles ikke som reelle krav mot kunden.
- Restbeløpet beregnes etter registrerte betalinger og bokførte kreditnotaer, og vises kun for valgt virksomhet.
- Verifisert med full lokal verifikasjon, live smoke (125 kontroller), HTTP/content-kontroll på produksjon og preview. Preview: `https://38732b84.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `a15975f`.

### Lønn — kostnadsoppsummering for siste kjøring (2026-08-27)
- Lønnsflaten viser nå siste kjørings brutto, netto utbetaling, arbeidsgiverpåslag og beregnede feriepenger/OTP i et kompakt sammendrag før brukeren går videre til kontroll og rapportgrunnlag.
- Tallene hentes fra de samme tenant-avgrensede lønnskjøringene og kontrollene som allerede brukes av arbeidsflyten. Påslaget er kun oppgitt arbeidsgiverkostnad minus brutto; det er ikke en ny beregning av arbeidsgiveravgift.
- Kopien presiserer fortsatt at satsene må kontrolleres og at A-melding, NAV og utbetaling ikke sendes automatisk.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, Astro build, live smoke (125 kontroller) og HTTP/content-kontroll på produksjon og preview. Preview: `https://4d2d4ed4.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `760b315`.
- Etterfølgende retry-/refresh-fix oppdaterer sammendraget automatisk etter nye lønnshandlinger (`4ed5bd5`); produksjon verifisert med `https://e512fcad.styr-ing.pages.dev` og samme live-smoke.

### Lønn — synlig kontoplanstatus før bokføringsforslag (2026-08-27)

- Lønnsbokføringen viser nå om nødvendige aktive kontoer finnes før brukeren lager et bilagsforslag: lønnskostnad (5000), forskuddstrekk (2600/260x), skyldig lønn (2930) og, når arbeidsgiveravgift inngår, kostnad (5400) og gjeld (2770).
- Manglende eller feil konto blokkerer knappen med en konkret forklaring. Når alt er klart vises kontoene samlet, og teksten minner om at serveren kontrollerer kontoene på nytt ved lagring.
- Dette gjør den vanlige SMB-lønnsflyten tryggere uten å endre bokføringsreglene eller late som NAV/A-melding er koblet til.
- Verifisert med full lokal verifikasjon, live smoke (125 kontroller) og HTTP/content-kontroll. Preview: `https://e99cd87b.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `315ca3a`.

### Leverandørgjeld — aldersfordeling i betalingsbildet (2026-08-27)
- Godkjente åpne leverandørposter vises nå i ikke forfalt, 1–30, 31–60 og 61+ dager, med restbeløp og antall fakturaer.
- Beregningen bruker faktisk rest etter delbetaling og avgrenser aldersbildet til matchede, godkjente eller bokførte poster. Mottatte fakturaer som fortsatt krever kontroll telles ikke som klare betalingsforpliktelser i dette bildet.
- Kunde- og leverandørsiden av arbeidskapitalen er dermed synlig i samme SMB-regnskapsflyt uten en separat rapport.
- Verifisert med full lokal verifikasjon, live smoke (125 kontroller) og HTTP/content-kontroll på produksjon og preview. Preview: `https://01de97b4.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `74e9d7b`.

### Regnskapsperioder — dynamiske SMB-standarder (2026-08-27)

- Periodeavslutning starter nå på inneværende måned, og årsoppgjør på inneværende år. Tidligere statiske eksempelverdier kunne gi små virksomheter feil utgangspunkt når de åpnet arbeidsflaten senere.
- Dette er kun en tryggere forhåndsutfylling i brukerflaten. API-et validerer fortsatt periode og år, og bokførings-, kontroll- og låsereglene er uendret.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, Astro build, live smoke (128 kontroller) og HTTP/content-kontroll. Preview: `https://febc3e37.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `78e5e8e`.

### Offentlige regnskapsdatoer — alltid aktuelt utgangspunkt (2026-08-27)

- Den offentlige økonomi- og likviditetsdemoen setter bilagsdato, rapportperiode og likviditetsbildedato til dagens dato ved lasting. Små virksomheter møter dermed ikke foreldede eksempelverdier fra 2026 når de utforsker regnskapskjernen.
- Dette er kun en trygg forhåndsutfylling i demo/UI. API-et validerer fortsatt datoer og perioder, og bokførings-, avstemmings- og likviditetsreglene er uendret.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, Astro build, live smoke (128 kontroller) og HTTP/content-kontroll mot produksjon. Preview: `https://6e60cd1f.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `c7631fc`.
- Etterfølgende konsistensfix i `8d62320` fjernet også den statiske eksempelverdien fra HTML-fallbacken i den offentlige bilagsformen; runtime-defaulten og produksjonsflyten er uendret.

### Reskontroeksport — del kontrollgrunnlaget med regnskapsfører (2026-08-27)

- Kundeområdet har nå egne nedlastinger for kundefordringer og leverandørgjeld i norsk semikolonseparert CSV med UTF-8 BOM, slik at filene åpnes riktig i Excel og kan deles med regnskapsfører.
- Eksporten bruker de samme tenant-avgrensede postene som betalingsbildet, inkluderer forfall, status, total, betalt, kreditert/rest og betalingsreferanse, og er lesende: ingen betaling, bokføring eller ekstern sending skjer.
- API-et krever fortsatt virksomhets-ID og lesetilgang; manglende virksomhet returnerer `boardId_required`, og produksjonskontroll viser `text/csv` med attachment-filnavn for begge eksporttypene.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, Astro build, `git diff --check`, live smoke (128 kontroller) og HTTP/content-kontroll. Preview: `https://a77247f5.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `09bad8d`.
### Lønn — oppsettsjekk før kjøring (2026-08-27)

- Lønnsflaten viser nå før-kjøring status for grunnkontoene 5000, 2600/260x, 2930, 5400 og 2770 samt om virksomhetens bankopplysning er satt.
- Sjekken er tenant-avgrenset og bruker kun interne konto- og profilregistre. Den fremstiller ikke skattetrekkskonto, banktilkobling, Altinn, NAV eller utbetaling som live; `bankAdapter` returnerer fortsatt `not_configured`.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, Astro build, `git diff --check`, live smoke (129 kontroller) og HTTP/content-kontroll. Preview: `https://875e85b5.styr-ing.pages.dev`; produksjonsdomene: `https://styr.ing/`; release commit: `44e52c6`.

### Regnskapskontroller — alltid inneværende periode (2026-08-27)

- MVA, bokføringsforslag, årsoppgjørsnoter, åpenhetslov-grunnlag, likviditetsbilde og eierregister setter nå dato/år til inneværende kalenderperiode når flaten lastes. Dette fjerner foreldede 2026-eksempler for små virksomheter som åpner løsningen senere.
- Runtime-defaultene er kun brukerhjelp; serverens validering av perioder, datoer, roller og kontrollspor er uendret. Åpningsbalanse i CSV-mal er fortsatt merket som eksempel og er ikke en produksjonsføring.
- Verifisert med kildeintegritet, inline JavaScript-syntax (204 skript), API-integritet, TypeScript, Astro build (63 sider), `git diff --check`, live smoke (129 kontroller) og HTTP-kontroll på preview `https://33339701.styr-ing.pages.dev` og produksjon `https://styr.ing/`; release commit `d023236`.

### SAF-T — årsintervall følger inneværende år (2026-08-27)

- Nedlasting og registrering av SAF-T i den offentlige regnskapsflaten bruker nå inneværende kalenderår automatisk, slik at små virksomheter ikke starter med et foreldet eksempelintervall.
- Lenken er fortsatt lesende i demoen, mens registrering krever autorisasjon; API-et validerer fortsatt tenant, periode og kontrollspor.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, Astro build (63 sider), live smoke (129 kontroller) og HTTP/content-kontroll på preview `https://5def36c7.styr-ing.pages.dev` og produksjon `https://styr.ing/`; release commit `b833ec4`.

### Regnskapsrytme — gjentakende faktura og månedsavslutning (2026-08-27)

- Gjentakende fakturamal og månedsavslutning starter nå med dagens dato automatisk. Etter nullstilling eller manglende dato fylles samme dagsaktuelle dato inn igjen, slik at små virksomheter ikke oppretter nye utkast eller kontroller med foreldede eksempelperioder.
- Dette påvirker bare forhåndsutfyllingen i brukerflaten. Gjentakende fakturaer er fortsatt utkast, og månedsavslutning krever kontroll, menneskelig godkjenning og eksplisitt låsing før bokføring eller ekstern sending.
- Verifisert med `npm run verify:source`, `npm run verify:api`, `npm run build`, `git diff --check`, live smoke (129 kontroller) og HTTP/content-kontroll på preview `https://039c1d4d.styr-ing.pages.dev` og produksjon `https://styr.ing/`; release commit `64fe6fd`.

### Regnskapsspråk — tydelig skille mellom klargjøring og ekstern sending (2026-08-27)

- Oppgavevelgeren bruker nå «Lag en faktura» og «Klargjør lønn», mens faktura- og lønnsflatene sier eksplisitt at grunnlaget lagres internt før eventuell senere innsending.
- Dette gjør kjerneflyten mer forståelig for små norske virksomheter: Styr.ing lover ikke at en faktura, lønnskjøring eller rapport allerede er sendt til en ekstern mottaker når adapteren ikke er konfigurert.
- Ekstern sending er fortsatt ikke aktivert for Stripe, bank, Altinn/Skatteetaten, EHF/PEPPOL, NAV eller andre adaptere; brukeren får i stedet et tydelig klargjort grunnlag og kontrollspor.
- Verifisert med `npm run verify:source`, `npm run verify:api`, `npm run build`, `git diff --check`, live smoke (129 kontroller) og HTTP/content-kontroll på preview `https://49890c5e.styr-ing.pages.dev` og produksjon `https://styr.ing/`; release commit `0f76365`.

### SMB-oppsett — fem konkrete startkontroller (2026-08-27)

- Første oppsett viser nå fem kontroller: kontoplan, regnskapsår, virksomhetsprofil, kunderegister og bankkonto. Kunderegisteret er skilt ut fordi en virksomhet kan være klar til å føre uten å være klar til å utstede en komplett faktura.
- Bankkonto-feltet forklarer at koblingen er manuell, at siste fire siffer er valgfritt, og at 1920 normalt brukes som hovedbokskonto. Dette gjør første bankavstemming forståelig uten å love en aktiv bankintegrasjon.
- Klarhetsstatus og lenker oppdateres fra tenant-avgrensede API-data; oppsettet er veiledende og erstatter ikke regnskapsfaglig kontroll.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, Astro build, `git diff --check`, live smoke (129 kontroller) og HTTP/content-kontroll på preview `https://daedadd9.styr-ing.pages.dev` og produksjon `https://styr.ing/`; release commit `0d85ef6`.

### Åpningsbalanse — mal følger inneværende periode (2026-08-27)

- CSV-malen for åpningsbalanse/historikk bruker nå dagens dato og periode, og filnavnet inneholder perioden. Små virksomheter møter ikke lenger en foreldet eksempelperiode når de starter opp senere.
- Konto-ID-er hentes fortsatt fra valgt virksomhet, og importen beholder balansekontroll, låst-periodekontroll, autorisasjon og idempotens.
- Verifisert med kildeintegritet, inline JavaScript-syntax, API-integritet, TypeScript, Astro build, `git diff --check`, live smoke (129 kontroller) og HTTP/content-kontroll på preview `https://1845f023.styr-ing.pages.dev` og produksjon `https://styr.ing/`; release commit `629282c`.
