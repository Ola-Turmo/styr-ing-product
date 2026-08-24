import { authorizeBoardRead, json, requireDb, type Env } from '../_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  try {
    const db = requireDb(env); const id = String(params.id);
    if (!(await authorizeBoardRead(request, env, id))) return json({ error: 'board_access_denied' }, { status: 403 });
    const board = await db.prepare('SELECT id,name,description,org_number,status,plan,created_at,updated_at FROM boards WHERE id = ?').bind(id).first();
    if (!board) return json({ error: 'not_found' }, { status: 404 });
    const [members, meetings, actions, resolutions, documents, risks, people, goals, assets, tickets, finance, crm, contracts, sustainability, integrations] = await Promise.all([
      db.prepare('SELECT id,name,email,role,since,until FROM board_members WHERE board_id = ? ORDER BY created_at').bind(id).all(),
      db.prepare('SELECT id,title,date,time,location,status FROM meetings WHERE board_id = ? ORDER BY date DESC').bind(id).all(),
      db.prepare('SELECT id,title,description,assigned_to,due_date,priority,status FROM action_items WHERE board_id = ? ORDER BY due_date').bind(id).all(),
      db.prepare('SELECT id,number,title,status,signature_status,votes_for,votes_against,votes_abstain,adoption_date FROM resolutions WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,title,category,type,status,version,created_at FROM board_documents WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,code,title,level,trend,owner,status,due_date FROM risks WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,name,email,role,department,employment_status,start_date,manager_id FROM people WHERE board_id = ? ORDER BY created_at').bind(id).all(),
      db.prepare('SELECT id,owner_id,title,period,status,progress FROM goals WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,asset_tag,name,asset_type,owner_id,status,vendor,renewal_date FROM it_assets WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,title,category,priority,status,assignee_id,due_date FROM service_tickets WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,record_type,reference,counterparty,amount_minor,currency,status,due_date,source FROM finance_records WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,company_name,org_number,stage,owner_id,next_action,estimated_value_minor,currency FROM crm_accounts WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,title,counterparty,contract_type,status,start_date,end_date,owner_id,renewal_notice_date FROM contracts WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,item_type,title,status,severity,scope,value_numeric,value_unit,due_date FROM sustainability_items WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,key,display_name,domain,status,residency,last_sync_at,notes FROM integration_registry WHERE board_id = ? ORDER BY created_at').bind(id).all(),
    ]);
    return json({ data: { board, members: members.results, meetings: meetings.results, actions: actions.results, resolutions: resolutions.results, documents: documents.results, risks: risks.results, people: people.results, goals: goals.results, assets: assets.results, tickets: tickets.results, finance: finance.results, crm: crm.results, contracts: contracts.results, sustainability: sustainability.results, integrations: integrations.results } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
