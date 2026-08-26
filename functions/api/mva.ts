import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, sha256, type Env } from './_lib';

const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const txt = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const minor = (v: unknown) => Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : 0;

type VatLine = { id: string; voucher_number: string | number; voucher_date: string; description: string; account_code: string; account_name: string; vat_code: string | null; base_minor: number; direction: 'input' | 'output' | 'unmapped'; rate: number | null; vat_minor: number };

function classify(code: string | null) {
  const value = String(code || '').trim().toLowerCase();
  if (['1', 'in25', 'input25', 'inngående25', 'inngaaende25', 'input_25'].includes(value)) return { direction: 'input' as const, rate: 0.25, sign: 1 };
  if (['1_12', 'in12', 'input12', 'inngående12', 'inngaaende12', 'input_12'].includes(value)) return { direction: 'input' as const, rate: 0.12, sign: 1 };
  if (['1_15', 'in15', 'input15', 'inngående15', 'inngaaende15', 'input_15'].includes(value)) return { direction: 'input' as const, rate: 0.15, sign: 1 };
  if (['3', 'out25', 'output25', 'utgående25', 'utgaaende25', 'output_25'].includes(value)) return { direction: 'output' as const, rate: 0.25, sign: 1 };
  if (['3_12', 'out12', 'output12', 'utgående12', 'utgaaende12', 'output_12'].includes(value)) return { direction: 'output' as const, rate: 0.12, sign: 1 };
  if (['3_15', 'out15', 'output15', 'utgående15', 'utgaaende15', 'output_15'].includes(value)) return { direction: 'output' as const, rate: 0.15, sign: 1 };
  if (['3c', 'out25_credit', 'output25_credit'].includes(value)) return { direction: 'output' as const, rate: 0.25, sign: -1 };
  if (['0', 'none', 'fritatt', 'exempt'].includes(value) || !value) return { direction: 'unmapped' as const, rate: null, sign: 0 };
  return { direction: 'unmapped' as const, rate: null, sign: 0 };
}

