import { authorizeBoardRead, json, requireDb, type Env } from './_lib';

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  snippet: string;
  source: string;
  sourceId: string;
}

type SearchSpec = {
  table: string;
  type: string;
  title: string;
  snippet: string;
  source: string;
};

// Fixed SQL expressions keep the endpoint parameterised while still giving
// users one search box for the whole operating system.
const specs: SearchSpec[] = [
  { table: 'risks', type: 'Risiko', title: 'title', snippet: "coalesce(level,'') || ' · ' || coalesce(status,'') || ' · Eier: ' || coalesce(owner,'')", source: 'Risikoregister' },
  { table: 'action_items', type: 'Oppgave', title: 'title', snippet: "coalesce(priority,'') || ' · ' || coalesce(status,'') || ' · Ansvarlig: ' || coalesce(assigned_to,'')", source: 'Oppfølging' },
  { table: 'resolutions', type: 'Vedtak', title: "number || ' · ' || title", snippet: "coalesce(status,'') || ' · ' || coalesce(signature_status,'')", source: 'Styrevedtak' },
  { table: 'board_documents', type: 'Dokument', title: 'title', snippet: "coalesce(category,'') || ' · v' || coalesce(version,'') || ' · ' || coalesce(status,'')", source: 'Dokumentarkiv' },
  { table: 'meetings', type: 'Møte', title: 'title', snippet: "coalesce(date,'') || ' · ' || coalesce(status,'')", source: 'Møter' },
  { table: 'people', type: 'Person', title: 'name', snippet: "coalesce(role,'') || ' · ' || coalesce(department,'') || ' · ' || coalesce(employment_status,'')", source: 'Mennesker' },
  { table: 'job_requisitions', type: 'Stilling', title: 'title', snippet: "coalesce(department,'') || ' · ' || coalesce(status,'') || ' · ' || coalesce(location,'')", source: 'Rekruttering' },
  { table: 'candidates', type: 'Kandidat', title: 'name', snippet: "coalesce(stage,'') || ' · Score: ' || coalesce(score,'') || ' · Samtykke: ' || coalesce(consent_status,'')", source: 'Rekruttering' },
  { table: 'goals', type: 'Mål', title: 'title', snippet: "coalesce(period,'') || ' · ' || coalesce(status,'') || ' · Fremdrift: ' || progress || '%'", source: 'Mål og OKR' },
  { table: 'handbook_documents', type: 'Håndbok', title: 'title', snippet: "coalesce(category,'') || ' · v' || coalesce(version,'') || ' · ' || coalesce(status,'')", source: 'Personalhåndbok' },
  { table: 'training_courses', type: 'Kurs', title: 'title', snippet: "coalesce(category,'') || ' · ' || coalesce(status,'') || ' · ' || coalesce(duration_minutes,'') || ' min'", source: 'LMS' },
  { table: 'it_assets', type: 'IT-eiendel', title: "asset_tag || ' · ' || name", snippet: "coalesce(asset_type,'') || ' · ' || coalesce(status,'') || ' · ' || coalesce(vendor,'')", source: 'IT og utstyr' },
  { table: 'service_tickets', type: 'Sak', title: 'title', snippet: "coalesce(priority,'') || ' · ' || coalesce(status,'') || ' · ' || coalesce(category,'')", source: 'Service desk' },
  { table: 'saas_subscriptions', type: 'SaaS', title: 'name', snippet: "coalesce(vendor,'') || ' · Fornyes: ' || coalesce(renewal_date,'') || ' · Utnyttelse: ' || coalesce(utilization_percent,'') || '%'", source: 'SaaS-forbruk' },
  { table: 'access_reviews', type: 'Tilgang', title: "system_name || ' · ' || access_level", snippet: "coalesce(decision,'') || ' · ' || coalesce(reason,'')", source: 'Tilgangsrevisjon' },
  { table: 'finance_records', type: 'Økonomi', title: "reference || ' · ' || coalesce(counterparty,'')", snippet: "coalesce(record_type,'') || ' · ' || coalesce(status,'') || ' · ' || coalesce(currency,'NOK')", source: 'Økonomi' },
  { table: 'fixed_assets', type: 'Anleggsmiddel', title: "asset_number || ' · ' || name", snippet: "coalesce(category,'') || ' · ' || coalesce(status,'') || ' · Skattegruppe ' || coalesce(tax_group,'')", source: 'Anleggsregister' },
  { table: 'payroll_runs', type: 'Lønnskjøring', title: "period || ' · Lønn'", snippet: "coalesce(status,'') || ' · Brutto: ' || coalesce(gross_minor,'')", source: 'Lønn' },
  { table: 'compliance_submissions', type: 'Innsending', title: "submission_type || ' · ' || period", snippet: "coalesce(status,'') || ' · ' || coalesce(notes,'')", source: 'Innsendinger' },
  { table: 'liquidity_snapshots', type: 'Likviditet', title: "as_of_date || ' · Likviditetsbilde'", snippet: "coalesce(status,'') || ' · Runway: ' || coalesce(runway_months,'') || ' måneder'", source: 'Likviditet' },
  { table: 'collection_cases', type: 'Innkrevingssak', title: 'reference', snippet: "coalesce(status,'') || ' · ' || coalesce(next_action,'')", source: 'Innkrevingsspor' },
  { table: 'card_transactions', type: 'Kortkjøp', title: "merchant || ' · ' || transaction_date", snippet: "coalesce(status,'') || ' · ' || coalesce(category,'') || ' · ' || coalesce(amount_minor,'')", source: 'Kort og utlegg' },
  { table: 'purchase_orders', type: 'Bestilling', title: "order_number || ' · ' || supplier_name", snippet: "coalesce(status,'') || ' · ' || coalesce(total_minor,'')", source: 'Innkjøp' },
  { table: 'supplier_invoices', type: 'Leverandørfaktura', title: "invoice_number || ' · ' || supplier_name", snippet: "coalesce(match_status,'') || ' · ' || coalesce(status,'')", source: 'Leverandørfakturaer' },
  { table: 'crm_accounts', type: 'Kunde', title: 'company_name', snippet: "coalesce(stage,'') || ' · Neste steg: ' || coalesce(next_action,'')", source: 'Kundeoppfølging' },
  { table: 'contracts', type: 'Avtale', title: 'title', snippet: "coalesce(counterparty,'') || ' · ' || coalesce(status,'') || ' · Fornyelse: ' || coalesce(renewal_notice_date,'')", source: 'Avtaler' },
  { table: 'quotes', type: 'Tilbud', title: 'title', snippet: "coalesce(status,'') || ' · ' || coalesce(currency,'NOK') || ' · ' || coalesce(total_minor,'')", source: 'Tilbud' },
  { table: 'sales_rooms', type: 'Salgsrom', title: 'name', snippet: "coalesce(status,'') || ' · ' || coalesce(buyer_contact,'')", source: 'Salgsrom' },
  { table: 'customer_subscriptions', type: 'Abonnement', title: 'plan_name', snippet: "coalesce(status,'') || ' · Fornyelse: ' || coalesce(renewal_date,'')", source: 'Abonnement' },
  { table: 'customer_cases', type: 'Kundesak', title: 'title', snippet: "coalesce(priority,'') || ' · ' || coalesce(status,'')", source: 'Kundeservice' },
  { table: 'fleet_vehicles', type: 'Kjøretøy', title: "registration || ' · ' || make_model", snippet: "coalesce(status,'') || ' · Neste kontroll: ' || coalesce(next_inspection_date,'')", source: 'Flåte' },
  { table: 'trip_logs', type: 'Kjørebok', title: "start_location || ' → ' || end_location", snippet: "coalesce(trip_type,'') || ' · ' || coalesce(status,'') || ' · ' || coalesce(purpose,'')", source: 'Kjørebok' },
  { table: 'fleet_maintenance', type: 'Vedlikehold', title: 'title', snippet: "coalesce(status,'') || ' · Frist: ' || coalesce(due_date,'')", source: 'Flåte' },
  { table: 'facilities', type: 'FDV-objekt', title: 'name', snippet: "coalesce(address,'') || ' · ' || coalesce(status,'')", source: 'FDV' },
  { table: 'projects', type: 'Prosjekt', title: "code || ' · ' || name", snippet: "coalesce(status,'') || ' · ' || coalesce(billing_model,'')", source: 'Prosjekt' },
  { table: 'project_invoice_drafts', type: 'Fakturautkast', title: "period || ' · ' || id", snippet: "coalesce(status,'') || ' · Beløp: ' || coalesce(amount_minor,'')", source: 'Prosjektfakturering' },
  { table: 'time_entries', type: 'Timer', title: 'description', snippet: "coalesce(status,'') || ' · ' || coalesce(work_date,'') || ' · ' || coalesce(minutes,'') || ' min'", source: 'Timeføring' },
  { table: 'contract_reviews', type: 'Avtalegjennomgang', title: "coalesce(decision,'Kontraktsgjennomgang')", snippet: "coalesce(status,'') || ' · Frist: ' || coalesce(due_date,'')", source: 'Avtaler' },
  { table: 'mandates', type: 'Fullmakt', title: 'scope', snippet: "coalesce(mandate_type,'') || ' · ' || coalesce(status,'') || ' · Gyldig til: ' || coalesce(valid_until,'')", source: 'Fullmaktsregister' },
  { table: 'equity_holders', type: 'Eier', title: 'holder_name', snippet: "coalesce(holder_type,'') || ' · ' || coalesce(ownership_percent,'') || '% · Klasse ' || coalesce(share_class,'')", source: 'Eierskap' },
  { table: 'sustainability_items', type: 'HMS/ESG', title: 'title', snippet: "coalesce(item_type,'') || ' · ' || coalesce(status,'') || ' · ' || coalesce(severity,'')", source: 'HMS og ESG' },
];

