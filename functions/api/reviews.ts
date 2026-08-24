import { authorizeBoardRead, authorizeWrite, body, id, json, requireDb, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try { const db = requireDb(env); const url = new URL(request.url); const boardId = url.searchParams.get('boardId'); const type = url.searchParams.get('entityType'); if (!boardId || !type) return json({ error: 'boardId_and_entityType_required' }, { status: 400 }); if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 }); const { results } = await db.prepare('SELECT id,entity_type,entity_id,reviewed_by,reviewed_at FROM review_states WHERE board_id = ? AND entity_type = ? ORDER BY reviewed_at DESC').bind(boardId, type).all(); return json({ data: results }); }
  catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
  try { const db = requireDb(env); const value = await body(request); const boardId = String(value?.boardId || ''); const entityType = String(value?.entityType || ''); const entityId = String(value?.entityId || ''); const reviewedBy = String(value?.reviewedBy || 'demo-user'); if (!boardId || !entityType || !entityId) return json({ error: 'boardId_entityType_entityId_required' }, { status: 400 }); await db.prepare("INSERT INTO review_states (id,board_id,entity_type,entity_id,reviewed_by) VALUES (?,?,?,?,?) ON CONFLICT(board_id,entity_type,entity_id) DO UPDATE SET reviewed_by=excluded.reviewed_by, reviewed_at=datetime('now')").bind(id('review'), boardId, entityType, entityId, reviewedBy).run(); return json({ ok: true, boardId, entityType, entityId }); }
  catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
  try { const db = requireDb(env); const value = await body(request); const boardId = String(value?.boardId || ''); const entityType = String(value?.entityType || ''); const entityId = String(value?.entityId || ''); if (!boardId || !entityType || !entityId) return json({ error: 'boardId_entityType_entityId_required' }, { status: 400 }); await db.prepare('DELETE FROM review_states WHERE board_id = ? AND entity_type = ? AND entity_id = ?').bind(boardId, entityType, entityId).run(); return json({ ok: true }); }
  catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
