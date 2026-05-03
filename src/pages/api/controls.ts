import type { APIRoute } from 'astro';
import { getSession } from '../../session';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const url = new URL(request.url);
  const boardId = url.searchParams.get('board_id');
  if (!boardId) return new Response(JSON.stringify({ error: 'board_id required' }), { status: 400 });
  const items = await env.DB.prepare('SELECT * FROM control_items WHERE board_id = ? ORDER BY created_at DESC').bind(boardId).all();
  return new Response(JSON.stringify(items.results), { status: 200 });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { board_id, title, owner, frequency, category } = await request.json();
  if (!board_id || !title) return new Response(JSON.stringify({ error: 'board_id, title required' }), { status: 400 });
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO control_items (id, board_id, title, owner, frequency, category) VALUES (?, ?, ?, ?, ?, ?)').bind(id, board_id, title, owner || null, frequency || null, category || null).run();
  const item = await env.DB.prepare('SELECT * FROM control_items WHERE id = ?').bind(id).first();
  return new Response(JSON.stringify(item), { status: 201 });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { id, ...updates } = await request.json();
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  const fields = []; const values = [];
  for (const [k, v] of Object.entries(updates)) {
    if (['title','owner','frequency','status','notes','category'].includes(k)) { fields.push(`${k} = ?`); values.push(v); }
  }
  if (updates.status) { fields.push("last_review = datetime('now')"); }
  if (!fields.length) return new Response(JSON.stringify({ error: 'No valid fields' }), { status: 400 });
  values.push(id);
  await env.DB.prepare(`UPDATE control_items SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  const updated = await env.DB.prepare('SELECT * FROM control_items WHERE id = ?').bind(id).first();
  return new Response(JSON.stringify(updated), { status: 200 });
};
