import { getSession, authorizeWrite, json, requireDb, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const db = requireDb(env);
    const session = await getSession(request, env);
    const query = authorizeWrite(request, env)
      ? db.prepare("SELECT id,name,description,org_number,status,plan,created_at,updated_at FROM boards WHERE status = 'active' ORDER BY created_at DESC")
      : session
        ? db.prepare("SELECT b.id,b.name,b.description,b.org_number,b.status,b.plan,b.created_at,b.updated_at FROM boards b JOIN user_boards ub ON ub.board_id=b.id WHERE ub.user_id=? AND b.status='active' ORDER BY b.created_at DESC").bind(session.userId)
        : db.prepare("SELECT id,name,description,org_number,status,plan,created_at,updated_at FROM boards WHERE status = 'active' AND id='board-1'");
    const { results } = await query.all();
    return json({ data: results });
  }
  catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
