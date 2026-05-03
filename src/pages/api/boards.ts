// Styr.ing API Routes — Board CRUD
import type { APIRoute } from 'astro';
import { getSession } from '../../session';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  
  if (id) {
    const board = await env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(id).first();
    if (!board) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    return new Response(JSON.stringify(board), { status: 200 });
  }
  
  const boards = await env.DB.prepare(
    'SELECT b.* FROM boards b JOIN user_boards ub ON b.id = ub.board_id WHERE ub.user_id = ? ORDER BY b.created_at DESC'
  ).bind(session.userId).all();
  
  return new Response(JSON.stringify(boards.results), { status: 200 });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { name, description, org_number } = await request.json();
  if (!name) return new Response(JSON.stringify({ error: 'Name required' }), { status: 400 });

  const id = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  
  await env.DB.prepare(
    'INSERT INTO boards (id, company_id, name, description, org_number, status, plan) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, companyId, name, description || null, org_number || null, 'pilot', 'pilot').run();
  
  await env.DB.prepare(
    'INSERT INTO user_boards (user_id, board_id, role) VALUES (?, ?, ?)'
  ).bind(session.userId, id, 'owner').run();

  const board = await env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(id).first();
  return new Response(JSON.stringify(board), { status: 201 });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { id, ...updates } = await request.json();
  if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });

  const board = await env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(id).first();
  if (!board) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  const fields: string[] = [];
  const values: any[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (['name','description','status','plan','settings'].includes(k)) {
      fields.push(`${k} = ?`);
      values.push(v);
    }
  }
  if (fields.length === 0) return new Response(JSON.stringify({ error: 'No valid fields' }), { status: 400 });
  
  fields.push("updated_at = datetime('now')");
  values.push(id);
  await env.DB.prepare(`UPDATE boards SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  const updated = await env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(id).first();
  return new Response(JSON.stringify(updated), { status: 200 });
};
