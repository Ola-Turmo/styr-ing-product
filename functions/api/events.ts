import { body, id, json, requireDb, type Env } from './_lib';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try { const db = requireDb(env); const value = await body(request); const eventType = String(value?.eventType || ''); const boardId = value?.boardId ? String(value.boardId) : null; if (!eventType) return json({ error: 'eventType_required' }, { status: 400 }); const payload = JSON.stringify(value?.payload ?? {}); await db.prepare('INSERT INTO api_events (id,board_id,event_type,payload) VALUES (?,?,?,?)').bind(id('event'), boardId, eventType, payload).run(); return json({ ok: true, accepted: true }); }
  catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
