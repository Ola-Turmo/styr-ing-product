import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, type Env } from './_lib';

const validNorwegianOrgNumber = (value: unknown) => {
  const digits = String(value ?? '').replace(/\s/g, '');
  if (!/^\d{9}$/.test(digits)) return false;
  const sum = [3, 2, 7, 6, 5, 4, 3, 2].reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const remainder = 11 - (sum % 11);
  return remainder !== 10 && (remainder === 11 ? 0 : remainder) === Number(digits.at(-1));
};

type Domain = 'people' | 'goals' | 'it_assets' | 'service_tickets' | 'finance_records' | 'crm_accounts' | 'contracts' | 'sustainability_items' | 'integration_registry';
const allowed: Record<Domain, string[]> = {
  people: ['id','board_id','name','email','role','department','employment_status','start_date','manager_id','created_at','updated_at'],
  goals: ['id','board_id','owner_id','title','period','status','progress','created_at','updated_at'],
  it_assets: ['id','board_id','asset_tag','name','asset_type','owner_id','status','vendor','renewal_date','created_at'],
  service_tickets: ['id','board_id','title','description','category','priority','status','assignee_id','due_date','created_at','updated_at'],
  finance_records: ['id','board_id','record_type','reference','counterparty','amount_minor','currency','status','due_date','source','created_at'],
  crm_accounts: ['id','board_id','company_name','org_number','stage','owner_id','next_action','estimated_value_minor','currency','created_at','updated_at'],
  contracts: ['id','board_id','title','counterparty','contract_type','status','start_date','end_date','owner_id','renewal_notice_date','created_at','updated_at'],
  sustainability_items: ['id','board_id','item_type','title','status','severity','scope','value_numeric','value_unit','due_date','created_at','updated_at'],
  integration_registry: ['id','board_id','key','display_name','domain','status','residency','last_sync_at','notes','created_at'],
};
const domains = new Set(Object.keys(allowed));
function validDomain(value: string): value is Domain { return domains.has(value); }

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const domain = String(params.domain || '');
  if (!validDomain(domain)) return json({ error: 'unknown_domain', allowed: [...domains] }, { status: 404 });
  try {
    const db = requireDb(env); const url = new URL(request.url); const boardId = url.searchParams.get('boardId');
    if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
    if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
    const columns = allowed[domain].filter((column) => column !== 'updated_at' || domain !== 'people');
    const { results } = await db.prepare(`SELECT ${columns.join(',')} FROM ${domain} WHERE board_id = ? ORDER BY created_at DESC LIMIT 500`).bind(boardId).all();
    return json({ data: results, domain, boardId });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const domain = String(params.domain || '');
  if (!validDomain(domain)) return json({ error: 'unknown_domain', allowed: [...domains] }, { status: 404 });
  try {
    const db = requireDb(env); const value = await body(request); const boardId = String(value?.boardId || '');
    if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId);
    if (!authorization.allowed) return json({ error: 'board_write_denied' }, { status: 401 });
    const data = (value?.data && typeof value.data === 'object') ? value.data as Record<string, unknown> : {};
    if (domain === 'crm_accounts' && data.org_number !== undefined && data.org_number !== null && String(data.org_number).trim() && !validNorwegianOrgNumber(data.org_number)) {
      return json({ error: 'org_number_invalid', detail: 'Organisasjonsnummeret må være 9 siffer med gyldig kontrollsiffer.' }, { status: 400 });
    }
    const columns = allowed[domain].filter((column) => !['id','board_id','created_at','updated_at'].includes(column) && data[column] !== undefined);
    if (!columns.length) return json({ error: 'data_required', fields: allowed[domain] }, { status: 400 });
    const recordId = id(domain.slice(0, 4)); const values = columns.map((column) => data[column]);
    await db.prepare(`INSERT INTO ${domain} (id,board_id,${columns.join(',')}) VALUES (?, ?, ${columns.map(() => '?').join(',')})`).bind(recordId, boardId, ...values).run();
    await recordAudit(db, { boardId, action: 'domain_record_created', entityType: domain, entityId: recordId, userId: authorization.userId || undefined, details: { fields: columns } });
    return json({ ok: true, id: recordId, domain, boardId }, { status: 201 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
