import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, type Env } from './_lib';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const views = new Set(['summary','people','goals','candidates','handbook','training','reviews','offboarding']);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url); const boardId = (url.searchParams.get('boardId') || '').trim(); const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'people') return json({ boardId, view, data: (await db.prepare('SELECT id,name,email,role,department,employment_status,start_date FROM people WHERE board_id=? ORDER BY name').bind(boardId).all()).results });
    if (view === 'goals') return json({ boardId, view, data: (await db.prepare(`SELECT g.id,g.title,g.period,g.status,g.progress,p.name AS owner_name FROM goals g LEFT JOIN people p ON p.id=g.owner_id WHERE g.board_id=? ORDER BY CASE g.status WHEN 'at_risk' THEN 1 WHEN 'on_track' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END,g.created_at DESC`).bind(boardId).all()).results });
    if (view === 'candidates') return json({ boardId, view, data: (await db.prepare(`SELECT c.id,c.name,c.email,c.stage,c.score,c.consent_status,r.title AS requisition_title FROM candidates c LEFT JOIN job_requisitions r ON r.id=c.requisition_id WHERE c.board_id=? ORDER BY c.created_at DESC`).bind(boardId).all()).results });
    if (view === 'handbook') return json({ boardId, view, data: (await db.prepare(`SELECT h.id,h.title,h.category,h.version,h.status,h.requires_ack,h.published_at,COUNT(a.id) AS acknowledgements FROM handbook_documents h LEFT JOIN handbook_acknowledgements a ON a.handbook_id=h.id WHERE h.board_id=? GROUP BY h.id ORDER BY h.published_at DESC`).bind(boardId).all()).results });
    if (view === 'training') return json({ boardId, view, data: (await db.prepare(`SELECT e.id,e.status,e.due_date,e.score,c.title AS course_title,p.name AS person_name FROM training_enrollments e JOIN training_courses c ON c.id=e.course_id JOIN people p ON p.id=e.person_id WHERE e.board_id=? ORDER BY e.due_date`).bind(boardId).all()).results });
    if (view === 'reviews') return json({ boardId, view, data: (await db.prepare(`SELECT r.id,r.period,r.status,r.rating,r.due_date,p.name AS person_name,rv.name AS reviewer_name FROM performance_reviews r JOIN people p ON p.id=r.person_id LEFT JOIN people rv ON rv.id=r.reviewer_id WHERE r.board_id=? ORDER BY r.due_date`).bind(boardId).all()).results });
    if (view === 'offboarding') return json({ boardId, view, data: (await db.prepare(`SELECT o.id,o.last_day,o.status,o.access_revoked,o.assets_returned,o.payroll_reviewed,o.notes,p.name AS person_name FROM offboarding_cases o JOIN people p ON p.id=o.person_id WHERE o.board_id=? ORDER BY o.last_day`).bind(boardId).all()).results });
    const [people, openCandidates, dueTraining, pendingAck, reviews, offboarding, goals, atRiskGoals] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM people WHERE board_id=? AND employment_status='active'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM candidates WHERE board_id=? AND stage NOT IN ('hired','rejected')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM training_enrollments WHERE board_id=? AND status IN ('assigned','in_progress')").bind(boardId).first(),
      db.prepare(`SELECT COUNT(*) AS count FROM handbook_documents h JOIN people p ON p.board_id=h.board_id WHERE h.board_id=? AND h.status='published' AND h.requires_ack=1 AND NOT EXISTS (SELECT 1 FROM handbook_acknowledgements a WHERE a.handbook_id=h.id AND a.person_id=p.id)`).bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM performance_reviews WHERE board_id=? AND status <> 'complete'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM offboarding_cases WHERE board_id=? AND status IN ('planned','in_progress')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM goals WHERE board_id=? AND status <> 'complete'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM goals WHERE board_id=? AND status='at_risk'").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { people, openCandidates, dueTraining, pendingAck, reviews, offboarding, goals, atRiskGoals } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request); const boardId = String(value?.boardId || '').trim(); const action = String(value?.action || ''); if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId);
    if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 });
    const db = requireDb(env);
    if (action === 'create_candidate') {
      const name = String(value?.name || '').trim(); const email = String(value?.email || '').trim(); const requisitionId = String(value?.requisitionId || '').trim(); if (!name || !requisitionId) return json({ error: 'candidate_fields_required' }, { status: 400 });
      const candidateId = id('candidate'); await db.prepare("INSERT INTO candidates (id,board_id,requisition_id,name,email,stage,skills,score,consent_status) VALUES (?,?,?,?,?,'new','[]',NULL,'pending')").bind(candidateId, boardId, requisitionId, name, email || null).run(); await recordAudit(db, { boardId, action: 'candidate_created', entityType: 'candidate', entityId: candidateId, userId: authorization.userId || undefined, details: { requisitionId } }); return json({ ok: true, action, id: candidateId, stage: 'new', consentStatus: 'pending' }, { status: 201 });
    }
    if (action === 'update_candidate') {
      const candidateId = String(value?.candidateId || '').trim(); const stage = String(value?.stage || '').trim();
      if (!candidateId || !['new','screening','interview','offer','hired','rejected'].includes(stage)) return json({ error: 'candidate_id_and_valid_stage_required' }, { status: 400 });
      const candidate = await db.prepare('SELECT id,stage FROM candidates WHERE id=? AND board_id=?').bind(candidateId, boardId).first<{ id: string; stage: string }>();
      if (!candidate) return json({ error: 'candidate_not_found' }, { status: 404 });
      await db.prepare("UPDATE candidates SET stage=?,updated_at=datetime('now') WHERE id=? AND board_id=?").bind(stage, candidateId, boardId).run();
      await recordAudit(db, { boardId, action: 'candidate_stage_changed', entityType: 'candidate', entityId: candidateId, userId: authorization.userId || undefined, details: { from: candidate.stage, to: stage } });
      return json({ ok: true, action, candidateId, stage, requiresHumanReview: ['hired','rejected'].includes(stage) });
    }
    if (action === 'acknowledge_handbook') {
      const handbookId = String(value?.handbookId || ''); const personId = String(value?.personId || ''); if (!handbookId || !personId) return json({ error: 'handbookId_and_personId_required' }, { status: 400 });
      await db.prepare('INSERT OR IGNORE INTO handbook_acknowledgements (id,board_id,handbook_id,person_id) VALUES (?,?,?,?)').bind(id('ack'), boardId, handbookId, personId).run(); await recordAudit(db, { boardId, action: 'handbook_acknowledged', entityType: 'handbook', entityId: handbookId, userId: authorization.userId || undefined, details: { personId } }); return json({ ok: true, action, handbookId, personId, status: 'acknowledged' });
    }
    if (action === 'complete_training') {
      const enrollmentId = String(value?.enrollmentId || ''); const score = Number(value?.score); if (!enrollmentId || !Number.isInteger(score) || score < 0 || score > 100) return json({ error: 'enrollment_and_score_required' }, { status: 400 });
      const result = await db.prepare("UPDATE training_enrollments SET status='passed',score=?,completed_at=datetime('now') WHERE id=? AND board_id=?").bind(score, enrollmentId, boardId).run(); if (!result.meta?.changes) return json({ error: 'enrollment_not_found' }, { status: 404 }); await recordAudit(db, { boardId, action: 'training_completed', entityType: 'training_enrollment', entityId: enrollmentId, userId: authorization.userId || undefined, details: { score } }); return json({ ok: true, action, enrollmentId, status: 'passed', score });
    }
    if (action === 'update_goal') {
      const goalId = String(value?.goalId || '').trim(); const progress = Number(value?.progress); const status = String(value?.status || '').trim();
      if (!goalId || !Number.isInteger(progress) || progress < 0 || progress > 100 || !['on_track','at_risk','complete','draft'].includes(status)) return json({ error: 'goal_id_progress_status_required' }, { status: 400 });
      const result = await db.prepare("UPDATE goals SET progress=?,status=?,updated_at=datetime('now') WHERE id=? AND board_id=?").bind(progress, status, goalId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'goal_not_found' }, { status: 404 });
      await recordAudit(db, { boardId, action: 'goal_status_changed', entityType: 'goal', entityId: goalId, userId: authorization.userId || undefined, details: { progress, status } });
      return json({ ok: true, action, goalId, progress, status, requiresHumanReview: true });
    }
    if (action === 'create_offboarding') {
      const personId = String(value?.personId || ''); const lastDay = String(value?.lastDay || ''); if (!personId || !datePattern.test(lastDay)) return json({ error: 'personId_and_lastDay_required' }, { status: 400 });
      const caseId = id('offboard'); await db.prepare("INSERT INTO offboarding_cases (id,board_id,person_id,last_day,status,notes) VALUES (?,?,?,?,'planned',?)").bind(caseId, boardId, personId, lastDay, String(value?.notes || '')).run(); await recordAudit(db, { boardId, action: 'offboarding_created', entityType: 'offboarding_case', entityId: caseId, userId: authorization.userId || undefined, details: { personId, lastDay } }); return json({ ok: true, action, id: caseId, status: 'planned', requiresHumanApproval: true });
    }
    if (action === 'advance_offboarding') {
      const caseId = String(value?.caseId || ''); const accessRevoked = value?.accessRevoked ? 1 : 0; const assetsReturned = value?.assetsReturned ? 1 : 0; const payrollReviewed = value?.payrollReviewed ? 1 : 0; if (!caseId) return json({ error: 'caseId_required' }, { status: 400 });
      const complete = accessRevoked && assetsReturned && payrollReviewed; const result = await db.prepare(`UPDATE offboarding_cases SET access_revoked=?,assets_returned=?,payroll_reviewed=?,status=?${complete ? ",completed_at=datetime('now')" : ''} WHERE id=? AND board_id=?`).bind(accessRevoked, assetsReturned, payrollReviewed, complete ? 'complete' : 'in_progress', caseId, boardId).run(); if (!result.meta?.changes) return json({ error: 'offboarding_case_not_found' }, { status: 404 }); await recordAudit(db, { boardId, action: 'offboarding_advanced', entityType: 'offboarding_case', entityId: caseId, userId: authorization.userId || undefined, details: { accessRevoked, assetsReturned, payrollReviewed, status: complete ? 'complete' : 'in_progress' } }); return json({ ok: true, action, caseId, status: complete ? 'complete' : 'in_progress', requiresHumanApproval: true });
    }
    return json({ error: 'unknown_action', allowed: ['create_candidate','update_candidate','acknowledge_handbook','complete_training','update_goal','create_offboarding','advance_offboarding'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
