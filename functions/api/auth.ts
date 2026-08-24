import { authorizeWrite, body, createSession, destroySession, getSession, hashPassword, json, requireDb, sessionCookie, verifyPassword, type Env } from './_lib';

function publicUser(user: { id: string; email: string; name: string; role: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const session = await getSession(request, env);
  if (!session) return json({ authenticated: false, user: null });
  const boards = env.DB ? (await env.DB.prepare('SELECT b.id,b.name,ub.role FROM user_boards ub JOIN boards b ON b.id=ub.board_id WHERE ub.user_id=? AND b.status=? ORDER BY b.name').bind(session.userId, 'active').all()).results : [];
  return json({ authenticated: true, user: publicUser({ id: session.userId, email: session.email, name: session.name, role: session.role }), boards });
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const value = await body(request);
  const action = String(value?.action || 'login').trim();
  if (action === 'logout') {
    await destroySession(request, env);
    return json({ ok: true }, { headers: { 'set-cookie': sessionCookie('', 0) } });
  }
  if (action === 'invite_user') {
    if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
    const email = String(value?.email || '').trim().toLowerCase();
    const name = String(value?.name || '').trim().slice(0, 160);
    const password = String(value?.password || '');
    const boardId = String(value?.boardId || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || password.length < 12 || !boardId) return json({ error: 'valid_email_name_password_and_boardId_required' }, { status: 400 });
    try {
      const db = requireDb(env);
      const userId = `usr-${crypto.randomUUID()}`;
      await db.prepare('INSERT INTO users (id,email,name,password_hash) VALUES (?,?,?,?)').bind(userId, email, name, await hashPassword(password)).run();
      await db.prepare("INSERT INTO user_boards (user_id,board_id,role) VALUES (?,?,?)").bind(userId, boardId, String(value?.role || 'viewer')).run();
      return json({ ok: true, user: { id: userId, email, name, role: 'user' }, boardId }, { status: 201 });
    } catch (error) { return json({ error: 'user_creation_failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 400 }); }
  }
  if (action !== 'login') return json({ error: 'self_service_registration_disabled' }, { status: 403 });
  const email = String(value?.email || '').trim().toLowerCase();
  const password = String(value?.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !password) return json({ error: 'email_and_password_required' }, { status: 400 });
  try {
    const db = requireDb(env);
    const user = await db.prepare('SELECT id,email,name,password_hash,role FROM users WHERE lower(email)=?').bind(email).first<{ id: string; email: string; name: string; password_hash: string; role: string }>();
    if (!user || !(await verifyPassword(password, user.password_hash))) return json({ error: 'invalid_credentials' }, { status: 401 });
    const token = await createSession(env, user.id, request);
    await db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").bind(user.id).run();
    return json({ authenticated: true, user: publicUser(user) }, { headers: { 'set-cookie': sessionCookie(token) } });
  } catch (error) { return json({ error: 'authentication_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