async function calculate(db: D1Database, boardId: string, period: string) {
  const rows = (await db.prepare(`SELECT l.id,v.voucher_number,v.voucher_date,v.description,l.vat_code,
    l.debit_minor,l.credit_minor,a.code AS account_code,a.name AS account_name
    FROM voucher_lines l JOIN vouchers v ON v.id=l.voucher_id
    LEFT JOIN ledger_accounts a ON a.id=l.account_id
    WHERE v.board_id=? AND v.period=? AND v.status='posted' ORDER BY v.voucher_number,l.id`).bind(boardId, period).all()).results as Record<string, unknown>[];
  const lines: VatLine[] = rows.map((row) => {
    const base = Math.max(minor(row.debit_minor), minor(row.credit_minor)); const kind = classify(row.vat_code as string | null);
    return { id: txt(row.id, 120), voucher_number: row.voucher_number as string | number, voucher_date: txt(row.voucher_date, 20), description: txt(row.description, 200), account_code: txt(row.account_code, 30), account_name: txt(row.account_name, 120), vat_code: row.vat_code ? txt(row.vat_code, 40) : null, base_minor: base * kind.sign, direction: kind.direction, rate: kind.rate, vat_minor: kind.rate ? Math.round(base * kind.rate * kind.sign) : 0 };
  });
  const output = lines.filter((x) => x.direction === 'output').reduce((sum, x) => sum + x.vat_minor, 0);
  const input = lines.filter((x) => x.direction === 'input').reduce((sum, x) => sum + x.vat_minor, 0);
  const basis = lines.filter((x) => x.direction !== 'unmapped').reduce((sum, x) => sum + x.base_minor, 0);
  const unmapped = lines.filter((x) => x.direction === 'unmapped' && x.vat_code).length;
  const snapshot = JSON.stringify({ basis: 'voucher_lines', rateAssumptions: { '1': 0.25, '1_12': 0.12, '1_15': 0.15, '3': 0.25, '3_12': 0.12, '3_15': 0.15, '3C': -0.25 }, lines });
  return { lines, output, input, net: output - input, basis, unmapped, snapshot, hash: await sha256(snapshot) };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const u = new URL(request.url); const boardId = txt(u.searchParams.get('boardId')); const view = u.searchParams.get('view') || 'summary'; const period = txt(u.searchParams.get('period'), 20);
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 }); if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'periods' || view === 'summary') {
      const periods = await db.prepare('SELECT * FROM vat_periods WHERE board_id=? ORDER BY period DESC').bind(boardId).all();
      return json({ boardId, view, data: view === 'summary' ? { periods: periods.results, externalSubmission: 'not_configured' } : periods.results });
    }
    if (view === 'detail' && periodPattern.test(period)) {
      const row = await db.prepare('SELECT * FROM vat_periods WHERE board_id=? AND period=?').bind(boardId, period).first();
      return json({ boardId, view, period, data: row ? { ...row, source: row.source_snapshot ? JSON.parse(String(row.source_snapshot)) : null } : null });
    }
    return json({ error: 'unknown_view', allowed: ['summary', 'periods', 'detail'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request); const boardId = txt(value?.boardId); const action = txt(value?.action, 50); const period = txt(value?.period, 20); const db = requireDb(env);
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 }); if (!periodPattern.test(period)) return json({ error: 'period_invalid' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId); if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 }); const actor = authorization.userId || 'api';
    if (action === 'calculate_period') {
      const result = await calculate(db, boardId, period); const periodId = id('vat');
      await db.prepare(`INSERT INTO vat_periods (id,board_id,period,status,basis_minor,output_vat_minor,input_vat_minor,net_vat_minor,source_count,unmapped_count,source_snapshot,source_hash,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(board_id,period) DO UPDATE SET status='calculated',basis_minor=excluded.basis_minor,output_vat_minor=excluded.output_vat_minor,input_vat_minor=excluded.input_vat_minor,net_vat_minor=excluded.net_vat_minor,source_count=excluded.source_count,unmapped_count=excluded.unmapped_count,source_snapshot=excluded.source_snapshot,source_hash=excluded.source_hash,submission_id=NULL,updated_at=datetime('now')`).bind(periodId, boardId, period, 'calculated', result.basis, result.output, result.input, result.net, result.lines.length, result.unmapped, result.snapshot, result.hash).run();
      const row = await db.prepare('SELECT id FROM vat_periods WHERE board_id=? AND period=?').bind(boardId, period).first<{ id: string }>(); await recordAudit(db, { boardId, action: 'vat_period_calculated', entityType: 'vat_period', entityId: row?.id, userId: authorization.userId || undefined, details: { period, sourceCount: result.lines.length, unmappedCount: result.unmapped, externalSubmission: 'not_configured' } });
      return json({ ok: true, action, vatPeriodId: row?.id, period, status: 'calculated', basisMinor: result.basis, outputVatMinor: result.output, inputVatMinor: result.input, netVatMinor: result.net, sourceCount: result.lines.length, unmappedCount: result.unmapped, requiresHumanReview: true, externalSubmission: 'not_configured' }, { status: 201 });
    }
    const row = await db.prepare('SELECT * FROM vat_periods WHERE board_id=? AND period=?').bind(boardId, period).first<Record<string, unknown>>(); if (!row) return json({ error: 'vat_period_not_found' }, { status: 404 });
    if (action === 'approve_period') {
      if (!['calculated'].includes(String(row.status)) || Number(row.unmapped_count || 0) > 0) return json({ error: 'vat_period_requires_review' }, { status: 409 });
      const current = await calculate(db, boardId, period);
      if (String(row.source_hash || '') !== current.hash) {
        await recordAudit(db, { boardId, action: 'vat_period_approval_blocked_stale_snapshot', entityType: 'vat_period', entityId: String(row.id), userId: authorization.userId || undefined, details: { period, storedHash: row.source_hash || null, currentHash: current.hash, sourceCount: current.lines.length } });
        return json({ error: 'vat_period_snapshot_stale', period, message: 'Det er bokført nye eller endrede bilag etter beregningen. Beregn MVA-perioden på nytt før godkjenning.', sourceCount: current.lines.length, unmappedCount: current.unmapped }, { status: 409 });
      }
      await db.prepare("UPDATE vat_periods SET status='approved',approved_by=?,approved_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND board_id=?").bind(actor, row.id, boardId).run(); await recordAudit(db, { boardId, action: 'vat_period_approved', entityType: 'vat_period', entityId: String(row.id), userId: authorization.userId || undefined, details: { period, externalSubmission: 'not_configured' } }); return json({ ok: true, action, period, status: 'approved', externalSubmission: 'not_configured' });
    }
    if (action === 'prepare_submission') {
      if (!['approved', 'prepared'].includes(String(row.status))) return json({ error: 'vat_period_not_approved' }, { status: 409 }); const payloadHash = await sha256(JSON.stringify({ boardId, period, basisMinor: row.basis_minor, outputVatMinor: row.output_vat_minor, inputVatMinor: row.input_vat_minor, sourceHash: row.source_hash }));
      const existing = await db.prepare("SELECT id,status,payload_hash FROM compliance_submissions WHERE board_id=? AND submission_type='mva' AND period=? AND status IN ('prepared','review','approved','submitted') ORDER BY created_at DESC LIMIT 1").bind(boardId, period).first<Record<string, unknown>>();
      if (existing) {
        if (String(existing.payload_hash || '') !== payloadHash) return json({ error: 'submission_snapshot_conflict', detail: 'Det finnes allerede et MVA-grunnlag for perioden med andre godkjente tall. Kontroller eller avvis det eksisterende grunnlaget før du lager et nytt.' }, { status: 409 });
        return json({ ok: true, action, period, submissionId: existing.id, status: existing.status, payloadHash, idempotent: true, externalSubmission: 'not_configured' }, { status: 200 });
      }
      if (row.status !== 'approved') return json({ error: 'vat_submission_missing', detail: 'MVA-perioden peker på et innsendingsgrunnlag som ikke finnes. Beregn og godkjenn perioden på nytt.' }, { status: 409 });
      const submissionId = id('submission'); try { await db.batch([db.prepare("INSERT INTO compliance_submissions (id,board_id,submission_type,period,status,payload_hash,notes,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))").bind(submissionId, boardId, 'mva', period, 'prepared', payloadHash, 'MVA-grunnlag klargjort internt; ekstern innsending ikke konfigurert'), db.prepare("UPDATE vat_periods SET status='prepared',submission_id=?,updated_at=datetime('now') WHERE id=? AND board_id=? AND status='approved'").bind(submissionId, row.id, boardId)]); } catch (error) {
        if (!(error instanceof Error) || !error.message.toLowerCase().includes('unique')) throw error;
        const raced = await db.prepare("SELECT id,status,payload_hash FROM compliance_submissions WHERE board_id=? AND submission_type='mva' AND period=? AND status IN ('prepared','review','approved','submitted') ORDER BY created_at DESC LIMIT 1").bind(boardId, period).first<Record<string, unknown>>();
        if (!raced || String(raced.payload_hash || '') !== payloadHash) return json({ error: 'submission_snapshot_conflict', detail: 'Et annet MVA-grunnlag ble opprettet samtidig. Kontroller tallene før du prøver igjen.' }, { status: 409 });
        return json({ ok: true, action, period, submissionId: raced.id, status: raced.status, payloadHash, idempotent: true, externalSubmission: 'not_configured' }, { status: 200 });
      }
      await recordAudit(db, { boardId, action: 'vat_submission_prepared', entityType: 'vat_period', entityId: String(row.id), userId: authorization.userId || undefined, details: { period, submissionId, externalSubmission: 'not_configured' } }); return json({ ok: true, action, period, submissionId, status: 'prepared', payloadHash, idempotent: false, externalSubmission: 'not_configured' }, { status: 201 });
    }
    return json({ error: 'unknown_action', allowed: ['calculate_period', 'approve_period', 'prepare_submission'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
