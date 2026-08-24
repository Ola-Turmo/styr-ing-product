import { authorizeBoardRead, authorizeWrite, body, id, json, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'risks', 'actions']);
const levels = ['critical', 'high', 'medium', 'low'];
const statuses = ['open', 'treating', 'monitoring', 'closed'];

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url); const boardId = (url.searchParams.get('boardId') || '').trim(); const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!authorizeBoardRead(request, env, boardId)) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'risks') return json({ boardId, view, data: (await db.prepare(`SELECT id,code,title,level,trend,owner,status,treatment,due_date,created_at,updated_at FROM risks WHERE board_id=? ORDER BY CASE level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,due_date`).bind(boardId).all()).results });
    if (view === 'actions') return json({ boardId, view, data: (await db.prepare(`SELECT id,title,description,assigned_to,due_date,priority,status,completed_at FROM action_items WHERE board_id=? ORDER BY CASE status WHEN 'blocked' THEN 1 WHEN 'open' THEN 2 WHEN 'in_progress' THEN 3 ELSE 4 END,due_date`).bind(boardId).all()).results });
    const [total, critical, open, overdue, actions] = await Promise.all([
      db.prepare('SELECT COUNT(*) count FROM risks WHERE board_id=?').bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM risks WHERE board_id=? AND level='critical' AND status <> 'closed'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM risks WHERE board_id=? AND status <> 'closed'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM risks WHERE board_id=? AND status <> 'closed' AND due_date IS NOT NULL AND due_date < date('now')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM action_items WHERE board_id=? AND status IN ('open','in_progress','blocked')").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { total, critical, open, overdue, actions } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
  try {
    const value = await body(request); const boardId = String(value?.boardId || '').trim(); const action = String(value?.action || '').trim();
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    const db = requireDb(env);
    if (action === 'create_risk') {
      const title = String(value?.title || '').trim(); const level = String(value?.level || 'medium');
      if (!title || !levels.includes(level)) return json({ error: 'title_and_valid_level_required' }, { status: 400 });
      const riskId = id('risk'); const code = String(value?.code || `R-${Date.now().toString().slice(-5)}`);
      await db.prepare("INSERT INTO risks (id,board_id,code,title,level,trend,owner,status,treatment,due_date) VALUES (?,?,?,?,?,'stable',?,'open',?,?)").bind(riskId, boardId, code, title, level, value?.owner || null, value?.treatment || null, value?.dueDate || null).run();
      return json({ ok: true, action, id: riskId, status: 'open', requiresHumanReview: true }, { status: 201 });
    }
    if (action === 'update_risk') {
      const riskId = String(value?.riskId || '').trim(); const status = String(value?.status || '').trim();
      if (!riskId || !statuses.includes(status)) return json({ error: 'riskId_and_valid_status_required' }, { status: 400 });
      const result = await db.prepare('UPDATE risks SET status=?,level=COALESCE(?,level),trend=COALESCE(?,trend),treatment=COALESCE(?,treatment),due_date=COALESCE(?,due_date),updated_at=datetime(\'now\') WHERE id=? AND board_id=?').bind(status, value?.level || null, value?.trend || null, value?.treatment || null, value?.dueDate || null, riskId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'risk_not_found' }, { status: 404 });
      return json({ ok: true, action, riskId, status, requiresHumanReview: true });
    }
    if (action === 'complete_action') {
      const actionId = String(value?.actionId || '').trim(); if (!actionId) return json({ error: 'actionId_required' }, { status: 400 });
      const result = await db.prepare("UPDATE action_items SET status='completed',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND board_id=? AND status <> 'completed'").bind(actionId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'action_not_open_or_found' }, { status: 409 });
      return json({ ok: true, action, actionId, status: 'completed' });
    }
    return json({ error: 'unknown_action', allowed: ['create_risk', 'update_risk', 'complete_action'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
