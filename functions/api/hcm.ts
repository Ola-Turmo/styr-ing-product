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
    if (view === 'goals') return json({ boardId, view, data: (await db.prepare(`SELECT g.id,g.title,g.period,g.status,g.progress,g.parent_goal_id,p.name AS owner_name,parent.title AS parent_title FROM goals g LEFT JOIN people p ON p.id=g.owner_id LEFT JOIN goals parent ON parent.id=g.parent_goal_id WHERE g.board_id=? ORDER BY CASE g.status WHEN 'at_risk' THEN 1 WHEN 'on_track' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END,g.created_at DESC`).bind(boardId).all()).results });
    if (view === 'candidates') return json({ boardId, view, data: (await db.prepare(`SELECT c.id,c.name,c.email,c.stage,c.score,c.skills,c.consent_status,r.title AS requisition_title,COALESCE((SELECT COUNT(*) FROM interview_scorecards sc WHERE sc.candidate_id=c.id AND sc.board_id=c.board_id AND sc.status='complete'),0) AS completed_scorecards,COALESCE((SELECT MAX(sc.overall_score) FROM interview_scorecards sc WHERE sc.candidate_id=c.id AND sc.board_id=c.board_id AND sc.status='complete'),c.score) AS scorecard_score FROM candidates c LEFT JOIN job_requisitions r ON r.id=c.requisition_id WHERE c.board_id=? ORDER BY c.created_at DESC`).bind(boardId).all()).results });
    if (view === 'handbook') return json({ boardId, view, data: (await db.prepare(`SELECT h.id,h.title,h.category,h.version,h.status,h.requires_ack,h.published_at,COUNT(a.id) AS acknowledgements FROM handbook_documents h LEFT JOIN handbook_acknowledgements a ON a.handbook_id=h.id WHERE h.board_id=? GROUP BY h.id ORDER BY h.published_at DESC`).bind(boardId).all()).results });
    if (view === 'training') return json({ boardId, view, data: (await db.prepare(`SELECT e.id,e.status,e.due_date,e.score,c.title AS course_title,p.name AS person_name FROM training_enrollments e JOIN training_courses c ON c.id=e.course_id JOIN people p ON p.id=e.person_id WHERE e.board_id=? ORDER BY e.due_date`).bind(boardId).all()).results });
    if (view === 'reviews') return json({ boardId, view, data: (await db.prepare(`SELECT r.id,r.period,r.status,r.rating,r.due_date,p.name AS person_name,rv.name AS reviewer_name FROM performance_reviews r JOIN people p ON p.id=r.person_id LEFT JOIN people rv ON rv.id=r.reviewer_id WHERE r.board_id=? ORDER BY r.due_date`).bind(boardId).all()).results });
    if (view === 'offboarding') return json({ boardId, view, data: (await db.prepare(`SELECT o.id,o.person_id,o.last_day,o.status,o.access_revoked,o.assets_returned,o.payroll_reviewed,o.notes,p.name AS person_name,COUNT(l.id) AS lifecycle_tasks,SUM(CASE WHEN l.status='complete' THEN 1 ELSE 0 END) AS completed_tasks FROM offboarding_cases o JOIN people p ON p.id=o.person_id LEFT JOIN it_lifecycle_tasks l ON l.offboarding_case_id=o.id AND l.board_id=o.board_id WHERE o.board_id=? GROUP BY o.id ORDER BY o.last_day`).bind(boardId).all()).results });
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
      const score = value?.score === undefined || value?.score === null || value?.score === '' ? null : Number(value.score);
      if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) return json({ error: 'candidate_score_must_be_0_to_100' }, { status: 400 });
      const candidate = await db.prepare('SELECT id,stage FROM candidates WHERE id=? AND board_id=?').bind(candidateId, boardId).first<{ id: string; stage: string }>();
      if (!candidate) return json({ error: 'candidate_not_found' }, { status: 404 });
      await db.prepare("UPDATE candidates SET stage=?,score=COALESCE(?,score),updated_at=datetime('now') WHERE id=? AND board_id=?").bind(stage, score, candidateId, boardId).run();
      await recordAudit(db, { boardId, action: 'candidate_updated', entityType: 'candidate', entityId: candidateId, userId: authorization.userId || undefined, details: { from: candidate.stage, to: stage, score } });
      return json({ ok: true, action, candidateId, stage, score, requiresHumanReview: ['hired','rejected'].includes(stage) });
    }
    if (action === 'save_scorecard') {
      const candidateId = String(value?.candidateId || '').trim(); const interviewerId = String(value?.interviewerId || authorization.userId || '').trim();
      const overallScore = Number(value?.overallScore); const recommendation = String(value?.recommendation || '').trim(); const notes = String(value?.notes || '').trim(); const criteria = value?.criteria && typeof value.criteria === 'object' ? value.criteria : {};
      if (!candidateId || !Number.isInteger(overallScore) || overallScore < 0 || overallScore > 100 || !['strong_yes','yes','mixed','no','strong_no'].includes(recommendation)) return json({ error: 'scorecard_fields_required' }, { status: 400 });
      const candidate = await db.prepare('SELECT id FROM candidates WHERE id=? AND board_id=?').bind(candidateId, boardId).first<{ id: string }>(); if (!candidate) return json({ error: 'candidate_not_found' }, { status: 404 });
      const scorecardId = id('scorecard'); await db.prepare("INSERT INTO interview_scorecards (id,board_id,candidate_id,interviewer_id,status,criteria,overall_score,recommendation,notes,completed_at,updated_at) VALUES (?,?,?,?, 'complete',?,?,?,?,datetime('now'),datetime('now'))").bind(scorecardId,boardId,candidateId,interviewerId||null,JSON.stringify(criteria),overallScore,recommendation,notes||null).run();
      await db.prepare("UPDATE candidates SET score=?,updated_at=datetime('now') WHERE id=? AND board_id=?").bind(overallScore,candidateId,boardId).run();
      await recordAudit(db,{boardId,action:'candidate_scorecard_completed',entityType:'candidate',entityId:candidateId,userId:authorization.userId||undefined,details:{scorecardId,overallScore,recommendation,criteriaKeys:Object.keys(criteria)}});
      return json({ok:true,action,scorecardId,candidateId,status:'complete',overallScore,recommendation,requiresHumanReview:true},{status:201});
    }
    if (action === 'acknowledge_handbook') {
      const handbookId = String(value?.handbookId || ''); const personId = String(value?.personId || ''); if (!handbookId || !personId) return json({ error: 'handbookId_and_personId_required' }, { status: 400 });
      await db.prepare('INSERT OR IGNORE INTO handbook_acknowledgements (id,board_id,handbook_id,person_id) VALUES (?,?,?,?)').bind(id('ack'), boardId, handbookId, personId).run(); await recordAudit(db, { boardId, action: 'handbook_acknowledged', entityType: 'handbook', entityId: handbookId, userId: authorization.userId || undefined, details: { personId } }); return json({ ok: true, action, handbookId, personId, status: 'acknowledged' });
    }
    if (action === 'complete_training') {
      const enrollmentId = String(value?.enrollmentId || ''); const score = Number(value?.score); if (!enrollmentId || !Number.isInteger(score) || score < 0 || score > 100) return json({ error: 'enrollment_and_score_required' }, { status: 400 });
      const result = await db.prepare("UPDATE training_enrollments SET status='passed',score=?,completed_at=datetime('now') WHERE id=? AND board_id=?").bind(score, enrollmentId, boardId).run(); if (!result.meta?.changes) return json({ error: 'enrollment_not_found' }, { status: 404 }); await recordAudit(db, { boardId, action: 'training_completed', entityType: 'training_enrollment', entityId: enrollmentId, userId: authorization.userId || undefined, details: { score } }); return json({ ok: true, action, enrollmentId, status: 'passed', score });
    }
    if (action === 'create_goal') {
      const title = String(value?.title || '').trim(); const period = String(value?.period || '').trim(); const status = String(value?.status || 'draft').trim(); const ownerId = String(value?.ownerId || '').trim() || null; const parentGoalId = String(value?.parentGoalId || '').trim() || null;
      if (!title || title.length > 200 || !['on_track','at_risk','complete','draft'].includes(status)) return json({ error: 'goal_fields_required' }, { status: 400 });
      if (ownerId && !(await db.prepare('SELECT id FROM people WHERE id=? AND board_id=?').bind(ownerId,boardId).first())) return json({ error: 'owner_not_found' }, { status: 400 });
      if (parentGoalId && !(await db.prepare('SELECT id FROM goals WHERE id=? AND board_id=?').bind(parentGoalId,boardId).first())) return json({ error: 'parent_goal_not_found' }, { status: 400 });
      const goalId=id('goal'); await db.prepare("INSERT INTO goals (id,board_id,owner_id,parent_goal_id,title,period,status,progress,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))").bind(goalId,boardId,ownerId,parentGoalId,title,period||null,status).run(); await recordAudit(db,{boardId,action:'goal_created',entityType:'goal',entityId:goalId,userId:authorization.userId||undefined,details:{ownerId,parentGoalId,period,status}}); return json({ok:true,action,goalId,status,progress:0,parentGoalId},{status:201});
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
      const personId = String(value?.personId || '').trim(); const lastDay = String(value?.lastDay || '').trim(); const notes = String(value?.notes || '').trim();
      if (!personId || !datePattern.test(lastDay)) return json({ error: 'personId_and_lastDay_required' }, { status: 400 });
      if (notes.length > 2000) return json({ error: 'notes_max_2000' }, { status: 400 });
      const person = await db.prepare("SELECT id,name FROM people WHERE id=? AND board_id=? AND employment_status='active'").bind(personId, boardId).first<{ id: string; name: string }>();
      if (!person) return json({ error: 'active_person_not_found' }, { status: 404 });
      const existing = await db.prepare("SELECT id FROM offboarding_cases WHERE board_id=? AND person_id=? AND status IN ('planned','in_progress')").bind(boardId, personId).first<{ id: string }>();
      if (existing) return json({ error: 'active_offboarding_already_exists', id: existing.id }, { status: 409 });
      const caseId = id('offboard');
      const tasks = [
        { id: id('life'), type: 'access', title: `Gjennomgå og foreslå fjerning av tilganger for ${person.name}` },
        { id: id('life'), type: 'asset', title: `Avtal retur av utstyr fra ${person.name}` },
        { id: id('life'), type: 'payroll', title: `Kontroller sluttlønn og feriepenger for ${person.name}` },
      ];
      await db.batch([
        db.prepare("INSERT INTO offboarding_cases (id,board_id,person_id,last_day,status,notes) VALUES (?,?,?,?,'planned',?)").bind(caseId, boardId, personId, lastDay, notes || null),
        ...tasks.map(task => db.prepare("INSERT INTO it_lifecycle_tasks (id,board_id,offboarding_case_id,task_type,title,status,requires_approval,due_date) VALUES (?,?,?,?,?,'proposed',1,?)").bind(task.id, boardId, caseId, task.type, task.title, lastDay)),
      ]);
      await recordAudit(db, { boardId, action: 'offboarding_created', entityType: 'offboarding_case', entityId: caseId, userId: authorization.userId || undefined, details: { personId, lastDay, proposedTasks: tasks.map(task => task.type), requiresHumanApproval: true } });
      return json({ ok: true, action, id: caseId, status: 'planned', proposedTasks: tasks.map(task => ({ id: task.id, type: task.type })), requiresHumanApproval: true }, { status: 201 });
    }
    if (action === 'advance_offboarding') {
      const caseId = String(value?.caseId || ''); const accessRevoked = value?.accessRevoked ? 1 : 0; const assetsReturned = value?.assetsReturned ? 1 : 0; const payrollReviewed = value?.payrollReviewed ? 1 : 0; if (!caseId) return json({ error: 'caseId_required' }, { status: 400 });
      const current = await db.prepare("SELECT id,status FROM offboarding_cases WHERE id=? AND board_id=? AND status IN ('planned','in_progress')").bind(caseId, boardId).first<{ id: string; status: string }>();
      if (!current) return json({ error: 'offboarding_case_not_open_or_found' }, { status: 409 });
      const complete = accessRevoked && assetsReturned && payrollReviewed;
      const taskUpdates = [
        accessRevoked ? db.prepare("UPDATE it_lifecycle_tasks SET status='complete',completed_at=COALESCE(completed_at,datetime('now')) WHERE offboarding_case_id=? AND board_id=? AND task_type='access' AND status<>'rejected'").bind(caseId, boardId) : null,
        assetsReturned ? db.prepare("UPDATE it_lifecycle_tasks SET status='complete',completed_at=COALESCE(completed_at,datetime('now')) WHERE offboarding_case_id=? AND board_id=? AND task_type='asset' AND status<>'rejected'").bind(caseId, boardId) : null,
        payrollReviewed ? db.prepare("UPDATE it_lifecycle_tasks SET status='complete',completed_at=COALESCE(completed_at,datetime('now')) WHERE offboarding_case_id=? AND board_id=? AND task_type='payroll' AND status<>'rejected'").bind(caseId, boardId) : null,
      ].filter(Boolean) as D1PreparedStatement[];
      await db.batch([
        db.prepare(`UPDATE offboarding_cases SET access_revoked=?,assets_returned=?,payroll_reviewed=?,status=?${complete ? ",completed_at=datetime('now')" : ''} WHERE id=? AND board_id=?`).bind(accessRevoked, assetsReturned, payrollReviewed, complete ? 'complete' : 'in_progress', caseId, boardId),
        ...taskUpdates,
      ]);
      await recordAudit(db, { boardId, action: 'offboarding_advanced', entityType: 'offboarding_case', entityId: caseId, userId: authorization.userId || undefined, details: { accessRevoked, assetsReturned, payrollReviewed, status: complete ? 'complete' : 'in_progress', lifecycleTasksSynchronized: true } });
      return json({ ok: true, action, caseId, status: complete ? 'complete' : 'in_progress', lifecycleTasksSynchronized: true, requiresHumanApproval: true });
    }
    return json({ error: 'unknown_action', allowed: ['create_candidate','update_candidate','save_scorecard','acknowledge_handbook','complete_training','create_goal','update_goal','create_offboarding','advance_offboarding'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
