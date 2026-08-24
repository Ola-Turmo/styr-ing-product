import { json, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let database = 'not_configured';
  if (env.DB) { try { await env.DB.prepare('SELECT 1 AS ok').first(); database = 'ready'; } catch { database = 'error'; } }
  return json({ ok: database !== 'error', service: 'styr.ing', database, mode: 'api-contract', timestamp: new Date().toISOString() });
};
