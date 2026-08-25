import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'assets', 'tickets', 'saas', 'saas_insights', 'access', 'lifecycle']);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'assets') return json({ boardId, view, data: (await db.prepare(`SELECT a.id,a.asset_tag,a.name,a.asset_type,a.status,a.vendor,a.renewal_date,p.name owner_name,aa.status custody_status,aa.assigned_at FROM it_assets a LEFT JOIN people p ON p.id=a.owner_id LEFT JOIN asset_assignments aa ON aa.asset_id=a.id AND aa.status='assigned' WHERE a.board_id=? ORDER BY a.renewal_date`).bind(boardId).all()).results });
    if (view === 'tickets') return json({ boardId, view, data: (await db.prepare(`SELECT t.id,t.title,t.description,t.category,t.priority,t.status,t.due_date,p.name assignee_name FROM service_tickets t LEFT JOIN people p ON p.id=t.assignee_id WHERE t.board_id=? ORDER BY CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,t.due_date`).bind(boardId).all()).results });
    if (view === 'saas' || view === 'saas_insights') {
      const rows = (await db.prepare(`SELECT s.id,s.name,s.vendor,s.seats,s.monthly_minor,s.currency,s.status,s.renewal_date,s.utilization_percent,p.name owner_name FROM saas_subscriptions s LEFT JOIN people p ON p.id=s.owner_id WHERE s.board_id=? ORDER BY s.vendor,s.name`).bind(boardId).all()).results as Record<string, unknown>[];
      if (view === 'saas') return json({ boardId, view, data: rows });
      const counts = new Map<string, number>(); rows.forEach(row => counts.set(String(row.vendor || ''), (counts.get(String(row.vendor || '')) || 0) + 1));
      const cutoff = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
      return json({ boardId, view, data: rows.map(row => ({ ...row, duplicateVendor: (counts.get(String(row.vendor || '')) || 0) > 1, lowUtilization: Number(row.utilization_percent || 0) < 60, renewalRisk: Boolean(row.renewal_date && String(row.renewal_date) <= cutoff) })) });
    }
    if (view === 'access') return json({ boardId, view, data: (await db.prepare(`SELECT a.id,a.system_name,a.access_level,a.decision,a.reason,p.name person_name,r.name reviewer_name FROM access_reviews a JOIN people p ON p.id=a.person_id LEFT JOIN people r ON r.id=a.reviewer_id WHERE a.board_id=? ORDER BY CASE a.decision WHEN 'pending' THEN 1 ELSE 2 END,a.system_name`).bind(boardId).all()).results });
    if (view === 'lifecycle') return json({ boardId, view, data: (await db.prepare(`SELECT l.id,l.task_type,l.title,l.status,l.requires_approval,l.due_date,o.id case_id,p.name person_name FROM it_lifecycle_tasks l JOIN offboarding_cases o ON o.id=l.offboarding_case_id JOIN people p ON p.id=o.person_id WHERE l.board_id=? ORDER BY l.due_date`).bind(boardId).all()).results });
    const [assets, tickets, renewals, pendingAccess, proposed] = await Promise.all([
      db.prepare("SELECT COUNT(*) count FROM it_assets WHERE board_id=? AND status='active'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM service_tickets WHERE board_id=? AND status NOT IN ('resolved','closed')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM saas_subscriptions WHERE board_id=? AND status='active' AND renewal_date <= date('now','+120 day')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM access_reviews WHERE board_id=? AND decision='pending'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM it_lifecycle_tasks WHERE board_id=? AND status='proposed'").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { assets, tickets, renewals, pendingAccess, proposed } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request); const boardId = String(value?.boardId || '').trim(); const action = String(value?.action || '').trim();
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId); if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 });
    const db = requireDb(env); const audit = (entityType: string, entityId: string, details: Record<string, unknown> = {}) => recordAudit(db, { boardId, action: `it_${action}`, entityType, entityId, userId: authorization.userId || undefined, details });
    if (action === 'create_saas_subscription') {
      const name = String(value?.name || '').trim(); const vendor = String(value?.vendor || '').trim();
      const seats = Number(value?.seats); const monthlyMinor = value?.monthlyMinor === '' || value?.monthlyMinor === undefined ? null : Number(value.monthlyMinor);
      const renewalDate = String(value?.renewalDate || '').trim() || null; const utilization = value?.utilizationPercent === '' || value?.utilizationPercent === undefined ? null : Number(value.utilizationPercent);
      if (!name || name.length > 160 || !vendor || vendor.length > 120 || !Number.isInteger(seats) || seats < 1 || seats > 100000) return json({ error: 'subscription_name_vendor_and_valid_seats_required' }, { status: 400 });
      if (monthlyMinor !== null && (!Number.isInteger(monthlyMinor) || monthlyMinor < 0 || monthlyMinor > 1000000000)) return json({ error: 'monthly_minor_invalid' }, { status: 400 });
      if (utilization !== null && (!Number.isInteger(utilization) || utilization < 0 || utilization > 100)) return json({ error: 'utilization_percent_invalid' }, { status: 400 });
      if (renewalDate && !/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) return json({ error: 'renewal_date_invalid' }, { status: 400 });
      const subscriptionId = id('saas');
      await db.prepare("INSERT INTO saas_subscriptions (id,board_id,name,vendor,seats,monthly_minor,currency,status,renewal_date,utilization_percent,source) VALUES (?,?,?,?,?,?, 'NOK','active',?,?, 'manual')").bind(subscriptionId, boardId, name, vendor, seats, monthlyMinor, renewalDate, utilization).run();
      await audit('saas_subscription', subscriptionId, { name, vendor, seats, monthlyMinor, renewalDate, utilization, status: 'active', source: 'manual' });
      return json({ ok: true, action, subscriptionId, status: 'active' }, { status: 201 });
    }
    if (action === 'update_saas_subscription') {
      const subscriptionId = String(value?.subscriptionId || '').trim(); const status = String(value?.status || '').trim();
      if (!subscriptionId || !['active', 'trial', 'cancel_pending', 'cancelled'].includes(status)) return json({ error: 'subscription_id_and_valid_status_required' }, { status: 400 });
      const result = await db.prepare('UPDATE saas_subscriptions SET status=?,updated_at=datetime(\'now\') WHERE id=? AND board_id=?').bind(status, subscriptionId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'subscription_not_found' }, { status: 404 });
      await audit('saas_subscription', subscriptionId, { status, requiresHumanApproval: status === 'cancelled' || status === 'cancel_pending' });
      return json({ ok: true, action, subscriptionId, status, requiresHumanApproval: status === 'cancelled' || status === 'cancel_pending' });
    }
    if (action === 'prepare_offboarding') {
      const caseId = String(value?.caseId || '').trim(); if (!caseId) return json({ error: 'caseId_required' }, { status: 400 });
      const person = await db.prepare('SELECT p.name FROM offboarding_cases o JOIN people p ON p.id=o.person_id WHERE o.id=? AND o.board_id=?').bind(caseId, boardId).first<{ name: string }>();
      if (!person) return json({ error: 'offboarding_not_found' }, { status: 404 });
      const tasks = [['access', `Foreslå tilgangsrevisjon for ${person.name}`], ['asset', 'Foreslå retur av tildelte eiendeler'], ['payroll', 'Foreslå lønns- og feriepengesjekk']];
      for (const [type, title] of tasks) await db.prepare("INSERT OR IGNORE INTO it_lifecycle_tasks (id,board_id,offboarding_case_id,task_type,title,status,requires_approval) VALUES (?,?,?,?,?,'proposed',1)").bind(id('life'), boardId, caseId, type, title).run();
      await audit('offboarding_case', caseId, { status: 'proposed', tasks: tasks.map(task => task[0]), requiresHumanApproval: true });
      return json({ ok: true, action, caseId, status: 'proposed', tasks: tasks.map(task => task[0]), requiresHumanApproval: true });
    }
    if (action === 'create_ticket') {
      const title = String(value?.title || '').trim();
      const description = String(value?.description || '').trim();
      const category = String(value?.category || 'general').trim();
      const priority = String(value?.priority || 'medium').trim();
      const dueDate = String(value?.dueDate || '').trim() || null;
      if (!title || title.length > 200) return json({ error: 'title_required_and_max_200' }, { status: 400 });
      if (description.length > 2000) return json({ error: 'description_max_2000' }, { status: 400 });
      if (!['general', 'hardware', 'access', 'software', 'facility', 'hr'].includes(category)) return json({ error: 'invalid_category' }, { status: 400 });
      if (!['critical', 'high', 'medium', 'low'].includes(priority)) return json({ error: 'invalid_priority' }, { status: 400 });
      const ticketId = id('ticket');
      await db.prepare('INSERT INTO service_tickets (id,board_id,title,description,category,priority,status,due_date) VALUES (?,?,?,?,?,?,?,?)').bind(ticketId, boardId, title, description || null, category, priority, 'open', dueDate).run();
      await audit('service_ticket', ticketId, { title, category, priority, status: 'open', requiresHumanApproval: false });
      return json({ ok: true, action, ticketId, status: 'open' });
    }
    if (action === 'review_access') {
      const reviewId = String(value?.reviewId || '').trim(); const decision = String(value?.decision || '').trim();
      if (!reviewId || !['retain', 'remove', 'reduce'].includes(decision)) return json({ error: 'reviewId_and_valid_decision_required' }, { status: 400 });
      const result = await db.prepare("UPDATE access_reviews SET decision=?,reviewer_id=?,reviewed_at=datetime('now'),reason=? WHERE id=? AND board_id=? AND decision='pending'").bind(decision, String(value?.reviewerId || 'api'), String(value?.reason || ''), reviewId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'access_review_not_pending_or_found' }, { status: 409 });
      await audit('access_review', reviewId, { decision, requiresHumanApproval: false });
      return json({ ok: true, action, reviewId, decision, requiresHumanApproval: false });
    }
    if (action === 'approve_lifecycle_task') {
      const taskId = String(value?.taskId || '').trim(); if (!taskId) return json({ error: 'taskId_required' }, { status: 400 });
      const result = await db.prepare("UPDATE it_lifecycle_tasks SET status='approved',assigned_to=? WHERE id=? AND board_id=? AND status='proposed'").bind(String(value?.assignedTo || ''), taskId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'lifecycle_task_not_proposed_or_found' }, { status: 409 });
      await audit('it_lifecycle_task', taskId, { status: 'approved', requiresHumanApproval: true });
      return json({ ok: true, action, taskId, status: 'approved', requiresHumanApproval: true });
    }
    return json({ error: 'unknown_action', allowed: ['prepare_offboarding', 'create_ticket', 'review_access', 'approve_lifecycle_task', 'create_saas_subscription', 'update_saas_subscription'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
