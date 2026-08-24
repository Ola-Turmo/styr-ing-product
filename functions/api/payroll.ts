import { authorizeBoardRead, authorizeWrite, body, id, json, requireDb, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const view = url.searchParams.get('view') || 'checks';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'summary') {
      const [runs, checks, pending] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(gross_minor),0) AS gross_minor FROM payroll_runs WHERE board_id=?').bind(boardId).first(),
        db.prepare('SELECT COUNT(*) AS count FROM payroll_compliance_checks WHERE board_id=?').bind(boardId).first(),
        db.prepare("SELECT COUNT(*) AS count FROM payroll_compliance_checks WHERE board_id=? AND status IN ('calculated','review')").bind(boardId).first(),
      ]);
      return json({ boardId, view, data: { runs, checks, pending } });
    }
    const rows = await db.prepare('SELECT c.*, r.period, r.gross_minor, r.employee_count FROM payroll_compliance_checks c JOIN payroll_runs r ON r.id=c.payroll_run_id WHERE c.board_id=? ORDER BY r.period DESC').bind(boardId).all();
    return json({ boardId, view: 'checks', data: rows.results });
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
    if (action === 'calculate_compliance') {
      const runId = String(value?.payrollRunId || '').trim();
      const run = await db.prepare('SELECT gross_minor, employee_count FROM payroll_runs WHERE id=? AND board_id=?').bind(runId, boardId).first<Record<string, unknown>>();
      if (!run) return json({ error: 'payroll_run_not_found' }, { status: 404 });
      const holidayRate = Number(value?.holidayRate ?? 0.102);
      const otpRate = Number(value?.otpRate ?? 0.02);
      if (![holidayRate, otpRate].every((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 1)) return json({ error: 'rates_invalid' }, { status: 400 });
      const gross = Number(run.gross_minor || 0);
      const holiday = Math.round(gross * holidayRate);
      const otp = Math.round(gross * otpRate);
      const checkId = id('paycheck');
      const assumptions = JSON.stringify({ holidayBasis: 'gross wages', otpBasis: 'pensionable salary', externalRules: 'requires payroll review' });
      await db.prepare("INSERT INTO payroll_compliance_checks (id,board_id,payroll_run_id,holiday_rate,otp_rate,holiday_pay_minor,otp_minor,employee_count,status,assumptions) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(payroll_run_id) DO UPDATE SET holiday_rate=excluded.holiday_rate,otp_rate=excluded.otp_rate,holiday_pay_minor=excluded.holiday_pay_minor,otp_minor=excluded.otp_minor,employee_count=excluded.employee_count,status='calculated',assumptions=excluded.assumptions").bind(checkId, boardId, runId, holidayRate, otpRate, holiday, otp, Number(run.employee_count || 0), 'calculated', assumptions).run();
      return json({ ok: true, action, payrollRunId: runId, holidayPayMinor: holiday, otpMinor: otp, status: 'calculated', requiresHumanReview: true }, { status: 201 });
    }
    if (action === 'approve_compliance') {
      const checkId = String(value?.checkId || '').trim();
      const result = await db.prepare("UPDATE payroll_compliance_checks SET status='approved', reviewed_by=?, reviewed_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('calculated','review')").bind(value?.reviewedBy || 'api', checkId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'compliance_check_not_open_or_found' }, { status: 409 });
      return json({ ok: true, action, checkId, status: 'approved', externalSubmission: 'not_configured' });
    }
    return json({ error: 'unknown_action', allowed: ['calculate_compliance', 'approve_compliance'] }, { status: 400 });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
