import { authorizeBoardWrite, authorizeWrite, body, bytesToBase64, createSession, destroySession, getSession, hashPassword, json, recordAudit, requireDb, sessionCookie, sha256, verifyPassword, type Env } from './_lib';

function publicUser(user: { id: string; email: string; name: string; role: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get('action') === 'invite_status') {
    const token = (url.searchParams.get('token') || '').trim();
    if (!token) return json({ error: 'token_required' }, { status: 400 });
    try {
      const db = requireDb(env);
      const invite = await db.prepare('SELECT expires_at,used_at FROM invite_tokens WHERE token_hash=?').bind(await sha256(token)).first<{ expires_at: string; used_at: string | null }>();
      if (!invite) return json({ valid: false, reason: 'invalid' }, { status: 410 });
      if (invite.used_at) return json({ valid: false, reason: 'used' }, { status: 410 });
      if (invite.expires_at <= new Date().toISOString().replace('T', ' ').slice(0, 19)) return json({ valid: false, reason: 'expired' }, { status: 410 });
      return json({ valid: true, expiresAt: invite.expires_at });
    } catch (error) { return json({ error: 'invite_status_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
  }
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
    const boardId = String(value?.boardId || '').trim();
    const boardAuthorization = await authorizeBoardWrite(request, env, boardId);
    if (!authorizeWrite(request, env) && !boardAuthorization.allowed) return json({ error: 'owner_or_editor_required' }, { status: boardAuthorization.userId ? 403 : 401 });
    const email = String(value?.email || '').trim().toLowerCase();
    const name = String(value?.name || '').trim().slice(0, 160);
    if (!/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || !boardId) return json({ error: 'valid_email_name_and_boardId_required' }, { status: 400 });
    try {
      const db = requireDb(env);
      const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const inviteId = `invite-${crypto.randomUUID()}`; const role = String(value?.role || 'viewer');
      if (!['owner','editor','viewer'].includes(role)) return json({ error: 'valid_role_required' }, { status: 400 });
      await db.batch([
        db.prepare("UPDATE invite_tokens SET used_at=datetime('now') WHERE board_id=? AND lower(email)=? AND used_at IS NULL AND expires_at>datetime('now')").bind(boardId, email),
        db.prepare("INSERT INTO invite_tokens (id,board_id,email,name,role,token_hash,expires_at,created_by) VALUES (?,?,?,?,?,?,datetime('now','+24 hours'),?)").bind(inviteId, boardId, email, name, role, await sha256(token), boardAuthorization.userId),
      ]);
      return json({ ok: true, inviteId, boardId, activationUrl: `/activate?token=${encodeURIComponent(token)}`, expiresIn: '24h', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }, { status: 201 });
    } catch (error) { return json({ error: 'user_creation_failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 400 }); }
  }
  if (action === 'activate_invite') {
    const token = String(value?.token || '').trim(); const password = String(value?.password || '');
    if (!token || password.length < 12) return json({ error: 'valid_token_and_password_required' }, { status: 400 });
    try {
      const db = requireDb(env); const invite = await db.prepare("SELECT id,board_id,email,name,role FROM invite_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>datetime('now')").bind(await sha256(token)).first<{ id:string; board_id:string; email:string; name:string; role:string }>();
      if (!invite) return json({ error: 'invite_invalid_or_expired' }, { status: 410 });
      const existing = await db.prepare('SELECT id,password_hash FROM users WHERE lower(email)=?').bind(invite.email).first<{ id:string; password_hash:string }>();
      if (existing && !(await verifyPassword(password, existing.password_hash))) return json({ error: 'invite_account_password_invalid' }, { status: 401 });
      const userId = existing?.id || `usr-${crypto.randomUUID()}`; const passwordHash = existing ? null : await hashPassword(password);
      // Claim the token before creating records. The conditional UPDATE is the
      // single-use guard when two activation requests arrive at the same time.
      const claim = await db.prepare("UPDATE invite_tokens SET used_at=datetime('now') WHERE id=? AND used_at IS NULL AND expires_at>datetime('now')").bind(invite.id).run();
      if ((claim.meta?.changes || 0) !== 1) return json({ error: 'invite_invalid_or_expired' }, { status: 410 });
      const statements = existing
        ? [db.prepare('INSERT INTO user_boards (user_id,board_id,role) VALUES (?,?,?) ON CONFLICT(user_id,board_id) DO NOTHING').bind(userId,invite.board_id,invite.role)]
        : [
            db.prepare('INSERT INTO users (id,email,name,password_hash) VALUES (?,?,?,?)').bind(userId,invite.email,invite.name,passwordHash),
            db.prepare('INSERT INTO user_boards (user_id,board_id,role) VALUES (?,?,?)').bind(userId,invite.board_id,invite.role),
          ];
      await db.batch(statements);
      await recordAudit(db, { boardId: invite.board_id, action: existing ? 'membership.invite_accepted' : 'membership.account_activated', entityType: 'user_board', entityId: userId, userId, details: { role: invite.role, existingAccount: Boolean(existing), inviteId: invite.id }, ipAddress: request.headers.get('cf-connecting-ip') || undefined });
      const session = await createSession(env,userId,request); return json({ authenticated:true, boardId:invite.board_id, existingAccount:Boolean(existing) }, { headers:{ 'set-cookie': sessionCookie(session) } });
    } catch (error) { return json({ error: 'invite_activation_failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
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
    const boards = (await db.prepare('SELECT b.id,b.name,ub.role FROM user_boards ub JOIN boards b ON b.id=ub.board_id WHERE ub.user_id=? AND b.status=? ORDER BY b.name').bind(user.id, 'active').all()).results;
    return json({ authenticated: true, user: publicUser(user), boards }, { headers: { 'set-cookie': sessionCookie(token) } });
  } catch (error) { return json({ error: 'authentication_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
