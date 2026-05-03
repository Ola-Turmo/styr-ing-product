import type { APIRoute } from 'astro';
import { getSession } from '../../session';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const url = new URL(request.url);
  const boardId = url.searchParams.get('board_id');
  const id = url.searchParams.get('id');
  if (id) {
    const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
    if (!meeting) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    return new Response(JSON.stringify(meeting), { status: 200 });
  }
  if (!boardId) return new Response(JSON.stringify({ error: 'board_id required' }), { status: 400 });
  const meetings = await env.DB.prepare('SELECT * FROM meetings WHERE board_id = ? ORDER BY date DESC').bind(boardId).all();
  return new Response(JSON.stringify(meetings.results), { status: 200 });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { board_id, title, date, time, location, agenda } = await request.json();
  if (!board_id || !title || !date) return new Response(JSON.stringify({ error: 'board_id, title, date required' }), { status: 400 });
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO meetings (id, board_id, title, date, time, location, agenda, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, board_id, title, date, time || null, location || null, agenda || null, session.userId).run();
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
  return new Response(JSON.stringify(meeting), { status: 201 });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { id, ...updates } = await request.json();
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(updates)) {
    if (['title','date','time','location','status','agenda','minutes'].includes(k)) { fields.push(`${k} = ?`); values.push(v); }
  }
  if (!fields.length) return new Response(JSON.stringify({ error: 'No valid fields' }), { status: 400 });
  fields.push("updated_at = datetime('now')");
  values.push(id);
  await env.DB.prepare(`UPDATE meetings SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
  return new Response(JSON.stringify(updated), { status: 200 });
};