export async function searchBoard(db: D1Database, boardId: string, query: string): Promise<SearchResult[]> {
  const needle = `%${query.trim().slice(0, 100)}%`;
  const rows = await Promise.all(specs.map(async (spec) => {
    const statement = db.prepare(
      `SELECT id, ${spec.title} AS title, ${spec.snippet} AS snippet FROM ${spec.table} WHERE board_id = ? AND (${spec.title} LIKE ? OR ${spec.snippet} LIKE ?) ORDER BY rowid DESC LIMIT 8`,
    ).bind(boardId, needle, needle);
    const result = await statement.all<Record<string, unknown>>();
    return result.results.map((row) => ({
      id: String(row.id),
      type: spec.type,
      title: String(row.title || ''),
      snippet: String(row.snippet || '').replace(/\s+/g, ' ').trim(),
      source: spec.source,
      sourceId: String(row.id),
    }));
  }));
  return rows.flat().slice(0, 50);
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const query = (url.searchParams.get('q') || '').trim();
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (query.length < 2) return json({ error: 'query_too_short', minLength: 2 }, { status: 400 });
  if (!authorizeBoardRead(request, env, boardId)) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const results = await searchBoard(requireDb(env), boardId, query);
    return json({ boardId, query, data: results, count: results.length, mode: 'semantic-contract', humanReviewRequired: true });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
