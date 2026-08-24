import { authorizeBoardMember, authorizeBoardWrite, body, json, recordAudit, requireDb, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const boardId = (new URL(request.url).searchParams.get('boardId') || '').trim();
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  const authorization = await authorizeBoardMember(request, env, boardId);
  if (!authorization.allowed) return json({ error: 'authenticated_board_member_required' }, { status: 401 });
  try {
    const db = requireDb(env);
    const members = await db.prepare('SELECT u.id,u.email,u.name,u.role AS account_role,ub.role,ub.board_id FROM user_boards ub JOIN users u ON u.id=ub.user_id WHERE ub.board_id=? ORDER BY CASE ub.role WHEN \'owner\' THEN 0 WHEN \'editor\' THEN 1 ELSE 2 END,u.name').bind(boardId).all();
    return json({ boardId, members: members.results });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const value = await body(request); const boardId = String(value?.boardId || '').trim(); const userId = String(value?.userId || '').trim(); const action = String(value?.action || '').trim();
  if (!boardId || !userId || !['set_role', 'remove'].includes(action)) return json({ error: 'boardId_userId_and_valid_action_required' }, { status: 400 });
  const actor = await authorizeBoardWrite(request, env, boardId);
  if (!actor.allowed) return json({ error: 'owner_or_editor_required' }, { status: 403 });
  try {
    const db = requireDb(env);
    const target = await db.prepare('SELECT role FROM user_boards WHERE user_id=? AND board_id=?').bind(userId, boardId).first<{ role: string }>();
    if (!target) return json({ error: 'member_not_found' }, { status: 404 });
    if (action === 'remove') {
      if (actor.userId === userId) return json({ error: 'cannot_remove_current_user' }, { status: 409 });
      if (target.role === 'owner') {
        const owners = await db.prepare("SELECT COUNT(*) AS count FROM user_boards WHERE board_id=? AND role='owner'").bind(boardId).first<{ count: number }>();
        if (Number(owners?.count || 0) <= 1) return json({ error: 'last_owner_must_remain' }, { status: 409 });
      }
      await db.prepare('DELETE FROM user_boards WHERE user_id=? AND board_id=?').bind(userId, boardId).run();
    } else {
      const role = String(value?.role || '').trim();
      if (!['owner', 'editor', 'viewer'].includes(role)) return json({ error: 'valid_role_required' }, { status: 400 });
      if (target.role === 'owner' && role !== 'owner') {
        const owners = await db.prepare("SELECT COUNT(*) AS count FROM user_boards WHERE board_id=? AND role='owner'").bind(boardId).first<{ count: number }>();
        if (Number(owners?.count || 0) <= 1) return json({ error: 'last_owner_must_remain' }, { status: 409 });
      }
      await db.prepare('UPDATE user_boards SET role=? WHERE user_id=? AND board_id=?').bind(role, userId, boardId).run();
    }
    await recordAudit(db, { boardId, action: `membership.${action}`, entityType: 'user_board', entityId: userId, userId: actor.userId || undefined, details: action === 'set_role' ? { role: value?.role } : undefined, ipAddress: request.headers.get('cf-connecting-ip') || undefined });
    return json({ ok: true, boardId, userId, action });
  } catch (error) { return json({ error: 'membership_update_failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
