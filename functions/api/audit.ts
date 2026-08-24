import { authorizeBoardRead, json, requireDb, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200);
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const rows = await requireDb(env).prepare('SELECT id,action,entity_type,entity_id,details,created_at FROM audit_log WHERE board_id=? ORDER BY created_at DESC LIMIT ?').bind(boardId, limit).all();
    return json({ boardId, data: rows.results });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
