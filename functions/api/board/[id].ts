import { json, requireDb, type Env } from '../_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    const db = requireDb(env); const id = String(params.id);
    const board = await db.prepare('SELECT id,name,description,org_number,status,plan,created_at,updated_at FROM boards WHERE id = ?').bind(id).first();
    if (!board) return json({ error: 'not_found' }, { status: 404 });
    const [members, meetings, actions, resolutions, documents, risks] = await Promise.all([
      db.prepare('SELECT id,name,email,role,since,until FROM board_members WHERE board_id = ? ORDER BY created_at').bind(id).all(),
      db.prepare('SELECT id,title,date,time,location,status FROM meetings WHERE board_id = ? ORDER BY date DESC').bind(id).all(),
      db.prepare('SELECT id,title,description,assigned_to,due_date,priority,status FROM action_items WHERE board_id = ? ORDER BY due_date').bind(id).all(),
      db.prepare('SELECT id,number,title,status,signature_status,votes_for,votes_against,votes_abstain,adoption_date FROM resolutions WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,title,category,type,status,version,created_at FROM board_documents WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT id,code,title,level,trend,owner,status,due_date FROM risks WHERE board_id = ? ORDER BY created_at DESC').bind(id).all(),
    ]);
    return json({ data: { board, members: members.results, meetings: meetings.results, actions: actions.results, resolutions: resolutions.results, documents: documents.results, risks: risks.results } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
