import type { APIRoute } from 'astro';
import { getSession } from '../../session';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const url = new URL(request.url);
  const boardId = url.searchParams.get('board_id');
  if (!boardId) return new Response(JSON.stringify({ error: 'board_id required' }), { status: 400 });
  const members = await env.DB.prepare('SELECT * FROM board_members WHERE board_id = ? ORDER BY created_at ASC').bind(boardId).all();
  return new Response(JSON.stringify(members.results), { status: 200 });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { board_id, name, email, role, phone } = await request.json();
  if (!board_id || !name || !email) return new Response(JSON.stringify({ error: 'board_id, name, email required' }), { status: 400 });
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO board_members (id, board_id, name, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)').bind(id, board_id, name, email, phone || null, role || 'member').run();
  const member = await env.DB.prepare('SELECT * FROM board_members WHERE id = ?').bind(id).first();
  return new Response(JSON.stringify(member), { status: 201 });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  await env.DB.prepare('DELETE FROM board_members WHERE id = ?').bind(id).run();
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
