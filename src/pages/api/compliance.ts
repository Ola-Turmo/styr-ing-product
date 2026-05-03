import type { APIRoute } from 'astro';
import { getSession } from '../../session';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const url = new URL(request.url);
  const boardId = url.searchParams.get('board_id');
  if (!boardId) return new Response(JSON.stringify({ error: 'board_id required' }), { status: 400 });
  const events = await env.DB.prepare('SELECT * FROM compliance_events WHERE board_id = ? ORDER BY deadline ASC').bind(boardId).all();
  return new Response(JSON.stringify(events.results), { status: 200 });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { board_id, title, deadline, authority, type } = await request.json();
  if (!board_id || !title || !deadline) return new Response(JSON.stringify({ error: 'board_id, title, deadline required' }), { status: 400 });
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO compliance_events (id, board_id, title, deadline, authority, type) VALUES (?, ?, ?, ?, ?, ?)').bind(id, board_id, title, deadline, authority || null, type || 'compliance').run();
  const event = await env.DB.prepare('SELECT * FROM compliance_events WHERE id = ?').bind(id).first();
  return new Response(JSON.stringify(event), { status: 201 });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { id, ...updates } = await request.json();
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  const fields = []; const values = [];
  for (const [k, v] of Object.entries(updates)) {
    if (['title','deadline','authority','type','status','notes'].includes(k)) { fields.push(`${k} = ?`); values.push(v); }
  }
  if (updates.status === 'done') { fields.push('completed_at = datetime(\'now\')'); }
  if (!fields.length) return new Response(JSON.stringify({ error: 'No valid fields' }), { status: 400 });
  values.push(id);
  await env.DB.prepare(`UPDATE compliance_events SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  const updated = await env.DB.prepare('SELECT * FROM compliance_events WHERE id = ?').bind(id).first();
  return new Response(JSON.stringify(updated), { status: 200 });
};
