import { authorizeBoardRead, authorizeWrite, body, json, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'meetings', 'attendance', 'ballots']);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!authorizeBoardRead(request, env, boardId)) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    const queries: Record<string, string> = {
      meetings: `SELECT m.*, COALESCE(SUM(CASE WHEN a.attendance_status='present' THEN 1 ELSE 0 END),0) AS present_count, COUNT(a.id) AS invited_count FROM meetings m LEFT JOIN meeting_attendance a ON a.meeting_id=m.id WHERE m.board_id=? GROUP BY m.id ORDER BY m.date DESC`,
      attendance: `SELECT a.*, m.title AS meeting_title, m.date, p.name AS member_name, p.role FROM meeting_attendance a JOIN meetings m ON m.id=a.meeting_id JOIN board_members p ON p.id=a.member_id WHERE a.board_id=? ORDER BY m.date DESC, p.name`,
      ballots: `SELECT b.*, r.number, r.title, m.name AS member_name, m.role FROM resolution_ballots b JOIN resolutions r ON r.id=b.resolution_id JOIN board_members m ON m.id=b.member_id WHERE b.board_id=? ORDER BY b.cast_at DESC`,
    };
    if (view !== 'summary') return json({ boardId, view, data: (await db.prepare(queries[view]).bind(boardId).all()).results });
    const [meetings, upcoming, present, ballots] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE board_id=? AND status NOT IN ('cancelled')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE board_id=? AND status='planned'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM meeting_attendance WHERE board_id=? AND attendance_status='present'").bind(boardId).first(),
      db.prepare('SELECT COUNT(*) AS count FROM resolution_ballots WHERE board_id=?').bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { meetings, upcoming, present, ballots } });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
  try {
    const value = await body(request);
    const boardId = String(value?.boardId || '').trim();
    const action = String(value?.action || '').trim();
    const db = requireDb(env);
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    if (action === 'record_attendance') {
      const attendanceId = String(value?.attendanceId || '').trim();
      const status = String(value?.attendanceStatus || 'present');
      if (!attendanceId) return json({ error: 'attendanceId_required' }, { status: 400 });
      if (!['invited', 'present', 'absent', 'excused'].includes(status)) return json({ error: 'invalid_attendance_status' }, { status: 400 });
      const result = await db.prepare("UPDATE meeting_attendance SET attendance_status=?, conflict_flag=?, conflict_note=?, recorded_at=datetime('now') WHERE id=? AND board_id=?").bind(status, value?.conflictFlag ? 1 : 0, value?.conflictNote || null, attendanceId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'attendance_not_found' }, { status: 404 });
      return json({ ok: true, action, attendanceId, status, requiresHumanReview: Boolean(value?.conflictFlag) });
    }
    if (action === 'cast_ballot') {
      const resolutionId = String(value?.resolutionId || '').trim();
      const memberId = String(value?.memberId || '').trim();
      const vote = String(value?.vote || '').trim();
      if (!resolutionId || !memberId) return json({ error: 'resolutionId_and_memberId_required' }, { status: 400 });
      if (!['for', 'against', 'abstain', 'recused'].includes(vote)) return json({ error: 'invalid_vote' }, { status: 400 });
      const ballotId = String(value?.ballotId || `${resolutionId}-${memberId}`);
      await db.prepare("INSERT INTO resolution_ballots (id,board_id,resolution_id,member_id,vote,note) VALUES (?,?,?,?,?,?) ON CONFLICT(resolution_id,member_id) DO UPDATE SET vote=excluded.vote,note=excluded.note,cast_at=datetime('now')").bind(ballotId, boardId, resolutionId, memberId, vote, value?.note || null).run();
      return json({ ok: true, action, ballotId, vote, signature: 'not_configured', requiresHumanReview: true });
    }
    return json({ error: 'unknown_action', allowed: ['record_attendance', 'cast_ballot'] }, { status: 400 });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
