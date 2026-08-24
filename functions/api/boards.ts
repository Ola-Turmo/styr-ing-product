import { json, requireDb, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try { const db = requireDb(env); const { results } = await db.prepare("SELECT id,name,description,org_number,status,plan,created_at,updated_at FROM boards WHERE status = 'active' ORDER BY created_at DESC").all(); return json({ data: results }); }
  catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
