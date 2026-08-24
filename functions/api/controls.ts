import { authorizeBoardRead, authorizeBoardWrite, body, json, recordAudit, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'items']);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'items') return json({ boardId, view, data: (await db.prepare('SELECT id,title,owner,frequency,status,last_review,notes,category FROM control_items WHERE board_id=? ORDER BY CASE status WHEN \'red\' THEN 1 WHEN \'yellow\' THEN 2 ELSE 3 END, title').bind(boardId).all()).results });
    const [total, green, yellow, red] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS count FROM control_items WHERE board_id=?').bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM control_items WHERE board_id=? AND status='green'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM control_items WHERE board_id=? AND status='yellow'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM control_items WHERE board_id=? AND status='red'").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { total, green, yellow, red } });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request);
    const boardId = String(value?.boardId || '').trim();
    const controlId = String(value?.controlId || '').trim();
    const status = String(value?.status || '').trim();
    if (!boardId || !controlId || !['green', 'yellow', 'red'].includes(status)) return json({ error: 'boardId_controlId_valid_status_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId);
    if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 });
    const db = requireDb(env);
    const result = await db.prepare('UPDATE control_items SET status=?, last_review=date(\'now\') WHERE id=? AND board_id=?').bind(status, controlId, boardId).run();
    if (!result.meta?.changes) return json({ error: 'control_not_found' }, { status: 404 });
    await recordAudit(db, { boardId, action: 'control_status_changed', entityType: 'control_item', entityId: controlId, userId: authorization.userId || undefined, details: { status } });
    return json({ ok: true, controlId, status, requiresHumanReview: status !== 'green' });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
