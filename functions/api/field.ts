import { authorizeBoardRead, authorizeWrite, body, id, json, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'fleet', 'trips', 'maintenance', 'facilities', 'projects', 'time', 'wip', 'invoice_drafts']);

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
      fleet: `SELECT v.*,p.name owner_name FROM fleet_vehicles v LEFT JOIN people p ON p.id=v.owner_id WHERE v.board_id=? ORDER BY v.registration`,
      trips: `SELECT t.*,v.registration,p.name driver_name FROM trip_logs t JOIN fleet_vehicles v ON v.id=t.vehicle_id LEFT JOIN people p ON p.id=t.driver_id WHERE t.board_id=? ORDER BY t.trip_date DESC`,
      maintenance: `SELECT m.*,v.registration FROM fleet_maintenance m JOIN fleet_vehicles v ON v.id=m.vehicle_id WHERE m.board_id=? ORDER BY m.due_date`,
      facilities: `SELECT f.*,p.name owner_name FROM facilities f LEFT JOIN people p ON p.id=f.owner_id WHERE f.board_id=? ORDER BY f.name`,
      projects: `SELECT pr.*,a.company_name FROM projects pr LEFT JOIN crm_accounts a ON a.id=pr.customer_account_id WHERE pr.board_id=? ORDER BY pr.created_at DESC`,
      time: `SELECT t.*,pr.code project_code,pr.name project_name,p.name person_name FROM time_entries t JOIN projects pr ON pr.id=t.project_id JOIN people p ON p.id=t.person_id WHERE t.board_id=? ORDER BY t.work_date DESC`,
      wip: `SELECT pr.id,pr.code,pr.name,pr.billing_model,pr.budget_minor,pr.currency,a.company_name,COALESCE(SUM(CASE WHEN t.billable=1 AND t.status IN ('submitted','approved') THEN t.minutes ELSE 0 END),0) minutes,COALESCE(SUM(CASE WHEN t.billable=1 AND t.status IN ('submitted','approved') THEN t.minutes*COALESCE(t.rate_minor,0)/60 ELSE 0 END),0) amount_minor,COUNT(CASE WHEN t.billable=1 AND t.status IN ('submitted','approved') THEN t.id END) entry_count FROM projects pr LEFT JOIN crm_accounts a ON a.id=pr.customer_account_id LEFT JOIN time_entries t ON t.project_id=pr.id AND t.board_id=pr.board_id WHERE pr.board_id=? GROUP BY pr.id ORDER BY pr.code`,
      invoice_drafts: `SELECT d.*,pr.code,pr.name,a.company_name FROM project_invoice_drafts d JOIN projects pr ON pr.id=d.project_id LEFT JOIN crm_accounts a ON a.id=pr.customer_account_id WHERE d.board_id=? ORDER BY d.period DESC,d.created_at DESC`,
    };
    if (view !== 'summary') return json({ boardId, view, data: (await db.prepare(queries[view]).bind(boardId).all()).results });
    const [fleet, trips, maintenance, facilities, projects, time, wip, drafts] = await Promise.all([
      db.prepare("SELECT COUNT(*) count FROM fleet_vehicles WHERE board_id=? AND status='active'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM trip_logs WHERE board_id=? AND status='draft'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM fleet_maintenance WHERE board_id=? AND status IN ('scheduled','overdue')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM facility_tasks WHERE board_id=? AND status NOT IN ('complete')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM projects WHERE board_id=? AND status='active'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count,COALESCE(SUM(minutes),0) minutes FROM time_entries WHERE board_id=? AND status IN ('submitted','approved')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN billable=1 AND status IN ('submitted','approved') THEN minutes*COALESCE(rate_minor,0)/60 ELSE 0 END),0) amount_minor FROM time_entries WHERE board_id=?").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count,COALESCE(SUM(amount_minor),0) amount_minor FROM project_invoice_drafts WHERE board_id=? AND status NOT IN ('sent','cancelled')").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { fleet, trips, maintenance, facilities, projects, time, wip, drafts } });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
  try {
    const value = await body(request);
    const boardId = String(value?.boardId || '');
    const action = String(value?.action || '');
    const db = requireDb(env);
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    if (action === 'prepare_invoice') {
      const projectId = String(value?.projectId || '');
      const period = String(value?.period || new Date().toISOString().slice(0, 7));
      const aggregate = await db.prepare("SELECT COALESCE(SUM(minutes),0) source_minutes,COALESCE(SUM(minutes*COALESCE(rate_minor,0)/60),0) amount_minor FROM time_entries WHERE board_id=? AND project_id=? AND billable=1 AND status IN ('submitted','approved')").bind(boardId, projectId).first<{ source_minutes: number; amount_minor: number }>();
      if (!aggregate || Number(aggregate.source_minutes) <= 0) return json({ error: 'no_billable_time_ready' }, { status: 409 });
      const draftId = id('invprep');
      await db.prepare("INSERT INTO project_invoice_drafts (id,board_id,project_id,period,source_minutes,amount_minor,currency,status,created_by) VALUES (?,?,?,?,?,?, 'NOK','prepared',?)").bind(draftId, boardId, projectId, period, aggregate.source_minutes, aggregate.amount_minor, value?.createdBy || 'api').run();
      return json({ ok: true, action, draftId, status: 'prepared', sourceMinutes: aggregate.source_minutes, amountMinor: aggregate.amount_minor, externalInvoicing: 'not_configured' }, { status: 201 });
    }
    if (action === 'approve_invoice_draft') {
      const draftId = String(value?.draftId || '');
      const result = await db.prepare("UPDATE project_invoice_drafts SET status='approved',approved_by=?,approved_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('prepared','review')").bind(value?.approvedBy || 'api', draftId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'invoice_draft_not_found_or_already_approved' }, { status: 409 });
      return json({ ok: true, action, draftId, status: 'approved', externalInvoicing: 'not_configured' });
    }
    if (action === 'classify_trip') {
      const tripId = String(value?.tripId || ''); const type = String(value?.tripType || 'unknown');
      if (!['business', 'private', 'commute', 'unknown'].includes(type)) return json({ error: 'invalid_trip_type' }, { status: 400 });
      const result = await db.prepare("UPDATE trip_logs SET trip_type=?,status='classified',tax_basis=? WHERE id=? AND board_id=? AND status='draft'").bind(type, value?.taxBasis || null, tripId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'trip_not_draft_or_found' }, { status: 409 });
      return json({ ok: true, action, tripId, status: 'classified', requiresHumanApproval: true });
    }
    if (action === 'approve_time') {
      const entryId = String(value?.entryId || '');
      const result = await db.prepare("UPDATE time_entries SET status='approved',approved_by=?,approved_at=datetime('now') WHERE id=? AND board_id=? AND status='submitted'").bind(value?.approvedBy || 'api', entryId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'time_not_submitted_or_found' }, { status: 409 });
      return json({ ok: true, action, entryId, status: 'approved' });
    }
    if (action === 'complete_maintenance') {
      const maintenanceId = String(value?.maintenanceId || '');
      const result = await db.prepare("UPDATE fleet_maintenance SET status='complete' WHERE id=? AND board_id=? AND status IN ('scheduled','booked','overdue')").bind(maintenanceId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'maintenance_not_open_or_found' }, { status: 409 });
      return json({ ok: true, action, maintenanceId, status: 'complete' });
    }
    return json({ error: 'unknown_action', allowed: ['prepare_invoice', 'approve_invoice_draft', 'classify_trip', 'approve_time', 'complete_maintenance'] }, { status: 400 });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
