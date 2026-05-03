import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const { name, email, company, board, employees, message } = await request.json();
  if (!name || !email) return new Response(JSON.stringify({ error: 'name and email required' }), { status: 400 });
  
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO demo_requests (id, name, email, company, board, employees, message, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, name, email, company || null, board || null, employees || null, message || null, 'website').run();
  
  return new Response(JSON.stringify({ ok: true, id }), { status: 201 });
};
