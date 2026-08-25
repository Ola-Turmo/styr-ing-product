import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'meetings', 'attendance', 'ballots']);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    const queries: Record<string, string> = {
      meetings: `SELECT m.*, COALESCE(SUM(CASE WHEN a.attendance_status='present' THEN 1 ELSE 0 END),0) AS present_count, COUNT(a.id) AS invited_count FROM meetings m LEFT JOIN meeting_attendance a ON a.meeting_id=m.id WHERE m.board_id=? GROUP BY m.id ORDER BY m.date DESC`,
      attendance: `SELECT a.*, m.title AS meeting_title, m.date, p.name AS member_name, p.role FROM meeting_attendance a JOIN meetings m ON m.id=a.meeting_id JOIN board_members p ON p.id=a.member_id WHERE a.board_id=? ORDER BY m.date DESC, p.name`,
      ballots: `SELECT COALESCE(b.id, r.id || '-' || m.id) AS id, r.id AS resolution_id, m.id AS member_id, b.vote, b.note, b.cast_at, r.number, r.title, m.name AS member_name, m.role FROM resolutions r JOIN board_members m ON m.board_id=r.board_id LEFT JOIN resolution_ballots b ON b.resolution_id=r.id AND b.member_id=m.id WHERE r.board_id=? ORDER BY r.created_at DESC, m.name`,
    };
    if (view !== 'summary') return json({ boardId, view, data: (await db.prepare(queries[view]).bind(boardId).all()).results });
    const [meetings, upcoming, present, ballots] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE board_id=? AND status NOT IN ('cancelled')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM meetings WHERE board_id=? AND status='planned'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM meeting_attendance WHERE board_id=? AND attendance_status='present'").bind(boardId).first(),
      db.prepare('SELECT COUNT(*) AS count FROM resolution_ballots WHERE board_id=?').bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { meetings, upcoming, present, quorum: present, ballots } });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request);
    const boardId = String(value?.boardId || '').trim();
    const action = String(value?.action || '').trim();
    const db = requireDb(env);
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId);
    if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 });
    if (action === 'create_meeting') {
      const title = String(value?.title || '').trim();
      const date = String(value?.date || '').trim();
      if (!title || !date) return json({ error: 'title_and_date_required' }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'invalid_meeting_date' }, { status: 400 });
      const meetingId = id('meeting');
      await db.prepare("INSERT INTO meetings (id,board_id,title,date,time,location,status,agenda,created_by) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(meetingId, boardId, title, date, value?.time || null, value?.location || null, 'planned', value?.agenda || null, authorization.userId || null).run();
      const members = await db.prepare('SELECT id FROM board_members WHERE board_id=? AND (until IS NULL OR until>=?)').bind(boardId, date).all<{ id: string }>();
      for (const member of members.results || []) {
        await db.prepare("INSERT OR IGNORE INTO meeting_attendance (id,board_id,meeting_id,member_id,attendance_status) VALUES (?,?,?,?,?)")
          .bind(id('attendance'), boardId, meetingId, member.id, 'invited').run();
      }
      await recordAudit(db, { boardId, action: 'meeting_created', entityType: 'meeting', entityId: meetingId, userId: authorization.userId || undefined, details: { title, date, invitedCount: members.results?.length || 0 } });
      return json({ ok: true, action, meetingId, invitedCount: members.results?.length || 0, signature: 'not_configured' }, { status: 201 });
    }
    if (action === 'create_resolution') {
      const number = String(value?.number || '').trim();
      const title = String(value?.title || '').trim();
      if (!number || !title) return json({ error: 'number_and_title_required' }, { status: 400 });
      const meetingId = value?.meetingId ? String(value.meetingId).trim() : null;
      if (meetingId) {
        const meeting = await db.prepare('SELECT 1 AS allowed FROM meetings WHERE id=? AND board_id=?').bind(meetingId, boardId).first();
        if (!meeting) return json({ error: 'meeting_not_found' }, { status: 404 });
      }
      const resolutionId = id('resolution');
      await db.prepare("INSERT INTO resolutions (id,board_id,meeting_id,number,title,description,status,signature_status) VALUES (?,?,?,?,?,?,?,?)")
        .bind(resolutionId, boardId, meetingId, number, title, value?.description || null, 'proposed', 'pending').run();
      await recordAudit(db, { boardId, action: 'resolution_created', entityType: 'resolution', entityId: resolutionId, userId: authorization.userId || undefined, details: { number, title, meetingId } });
      return json({ ok: true, action, resolutionId, signature: 'not_configured', requiresHumanReview: true }, { status: 201 });
    }
    if (action === 'update_meeting_status') {
      const meetingId = String(value?.meetingId || '').trim();
      const status = String(value?.status || '').trim();
      if (!meetingId) return json({ error: 'meetingId_required' }, { status: 400 });
      if (!['ongoing', 'completed', 'cancelled'].includes(status)) return json({ error: 'invalid_meeting_status' }, { status: 400 });
      const meeting = await db.prepare('SELECT id,status,title FROM meetings WHERE id=? AND board_id=?').bind(meetingId, boardId).first<{ id: string; status: string; title: string }>();
      if (!meeting) return json({ error: 'meeting_not_found' }, { status: 404 });
      if (meeting.status === 'cancelled' && status !== 'cancelled') return json({ error: 'cancelled_meeting_immutable' }, { status: 409 });
      if (meeting.status === 'completed' && status !== 'completed') return json({ error: 'completed_meeting_immutable' }, { status: 409 });
      const result = await db.prepare("UPDATE meetings SET status=?, updated_at=datetime('now') WHERE id=? AND board_id=?").bind(status, meetingId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'meeting_not_found' }, { status: 404 });
      await recordAudit(db, { boardId, action: 'meeting_status_updated', entityType: 'meeting', entityId: meetingId, userId: authorization.userId || undefined, details: { from: meeting.status, to: status, title: meeting.title } });
      return json({ ok: true, action, meetingId, status, requiresHumanReview: status === 'completed' });
    }
    if (action === 'record_attendance') {
      const attendanceId = String(value?.attendanceId || '').trim();
      const status = String(value?.attendanceStatus || 'present');
      if (!attendanceId) return json({ error: 'attendanceId_required' }, { status: 400 });
      if (!['invited', 'present', 'absent', 'excused'].includes(status)) return json({ error: 'invalid_attendance_status' }, { status: 400 });
      const result = await db.prepare("UPDATE meeting_attendance SET attendance_status=?, conflict_flag=?, conflict_note=?, recorded_at=datetime('now') WHERE id=? AND board_id=?").bind(status, value?.conflictFlag ? 1 : 0, value?.conflictNote || null, attendanceId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'attendance_not_found' }, { status: 404 });
      await recordAudit(db, { boardId, action: 'meeting_attendance_recorded', entityType: 'meeting_attendance', entityId: attendanceId, userId: authorization.userId || undefined, details: { status, conflictFlag: Boolean(value?.conflictFlag) } });
      return json({ ok: true, action, attendanceId, status, requiresHumanReview: Boolean(value?.conflictFlag) });
    }
    if (action === 'cast_ballot') {
      const resolutionId = String(value?.resolutionId || '').trim();
      const memberId = String(value?.memberId || '').trim();
      const vote = String(value?.vote || '').trim();
      if (!resolutionId || !memberId) return json({ error: 'resolutionId_and_memberId_required' }, { status: 400 });
      if (!['for', 'against', 'abstain', 'recused'].includes(vote)) return json({ error: 'invalid_vote' }, { status: 400 });
      const validVoter = await db.prepare('SELECT 1 AS allowed FROM resolutions r JOIN board_members m ON m.board_id=r.board_id WHERE r.id=? AND m.id=? AND r.board_id=?').bind(resolutionId, memberId, boardId).first();
      if (!validVoter) return json({ error: 'resolution_or_member_not_found' }, { status: 404 });
      const ballotId = String(value?.ballotId || `${resolutionId}-${memberId}`);
      await db.prepare("INSERT INTO resolution_ballots (id,board_id,resolution_id,member_id,vote,note) VALUES (?,?,?,?,?,?) ON CONFLICT(resolution_id,member_id) DO UPDATE SET vote=excluded.vote,note=excluded.note,cast_at=datetime('now')").bind(ballotId, boardId, resolutionId, memberId, vote, value?.note || null).run();
      await db.prepare("UPDATE resolutions SET votes_for=(SELECT COUNT(*) FROM resolution_ballots WHERE resolution_id=? AND vote='for'), votes_against=(SELECT COUNT(*) FROM resolution_ballots WHERE resolution_id=? AND vote='against'), votes_abstain=(SELECT COUNT(*) FROM resolution_ballots WHERE resolution_id=? AND vote='abstain'), updated_at=datetime('now') WHERE id=? AND board_id=?").bind(resolutionId, resolutionId, resolutionId, resolutionId, boardId).run();
      await recordAudit(db, { boardId, action: 'resolution_ballot_recorded', entityType: 'resolution_ballot', entityId: ballotId, userId: authorization.userId || undefined, details: { resolutionId, memberId, vote } });
      return json({ ok: true, action, ballotId, vote, signature: 'not_configured', requiresHumanReview: true });
    }
    return json({ error: 'unknown_action', allowed: ['create_meeting', 'create_resolution', 'update_meeting_status', 'record_attendance', 'cast_ballot'] }, { status: 400 });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
