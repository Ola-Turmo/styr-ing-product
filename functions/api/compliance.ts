import { authorizeBoardRead, authorizeWrite, body, json, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'events']);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!authorizeBoardRead(request, env, boardId)) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'events') {
      const events = await db.prepare(`SELECT id,title,deadline,authority,type,status,notes,completed_at FROM compliance_events WHERE board_id=? ORDER BY deadline ASC`).bind(boardId).all();
      return json({ boardId, view, data: events.results });
    }
    const [total, done, overdue, upcoming] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS count FROM compliance_events WHERE board_id=?').bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM compliance_events WHERE board_id=? AND status IN ('done','waived')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM compliance_events WHERE board_id=? AND deadline < date('now') AND status NOT IN ('done','waived')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM compliance_events WHERE board_id=? AND deadline >= date('now') AND status NOT IN ('done','waived')").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { total, done, overdue, upcoming } });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
  try {
    const value = await body(request);
    const boardId = String(value?.boardId || '').trim();
    const eventId = String(value?.eventId || '').trim();
    const status = String(value?.status || '').trim();
    if (!boardId || !eventId || !['pending', 'in_progress', 'done', 'waived'].includes(status)) return json({ error: 'boardId_eventId_valid_status_required' }, { status: 400 });
    const result = await requireDb(env).prepare("UPDATE compliance_events SET status=?, completed_at=CASE WHEN ? IN ('done','waived') THEN datetime('now') ELSE NULL END WHERE id=? AND board_id=?").bind(status, status, eventId, boardId).run();
    if (!result.meta?.changes) return json({ error: 'event_not_found' }, { status: 404 });
    return json({ ok: true, eventId, status, requiresHumanReview: status !== 'done' && status !== 'waived' });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
