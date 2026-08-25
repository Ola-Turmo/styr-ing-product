import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, type Env } from './_lib';

const txt = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const rate = (v: unknown, fallback: number) => v === undefined || v === null || v === '' ? fallback : Number(v);
const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const minor = (v: unknown) => Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null;

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const u = new URL(request.url); const boardId = txt(u.searchParams.get('boardId')); const view = u.searchParams.get('view') || 'checks';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 }); if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'summary') {
      const [runs, checks, pending] = await Promise.all([db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(gross_minor),0) AS gross_minor FROM payroll_runs WHERE board_id=?').bind(boardId).first(), db.prepare('SELECT COUNT(*) AS count FROM payroll_compliance_checks WHERE board_id=?').bind(boardId).first(), db.prepare("SELECT COUNT(*) AS count FROM payroll_compliance_checks WHERE board_id=? AND status IN ('calculated','review')").bind(boardId).first()]);
      return json({ boardId, view, data: { runs, checks, pending } });
    }
    if (view === 'runs') return json({ boardId, view, data: (await db.prepare('SELECT * FROM payroll_runs WHERE board_id=? ORDER BY period DESC').bind(boardId).all()).results });
    if (view === 'submissions') return json({ boardId, view, data: (await db.prepare('SELECT * FROM compliance_submissions WHERE board_id=? ORDER BY period DESC,created_at DESC').bind(boardId).all()).results });
    const rows = await db.prepare('SELECT c.*, r.period, r.gross_minor, r.employee_count, r.status AS run_status FROM payroll_compliance_checks c JOIN payroll_runs r ON r.id=c.payroll_run_id WHERE c.board_id=? ORDER BY r.period DESC').bind(boardId).all();
    return json({ boardId, view: 'checks', data: rows.results });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request); const boardId = txt(value?.boardId); const action = txt(value?.action, 50); const db = requireDb(env);
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId); if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 }); const actor = authorization.userId || 'api';
    if (action === 'create_run') {
      const period = txt(value?.period, 20); const gross = minor(value?.grossMinor); const tax = minor(value?.taxWithheldMinor ?? 0); const employer = minor(value?.employerCostMinor ?? 0); const employees = Number(value?.employeeCount ?? 0);
      if (!periodPattern.test(period) || gross === null || tax === null || employer === null || !Number.isInteger(employees) || employees < 0 || employees > 100000 || gross <= 0 || tax > gross || employer < gross || (gross > 0 && employees < 1)) return json({ error: 'payroll_run_fields_invalid', detail: 'Brutto må være positivt, skattetrekk kan ikke overstige brutto, arbeidsgiverkostnad må dekke brutto og antall ansatte må være satt.' }, { status: 400 });
      const existing = await db.prepare('SELECT id FROM payroll_runs WHERE board_id=? AND period=?').bind(boardId, period).first(); if (existing) return json({ error: 'payroll_run_period_exists' }, { status: 409 });
      const runId = id('payrun'); await db.prepare("INSERT INTO payroll_runs (id,board_id,period,status,gross_minor,tax_withheld_minor,employer_cost_minor,employee_count) VALUES (?,?,?,?,?,?,?,?)").bind(runId, boardId, period, 'draft', gross, tax, employer, employees).run(); await recordAudit(db, { boardId, action: 'payroll_run_created', entityType: 'payroll_run', entityId: runId, userId: authorization.userId || undefined, details: { period, grossMinor: gross, employeeCount: employees } }); return json({ ok: true, action, payrollRunId: runId, status: 'draft' }, { status: 201 });
    }
    if (action === 'calculate_compliance') {
      const runId = txt(value?.payrollRunId, 100); const run = await db.prepare('SELECT period,gross_minor,tax_withheld_minor,employer_cost_minor,employee_count,status FROM payroll_runs WHERE id=? AND board_id=?').bind(runId, boardId).first<Record<string, unknown>>(); if (!run) return json({ error: 'payroll_run_not_found' }, { status: 404 });
      if (['submitted','closed'].includes(txt(run.status, 30))) return json({ error: 'payroll_run_closed' }, { status: 409 });
      const holidayRate = rate(value?.holidayRate, 0.102); const otpRate = rate(value?.otpRate, 0.02); if (![holidayRate, otpRate].every((r) => Number.isFinite(r) && r >= 0 && r <= 1)) return json({ error: 'rates_invalid' }, { status: 400 });
      const gross = Number(run.gross_minor || 0); const tax = Number(run.tax_withheld_minor || 0); const employer = Number(run.employer_cost_minor || 0); const employees = Number(run.employee_count || 0); if (!Number.isSafeInteger(gross) || gross <= 0 || !Number.isSafeInteger(tax) || tax < 0 || tax > gross || !Number.isSafeInteger(employer) || employer < gross || employees < 1) return json({ error: 'payroll_run_values_invalid' }, { status: 409 }); const holiday = Math.round(gross * holidayRate); const otp = Math.round(gross * otpRate); const checkId = id('paycheck'); const assumptions = JSON.stringify({ holidayBasis: 'gross wages', otpBasis: 'pensionable salary', grossMinor: gross, taxWithheldMinor: tax, netPayMinor: gross - tax, employerCostMinor: employer, employerContributionMinor: employer - gross, employeeCount: employees, externalRules: 'requires payroll review' });
      await db.batch([db.prepare("INSERT INTO payroll_compliance_checks (id,board_id,payroll_run_id,holiday_rate,otp_rate,holiday_pay_minor,otp_minor,employee_count,status,assumptions) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(payroll_run_id) DO UPDATE SET holiday_rate=excluded.holiday_rate,otp_rate=excluded.otp_rate,holiday_pay_minor=excluded.holiday_pay_minor,otp_minor=excluded.otp_minor,employee_count=excluded.employee_count,status='calculated',assumptions=excluded.assumptions,reviewed_by=NULL,reviewed_at=NULL").bind(checkId, boardId, runId, holidayRate, otpRate, holiday, otp, employees, 'calculated', assumptions), db.prepare("UPDATE payroll_runs SET holiday_pay_minor=?,otp_minor=?,status='calculated',calculated_at=datetime('now') WHERE id=? AND board_id=? AND status NOT IN ('submitted','closed')").bind(holiday, otp, runId, boardId)]);
      await recordAudit(db, { boardId, action: 'payroll_compliance_calculated', entityType: 'payroll_run', entityId: runId, userId: authorization.userId || undefined, details: { holidayRate, otpRate, holidayPayMinor: holiday, otpMinor: otp } }); return json({ ok: true, action, payrollRunId: runId, holidayPayMinor: holiday, otpMinor: otp, status: 'calculated', requiresHumanReview: true }, { status: 201 });
    }
    if (action === 'approve_compliance') {
      const checkId = txt(value?.checkId, 100); const result = await db.prepare("UPDATE payroll_compliance_checks SET status='approved', reviewed_by=?, reviewed_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('calculated','review')").bind(actor, checkId, boardId).run(); if (!result.meta?.changes) return json({ error: 'compliance_check_not_open_or_found' }, { status: 409 });
      const check = await db.prepare('SELECT payroll_run_id FROM payroll_compliance_checks WHERE id=? AND board_id=?').bind(checkId, boardId).first<{ payroll_run_id: string }>();
      if (check?.payroll_run_id) await db.prepare("UPDATE payroll_runs SET status='approved',approved_by=?,approved_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('draft','calculated','review')").bind(actor, check.payroll_run_id, boardId).run();
      await recordAudit(db, { boardId, action: 'payroll_compliance_approved', entityType: 'payroll_compliance_check', entityId: checkId, userId: authorization.userId || undefined, details: { payrollRunId: check?.payroll_run_id, externalSubmission: 'not_configured' } }); return json({ ok: true, action, checkId, payrollRunId: check?.payroll_run_id, status: 'approved', externalSubmission: 'not_configured' });
    }
    if (action === 'approve_submission') {
      const submissionId = txt(value?.submissionId, 100); const result = await db.prepare("UPDATE compliance_submissions SET status='approved', approved_by=?, approved_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('prepared','review')").bind(actor, submissionId, boardId).run(); if (!result.meta?.changes) return json({ error: 'submission_not_open_or_found' }, { status: 409 }); await recordAudit(db, { boardId, action: 'compliance_submission_approved', entityType: 'compliance_submission', entityId: submissionId, userId: authorization.userId || undefined, details: { externalSubmission: 'not_configured' } }); return json({ ok: true, action, submissionId, status: 'approved', externalSubmission: 'not_configured' });
    }
    if (action === 'prepare_submission') {
      const submissionType = ['a_melding', 'tax_return', 'mva', 'nav_income', 'annual_accounts'].includes(txt(value?.submissionType, 30)) ? txt(value?.submissionType, 30) : ''; const period = txt(value?.period, 20); const periodValid = ['a_melding','mva','nav_income'].includes(submissionType) ? periodPattern.test(period) : /^\d{4}$/.test(period); if (!submissionType || !periodValid) return json({ error: 'submission_fields_invalid', detail: ['a_melding','mva','nav_income'].includes(submissionType) ? 'Bruk YYYY-MM for månedsrapportering.' : 'Bruk YYYY for årsrapportering.' }, { status: 400 });
      const payrollBased = ['a_melding', 'nav_income'].includes(submissionType);
      const source = await db.prepare("SELECT id,period,gross_minor,tax_withheld_minor,employer_cost_minor,holiday_pay_minor,otp_minor,employee_count,status,approved_by,approved_at FROM payroll_runs WHERE board_id=? AND period LIKE ? ORDER BY created_at DESC LIMIT 1").bind(boardId, `${period}%`).first<Record<string, unknown>>();
      if (payrollBased && !source) return json({ error: 'payroll_run_not_found_for_period', detail: 'Opprett og kontroller lønnskjøringen for perioden først.' }, { status: 404 });
      if (payrollBased && txt(source?.status, 30) !== 'approved') return json({ error: 'payroll_run_not_approved_for_submission', detail: 'Lønnskjøringen må være beregnet og godkjent før rapportgrunnlaget kan klargjøres.' }, { status: 409 });
      const submissionSnapshot = { boardId, submissionType, period, source: source || null, preparedBy: actor, externalSubmission: 'not_configured' }; const submissionId = id('submission'); const payloadHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(submissionSnapshot))).then((b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''));
      await db.prepare("INSERT INTO compliance_submissions (id,board_id,submission_type,period,status,payload_hash,notes,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))").bind(submissionId, boardId, submissionType, period, 'prepared', payloadHash, 'Klargjort internt; ekstern innsending ikke konfigurert').run(); await recordAudit(db, { boardId, action: 'compliance_submission_prepared', entityType: 'compliance_submission', entityId: submissionId, userId: authorization.userId || undefined, details: { submissionType, period, externalSubmission: 'not_configured' } }); return json({ ok: true, action, submissionId, status: 'prepared', payloadHash, externalSubmission: 'not_configured' }, { status: 201 });
    }
    return json({ error: 'unknown_action', allowed: ['create_run', 'calculate_compliance', 'approve_compliance', 'prepare_submission', 'approve_submission'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
