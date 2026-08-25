import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, sha256, type Env } from './_lib';

const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const asMinor = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

async function buildSafT(db: D1Database, boardId: string, from: string, to: string) {
  const accounts = (await db.prepare('SELECT code,name,account_type,vat_code FROM ledger_accounts WHERE board_id = ? ORDER BY code').bind(boardId).all()).results as Record<string, unknown>[];
  const lines = (await db.prepare(`SELECT v.id,v.voucher_number,v.voucher_date,v.period,v.description,l.id line_id,l.debit_minor,l.credit_minor,l.vat_code,a.code,a.name
    FROM vouchers v JOIN voucher_lines l ON l.voucher_id=v.id JOIN ledger_accounts a ON a.id=l.account_id
    WHERE v.board_id=? AND v.period BETWEEN ? AND ? ORDER BY v.voucher_number,l.id`).bind(boardId, from, to).all()).results as Record<string, unknown>[];
  const esc = (value: unknown) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const amount = (value: unknown) => (Number(value || 0) / 100).toFixed(2);
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const line of lines) { const key = String(line.id); const existing = grouped.get(key) || []; existing.push(line); grouped.set(key, existing); }
  const transactions = [...grouped.values()].map((voucherLines) => {
    const first = voucherLines[0];
    return `<Transaction><TransactionID>${esc(first.voucher_number)}</TransactionID><TransactionDate>${esc(first.voucher_date)}</TransactionDate><Description>${esc(first.description)}</Description>${voucherLines.map((line) => `<Line><RecordID>${esc(line.line_id)}</RecordID><AccountID>${esc(line.code)}</AccountID><AccountDescription>${esc(line.name)}</AccountDescription><DebitAmount>${amount(line.debit_minor)}</DebitAmount><CreditAmount>${amount(line.credit_minor)}</CreditAmount>${line.vat_code ? `<TaxCode>${esc(line.vat_code)}</TaxCode>` : ''}</Line>`).join('')}</Transaction>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:NO"><Header><FileVersion>1.3</FileVersion><AuditFileVersion>1.0</AuditFileVersion><PeriodStart>${esc(from)}</PeriodStart><PeriodEnd>${esc(to)}</PeriodEnd><CurrencyCode>NOK</CurrencyCode><SelectionCriteria>${esc(`${from}:${to}`)}</SelectionCriteria></Header><MasterFiles><GeneralLedgerAccounts>${accounts.map((a) => `<Account><AccountID>${esc(a.code)}</AccountID><AccountDescription>${esc(a.name)}</AccountDescription><AccountType>${esc(a.account_type)}</AccountType>${a.vat_code ? `<TaxCode>${esc(a.vat_code)}</TaxCode>` : ''}</Account>`).join('')}</GeneralLedgerAccounts></MasterFiles><GeneralLedgerEntries><Journal><JournalID>GENERAL</JournalID>${transactions}</Journal></GeneralLedgerEntries></AuditFile>`;
  return { xml, checksum: await sha256(xml), rowCount: lines.length };
}

async function buildAccountingReport(db: D1Database, boardId: string, view: string, from: string, to: string) {
  const rows = (await db.prepare(`SELECT a.id,a.code,a.name,a.account_type,
    COALESCE(SUM(CASE WHEN v.period<? THEN l.debit_minor ELSE 0 END),0) AS opening_debit_minor,
    COALESCE(SUM(CASE WHEN v.period<? THEN l.credit_minor ELSE 0 END),0) AS opening_credit_minor,
    COALESCE(SUM(CASE WHEN v.period BETWEEN ? AND ? THEN l.debit_minor ELSE 0 END),0) AS debit_minor,
    COALESCE(SUM(CASE WHEN v.period BETWEEN ? AND ? THEN l.credit_minor ELSE 0 END),0) AS credit_minor,
    COALESCE(SUM(CASE WHEN v.period<=? THEN l.debit_minor ELSE 0 END),0) AS cumulative_debit_minor,
    COALESCE(SUM(CASE WHEN v.period<=? THEN l.credit_minor ELSE 0 END),0) AS cumulative_credit_minor
    FROM ledger_accounts a LEFT JOIN voucher_lines l ON l.account_id=a.id LEFT JOIN vouchers v ON v.id=l.voucher_id AND v.board_id=a.board_id AND v.status='posted'
    WHERE a.board_id=? AND a.active=1 GROUP BY a.id ORDER BY a.code`).bind(from, from, from, to, from, to, to, to, boardId).all()).results as Record<string, unknown>[];
  const normalized = rows.map((row) => {
    const debit = Number(row.debit_minor || 0); const credit = Number(row.credit_minor || 0); const cumulativeDebit = Number(row.cumulative_debit_minor || 0); const cumulativeCredit = Number(row.cumulative_credit_minor || 0); const naturalCredit = ['liability','equity','revenue'].includes(String(row.account_type));
    return { ...row, openingBalanceMinor: Number(row.opening_debit_minor || 0) - Number(row.opening_credit_minor || 0), debitMinor: debit, creditMinor: credit, periodBalanceMinor: naturalCredit ? credit - debit : debit - credit, closingBalanceMinor: naturalCredit ? cumulativeCredit - cumulativeDebit : cumulativeDebit - cumulativeCredit };
  });
  if (view === 'trial-balance') {
    const data = normalized.filter((row) => row.openingBalanceMinor || row.debitMinor || row.creditMinor || row.closingBalanceMinor); const totals = data.reduce((sum, row) => ({ debitMinor: sum.debitMinor + row.debitMinor, creditMinor: sum.creditMinor + row.creditMinor, rawClosingMinor: sum.rawClosingMinor + Number(row.cumulative_debit_minor || 0) - Number(row.cumulative_credit_minor || 0) }), { debitMinor: 0, creditMinor: 0, rawClosingMinor: 0 });
    return { rows: data, totals: { ...totals, balanced: totals.debitMinor === totals.creditMinor && totals.rawClosingMinor === 0 } };
  }
  if (view === 'profit-loss') {
    const data = normalized.filter((row) => ['revenue','expense'].includes(String(row.account_type)) && (row.debitMinor || row.creditMinor)); const revenueMinor = data.filter((row) => row.account_type === 'revenue').reduce((sum, row) => sum + row.periodBalanceMinor, 0); const expenseMinor = data.filter((row) => row.account_type === 'expense').reduce((sum, row) => sum + row.periodBalanceMinor, 0);
    return { rows: data, totals: { revenueMinor, expenseMinor, resultMinor: revenueMinor - expenseMinor } };
  }
  if (view === 'balance-sheet') {
    const data = normalized.filter((row) => ['asset','liability','equity'].includes(String(row.account_type)) && row.closingBalanceMinor); const assetMinor = data.filter((row) => row.account_type === 'asset').reduce((sum, row) => sum + row.closingBalanceMinor, 0); const liabilityMinor = data.filter((row) => row.account_type === 'liability').reduce((sum, row) => sum + row.closingBalanceMinor, 0); const equityMinor = data.filter((row) => row.account_type === 'equity').reduce((sum, row) => sum + row.closingBalanceMinor, 0); const revenueMinor = normalized.filter((row) => row.account_type === 'revenue').reduce((sum, row) => sum + row.closingBalanceMinor, 0); const expenseMinor = normalized.filter((row) => row.account_type === 'expense').reduce((sum, row) => sum + row.closingBalanceMinor, 0); const currentResultMinor = revenueMinor - expenseMinor;
    return { rows: data, totals: { assetMinor, liabilityMinor, equityMinor, currentResultMinor, liabilitiesAndEquityMinor: liabilityMinor + equityMinor + currentResultMinor, differenceMinor: assetMinor - liabilityMinor - equityMinor - currentResultMinor } };
  }
  const ledgerRows = (await db.prepare(`SELECT v.voucher_number,v.voucher_date,v.period,v.description AS voucher_description,v.source,v.external_reference,a.code,a.name,a.account_type,l.description,l.debit_minor,l.credit_minor,l.vat_code
    FROM vouchers v JOIN voucher_lines l ON l.voucher_id=v.id JOIN ledger_accounts a ON a.id=l.account_id WHERE v.board_id=? AND v.status='posted' AND v.period BETWEEN ? AND ? ORDER BY a.code,v.voucher_date,v.voucher_number,l.id`).bind(boardId, from, to).all()).results;
  return { rows: ledgerRows, totals: { rowCount: ledgerRows.length } };
}

async function boardData(env: Env, boardId: string, view: string) {
  const db = requireDb(env);
  if (view === 'accounts') return (await db.prepare('SELECT id,code,name,account_type,vat_code,active FROM ledger_accounts WHERE board_id = ? ORDER BY code').bind(boardId).all()).results;
  if (view === 'customers') return (await db.prepare("SELECT id,company_name,org_number,stage,currency FROM crm_accounts WHERE board_id=? AND stage NOT IN ('lost') ORDER BY company_name").bind(boardId).all()).results;
  if (view === 'periods') return (await db.prepare('SELECT id,period,status,locked_by,locked_at,seal_checksum FROM accounting_periods WHERE board_id = ? ORDER BY period DESC').bind(boardId).all()).results;
  if (view === 'period-closures') return (await db.prepare('SELECT * FROM accounting_period_closures WHERE board_id=? ORDER BY period DESC').bind(boardId).all()).results;
  if (view === 'saf-t-exports') return (await db.prepare('SELECT id,period_from,period_to,status,row_count,checksum,created_by,created_at FROM saf_t_exports WHERE board_id=? ORDER BY created_at DESC LIMIT 50').bind(boardId).all()).results;
  if (view === 'intercompany') return (await db.prepare('SELECT * FROM intercompany_postings WHERE board_id=? ORDER BY period DESC,created_at DESC').bind(boardId).all()).results;
  if (view === 'invoices') return (await db.prepare("SELECT i.*,a.company_name FROM sales_invoices i LEFT JOIN crm_accounts a ON a.id=i.account_id WHERE i.board_id=? ORDER BY CASE i.status WHEN 'overdue' THEN 1 WHEN 'review' THEN 2 WHEN 'approved' THEN 3 ELSE 4 END,i.due_date,i.created_at DESC").bind(boardId).all()).results;
  if (view === 'receivables') return (await db.prepare("SELECT i.id,i.invoice_number,i.issue_date,i.due_date,i.description,i.total_minor,i.status,i.paid_at,i.payment_reference,pl.id payment_link_id,pl.bank_transaction_id,pl.status payment_link_status,a.company_name,CASE WHEN i.status='paid' THEN 'paid' WHEN i.due_date IS NOT NULL AND i.due_date < date('now') THEN 'overdue' WHEN i.status IN ('draft','review') THEN 'needs_review' ELSE i.status END AS collection_status FROM sales_invoices i LEFT JOIN crm_accounts a ON a.id=i.account_id LEFT JOIN payment_links pl ON pl.entity_type='sales_invoice' AND pl.entity_id=i.id AND pl.board_id=i.board_id WHERE i.board_id=? AND i.status NOT IN ('cancelled') ORDER BY CASE WHEN i.status='paid' THEN 3 WHEN i.due_date < date('now') THEN 0 ELSE 1 END,i.due_date").bind(boardId).all()).results;
  if (view === 'payables') return (await db.prepare("SELECT i.id,i.invoice_number,i.supplier_name,i.due_date,i.amount_minor,i.currency,i.status,i.match_status,i.attested_at,i.assigned_at,i.paid_at,i.payment_reference,pl.id payment_link_id,pl.bank_transaction_id,pl.status payment_link_status,CASE WHEN i.status='paid' THEN 'paid' WHEN i.due_date < date('now') THEN 'overdue' WHEN i.status IN ('received','exception') THEN 'needs_review' WHEN i.status IN ('matched','approved') THEN 'ready_to_pay' ELSE i.status END AS payment_status FROM supplier_invoices i LEFT JOIN payment_links pl ON pl.entity_type='supplier_invoice' AND pl.entity_id=i.id AND pl.board_id=i.board_id WHERE i.board_id=? ORDER BY CASE WHEN i.status='paid' THEN 3 WHEN i.due_date < date('now') THEN 0 ELSE 1 END,i.due_date").bind(boardId).all()).results;
  if (view === 'fx') return (await db.prepare('SELECT * FROM fx_revaluations WHERE board_id=? ORDER BY period DESC,created_at DESC').bind(boardId).all()).results;
  if (view === 'notes') return (await db.prepare('SELECT * FROM statutory_notes WHERE board_id=? ORDER BY period DESC,created_at DESC').bind(boardId).all()).results;
  if (view === 'vouchers') return (await db.prepare(`SELECT v.id,v.voucher_number,v.voucher_date,v.period,v.description,v.source,v.status,v.external_reference,
    COALESCE(SUM(l.debit_minor),0) AS debit_minor, COALESCE(SUM(l.credit_minor),0) AS credit_minor
    FROM vouchers v LEFT JOIN voucher_lines l ON l.voucher_id = v.id WHERE v.board_id = ? GROUP BY v.id ORDER BY v.voucher_date DESC,v.voucher_number DESC LIMIT 500`).bind(boardId).all()).results;
    const [accounts, periods, vouchers, intercompany, notes, invoices] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM ledger_accounts WHERE board_id = ? AND active = 1').bind(boardId).first(),
    db.prepare("SELECT COUNT(*) AS count FROM accounting_periods WHERE board_id = ? AND status = 'locked'").bind(boardId).first(),
    db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(debit_minor),0) AS debit_minor, COALESCE(SUM(credit_minor),0) AS credit_minor FROM vouchers v LEFT JOIN voucher_lines l ON l.voucher_id = v.id WHERE v.board_id = ?').bind(boardId).first(),
    db.prepare("SELECT COUNT(*) AS count,SUM(CASE WHEN status IN ('prepared','review') THEN 1 ELSE 0 END) AS open_count FROM intercompany_postings WHERE board_id=?").bind(boardId).first(),
    db.prepare("SELECT COUNT(*) AS count,SUM(CASE WHEN status IN ('draft','review') THEN 1 ELSE 0 END) AS open_count FROM statutory_notes WHERE board_id=?").bind(boardId).first(),
    db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN status IN ('review','approved','sent','overdue') THEN total_minor ELSE 0 END),0) AS outstanding_minor,COALESCE(SUM(CASE WHEN status='overdue' THEN total_minor ELSE 0 END),0) AS overdue_minor FROM sales_invoices WHERE board_id=? AND status NOT IN ('paid','cancelled')").bind(boardId).first(),
  ]);
  return { accounts, periods, vouchers, intercompany, notes, invoices };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url); const boardId = (url.searchParams.get('boardId') || '').trim(); const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'saf-t') {
      const from = url.searchParams.get('from') || '1900-01'; const to = url.searchParams.get('to') || '2999-12';
      if (!periodPattern.test(from) || !periodPattern.test(to)) return json({ error: 'period_range_invalid' }, { status: 400 });
      if (from > to) return json({ error: 'period_range_invalid', detail: 'from_must_not_be_after_to' }, { status: 400 });
      const result = await buildSafT(db, boardId, from, to);
      return new Response(result.xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store', 'x-styr-export': 'SAF-T Financial 1.3 contract', 'x-styr-export-checksum': result.checksum, 'x-styr-export-row-count': String(result.rowCount) } });
    }
    if (['trial-balance','profit-loss','balance-sheet','general-ledger'].includes(view)) {
      const from = url.searchParams.get('from') || `${new Date().getUTCFullYear()}-01`; const to = url.searchParams.get('to') || `${new Date().getUTCFullYear()}-12`;
      if (!periodPattern.test(from) || !periodPattern.test(to) || from > to) return json({ error: 'period_range_invalid' }, { status: 400 });
      const report = await buildAccountingReport(db, boardId, view, from, to);
      if (url.searchParams.get('format') === 'csv') {
        const columns = view === 'general-ledger' ? ['voucher_number','voucher_date','period','code','name','voucher_description','description','debit_minor','credit_minor','vat_code','source','external_reference'] : ['code','name','account_type','openingBalanceMinor','debitMinor','creditMinor','periodBalanceMinor','closingBalanceMinor'];
        const csvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`; const csv = `\uFEFF${columns.join(';')}\n${(report.rows as Record<string, unknown>[]).map((row) => columns.map((column) => csvValue(row[column])).join(';')).join('\n')}`;
        return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="styr-ing-${view}-${from}-${to}.csv"`, 'cache-control': 'no-store' } });
      }
      return json({ boardId, view, from, to, data: report, source: 'posted_voucher_lines' });
    }
    return json({ boardId, view, data: await boardData(env, boardId, view) });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request); const boardId = String(value?.boardId || '').trim(); const action = String(value?.action || 'create_voucher');
    if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId);
    if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 });
    const db = requireDb(env);
    if (action === 'reseal_period') {
      const period = String(value?.period || ''); if (!periodPattern.test(period)) return json({ error: 'period_invalid' }, { status: 400 });
      const existing = await db.prepare('SELECT status FROM accounting_periods WHERE board_id=? AND period=?').bind(boardId, period).first<Record<string, unknown>>();
      if (existing?.status !== 'locked') return json({ error: 'period_must_be_locked' }, { status: 409 });
      const rows = (await db.prepare(`SELECT v.voucher_number,v.voucher_date,v.description,l.id AS line_id,l.account_id,l.debit_minor,l.credit_minor,l.vat_code FROM vouchers v JOIN voucher_lines l ON l.voucher_id=v.id WHERE v.board_id=? AND v.period=? ORDER BY v.voucher_number,l.id`).bind(boardId, period).all()).results;
      const sealChecksum = await sha256(JSON.stringify(rows));
      await db.prepare("UPDATE accounting_periods SET seal_checksum=?,locked_at=COALESCE(locked_at,datetime('now')) WHERE board_id=? AND period=? AND status='locked'").bind(sealChecksum, boardId, period).run();
      await recordAudit(db, { boardId, action: 'accounting_period_resealed', entityType: 'accounting_period', entityId: period, userId: authorization.userId || undefined, details: { period, sealChecksum, voucherLineCount: rows.length } });
      return json({ ok: true, action, boardId, period, status: 'locked', sealChecksum, voucherLineCount: rows.length, requiresHumanReview: true });
    }
    if (action === 'prepare_period_close') {
      const period = String(value?.period || '').trim(); if (!periodPattern.test(period)) return json({ error: 'period_invalid' }, { status: 400 });
      const existingPeriod = await db.prepare('SELECT status,seal_checksum FROM accounting_periods WHERE board_id=? AND period=?').bind(boardId, period).first<Record<string, unknown>>();
      if (existingPeriod?.status === 'locked') return json({ error: 'period_already_locked', period }, { status: 409 });
      const [vouchers, balance, bank, sales, purchases, vat, payroll, proposals, saft] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS count FROM vouchers WHERE board_id=? AND period=?').bind(boardId, period).first<Record<string, unknown>>(),
        db.prepare('SELECT COALESCE(SUM(l.debit_minor),0) AS debit_minor,COALESCE(SUM(l.credit_minor),0) AS credit_minor FROM vouchers v JOIN voucher_lines l ON l.voucher_id=v.id WHERE v.board_id=? AND v.period=?').bind(boardId, period).first<Record<string, unknown>>(),
        db.prepare("SELECT COUNT(*) AS count FROM bank_transactions WHERE board_id=? AND substr(transaction_date,1,7)=? AND status IN ('imported','suggested','approved')").bind(boardId, period).first<Record<string, unknown>>(),
        db.prepare("SELECT COUNT(*) AS count FROM sales_invoices WHERE board_id=? AND substr(issue_date,1,7)=? AND status IN ('draft','review','approved','sent','overdue')").bind(boardId, period).first<Record<string, unknown>>(),
        db.prepare("SELECT COUNT(*) AS count FROM supplier_invoices WHERE board_id=? AND substr(due_date,1,7)=? AND status IN ('received','matched','exception','approved')").bind(boardId, period).first<Record<string, unknown>>(),
        db.prepare('SELECT status,source_count,unmapped_count,submission_id,source_hash FROM vat_periods WHERE board_id=? AND period=?').bind(boardId, period).first<Record<string, unknown>>(),
        db.prepare("SELECT COUNT(*) AS count FROM payroll_runs WHERE board_id=? AND period=? AND status NOT IN ('approved','submitted','closed')").bind(boardId, period).first<Record<string, unknown>>(),
        db.prepare("SELECT COUNT(*) AS count FROM (SELECT id FROM posting_proposals WHERE board_id=? AND period=? AND status IN ('review','approved') UNION ALL SELECT id FROM payroll_posting_proposals WHERE board_id=? AND period=? AND status IN ('review','approved'))").bind(boardId, period, boardId, period).first<Record<string, unknown>>(),
        db.prepare('SELECT id,row_count,checksum FROM saf_t_exports WHERE board_id=? AND period_from<=? AND period_to>=? ORDER BY created_at DESC LIMIT 1').bind(boardId, period, period).first<Record<string, unknown>>(),
      ]);
      const debit = Number(balance?.debit_minor || 0); const credit = Number(balance?.credit_minor || 0); const vatStatus = String(vat?.status || 'missing'); const vatBlocking = vatStatus !== 'missing' && (!['approved','prepared'].includes(vatStatus) || Number(vat?.unmapped_count || 0) > 0); const checks = {
        vouchers: { count: Number(vouchers?.count || 0), balanced: debit === credit, blocking: debit !== credit },
        balance: { debitMinor: debit, creditMinor: credit, balanced: debit === credit, blocking: debit !== credit },
        bank: { openCount: Number(bank?.count || 0), clear: Number(bank?.count || 0) === 0, blocking: Number(bank?.count || 0) > 0 },
        sales: { openCount: Number(sales?.count || 0), warning: Number(sales?.count || 0) > 0, blocking: false },
        purchases: { openCount: Number(purchases?.count || 0), warning: Number(purchases?.count || 0) > 0, blocking: false },
        vat: { status: vatStatus, unmappedCount: Number(vat?.unmapped_count || 0), ready: vatStatus === 'missing' || (['approved','prepared'].includes(vatStatus) && Number(vat?.unmapped_count || 0) === 0), blocking: vatBlocking },
        payroll: { openCount: Number(payroll?.count || 0), clear: Number(payroll?.count || 0) === 0, blocking: Number(payroll?.count || 0) > 0 },
        proposals: { openCount: Number(proposals?.count || 0), clear: Number(proposals?.count || 0) === 0, blocking: Number(proposals?.count || 0) > 0 },
        safT: { present: Boolean(saft?.checksum), checksum: saft?.checksum || null, warning: !saft?.checksum, blocking: false },
      };
      const blocking = Object.entries(checks).filter(([, check]) => Boolean(check?.blocking)).map(([name]) => name); const warnings = Object.entries(checks).filter(([, check]) => Boolean(check?.warning)).map(([name]) => name);
      const payload = JSON.stringify({ period, checks, blocking, warnings }); const sourceHash = await sha256(payload); const closureId = id('close');
      await db.prepare("INSERT INTO accounting_period_closures (id,board_id,period,status,checks_json,source_hash,prepared_by,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(board_id,period) DO UPDATE SET status='review',checks_json=excluded.checks_json,source_hash=excluded.source_hash,prepared_by=excluded.prepared_by,approved_by=NULL,approved_at=NULL,updated_at=datetime('now')").bind(closureId, boardId, period, 'review', payload, sourceHash, authorization.userId || 'service').run();
      await recordAudit(db, { boardId, action: 'accounting_period_close_prepared', entityType: 'accounting_period_closure', entityId: closureId, userId: authorization.userId || undefined, details: { period, blocking, warnings, sourceHash } }); return json({ ok: true, action, closureId, period, status: 'review', checks, blocking, warnings, ready: blocking.length === 0, sourceHash }, { status: 201 });
    }
    if (action === 'approve_period_close') {
      const period = String(value?.period || '').trim(); if (!periodPattern.test(period)) return json({ error: 'period_invalid' }, { status: 400 });
      const closure = await db.prepare("SELECT * FROM accounting_period_closures WHERE board_id=? AND period=? AND status='review'").bind(boardId, period).first<Record<string, unknown>>(); if (!closure) return json({ error: 'period_close_not_in_review' }, { status: 409 });
      const checks = JSON.parse(String(closure.checks_json || '{}')); const blocking = Object.entries(checks).filter(([, check]) => Boolean((check as Record<string, unknown>)?.blocking)).map(([name]) => name); if (blocking.length) return json({ error: 'period_close_checks_blocking', blocking }, { status: 409 });
      await db.prepare("UPDATE accounting_period_closures SET status='approved',approved_by=?,approved_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND board_id=? AND status='review'").bind(authorization.userId || 'service', closure.id, boardId).run(); await recordAudit(db, { boardId, action: 'accounting_period_close_approved', entityType: 'accounting_period_closure', entityId: String(closure.id), userId: authorization.userId || undefined, details: { period } }); return json({ ok: true, action, period, status: 'approved' });
    }
    if (action === 'lock_period') {
      const period = String(value?.period || ''); if (!periodPattern.test(period)) return json({ error: 'period_invalid' }, { status: 400 });
      const closure = await db.prepare("SELECT status FROM accounting_period_closures WHERE board_id=? AND period=?").bind(boardId, period).first<{ status: string }>(); if (!closure || closure.status !== 'approved') return json({ error: 'period_close_not_approved', period }, { status: 409 });
      const existing = await db.prepare('SELECT status,seal_checksum FROM accounting_periods WHERE board_id=? AND period=?').bind(boardId, period).first<Record<string, unknown>>();
      if (existing?.status === 'locked') return json({ error: 'period_already_locked', period, sealChecksum: existing.seal_checksum || null }, { status: 409 });
      const rows = (await db.prepare(`SELECT v.voucher_number,v.voucher_date,v.description,l.id AS line_id,l.account_id,l.debit_minor,l.credit_minor,l.vat_code
        FROM vouchers v JOIN voucher_lines l ON l.voucher_id=v.id WHERE v.board_id=? AND v.period=? ORDER BY v.voucher_number,l.id`).bind(boardId, period).all()).results;
      const sealChecksum = await sha256(JSON.stringify(rows));
      const lockedBy = authorization.userId || String(value?.lockedBy || 'service');
      await db.prepare("INSERT INTO accounting_periods (id,board_id,period,status,locked_by,locked_at,seal_checksum) VALUES (?,?,?,?,?,datetime('now'),?) ON CONFLICT(board_id,period) DO UPDATE SET status='locked',locked_by=excluded.locked_by,locked_at=datetime('now'),seal_checksum=excluded.seal_checksum").bind(id('period'), boardId, period, 'locked', lockedBy, sealChecksum).run();
      await db.prepare("UPDATE accounting_period_closures SET status='locked',locked_by=?,locked_at=datetime('now'),updated_at=datetime('now') WHERE board_id=? AND period=? AND status='approved'").bind(lockedBy, boardId, period).run();
      await recordAudit(db, { boardId, action: 'accounting_period_locked', entityType: 'accounting_period', entityId: period, userId: authorization.userId || undefined, details: { period, sealChecksum, voucherLineCount: rows.length } });
      return json({ ok: true, action, boardId, period, status: 'locked', sealChecksum, voucherLineCount: rows.length, requiresHumanReview: true });
    }
    if (action === 'record_saf_t_export') {
      const from = String(value?.from || ''); const to = String(value?.to || '');
      if (!periodPattern.test(from) || !periodPattern.test(to) || from > to) return json({ error: 'period_range_invalid' }, { status: 400 });
      const result = await buildSafT(db, boardId, from, to);
      const exportId = id('saft');
      await db.prepare('INSERT INTO saf_t_exports (id,board_id,period_from,period_to,status,row_count,checksum,created_by) VALUES (?,?,?,?,?,?,?,?)').bind(exportId, boardId, from, to, 'prepared', result.rowCount, result.checksum, authorization.userId || 'authorized-user').run();
      await recordAudit(db, { boardId, action: 'saf_t_export_prepared', entityType: 'saf_t_export', entityId: exportId, userId: authorization.userId || undefined, details: { from, to, rowCount: result.rowCount, checksum: result.checksum } });
      return json({ ok: true, action, exportId, from, to, rowCount: result.rowCount, checksum: result.checksum, status: 'prepared', downloadUrl: `/api/finance?boardId=${encodeURIComponent(boardId)}&view=saf-t&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` }, { status: 201 });
    }
    if (action === 'prepare_fx') {
      const reference = String(value?.reference || '').trim(); const currency = String(value?.currency || '').trim().toUpperCase(); const period = String(value?.period || '').trim();
      const foreignAmountMinor = asMinor(value?.foreignAmountMinor); const bookedRate = Number(value?.bookedRate); const closingRate = Number(value?.closingRate);
      if (!reference || reference.length > 120 || !/^[A-Z]{3}$/.test(currency) || !periodPattern.test(period) || foreignAmountMinor === null || foreignAmountMinor <= 0 || !Number.isFinite(bookedRate) || bookedRate <= 0 || !Number.isFinite(closingRate) || closingRate <= 0) return json({ error: 'fx_fields_invalid' }, { status: 400 });
      const bookedNokMinor = Math.round(foreignAmountMinor * bookedRate); const closingNokMinor = Math.round(foreignAmountMinor * closingRate); const gainLossMinor = closingNokMinor - bookedNokMinor; const fxId = id('fx');
      await db.prepare("INSERT INTO fx_revaluations (id,board_id,reference,currency,period,foreign_amount_minor,booked_rate,closing_rate,booked_nok_minor,closing_nok_minor,gain_loss_minor,source,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'review')").bind(fxId, boardId, reference, currency, period, foreignAmountMinor, bookedRate, closingRate, bookedNokMinor, closingNokMinor, gainLossMinor, String(value?.source || 'manual') === 'norges_bank' ? 'norges_bank' : 'manual').run();
      await recordAudit(db, { boardId, action: 'fx_revaluation_prepared', entityType: 'fx_revaluation', entityId: fxId, userId: authorization.userId || undefined, details: { reference, currency, period, bookedRate, closingRate, gainLossMinor, source: String(value?.source || 'manual') === 'norges_bank' ? 'norges_bank' : 'manual', glPosting: 'not_configured' } });
      return json({ ok: true, action, fxId, status: 'review', reference, currency, period, bookedNokMinor, closingNokMinor, gainLossMinor, source: String(value?.source || 'manual') === 'norges_bank' ? 'norges_bank' : 'manual', glPosting: 'not_configured' }, { status: 201 });
    }
    if (action === 'approve_fx') {
      const fxId = String(value?.fxId || '').trim(); if (!fxId) return json({ error: 'fxId_required' }, { status: 400 });
      const result = await db.prepare("UPDATE fx_revaluations SET status='approved',approved_by=?,approved_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('draft','review')").bind(authorization.userId || 'service', fxId, boardId).run(); if (!result.meta?.changes) return json({ error: 'fx_not_open_or_found' }, { status: 409 });
      await recordAudit(db, { boardId, action: 'fx_revaluation_approved', entityType: 'fx_revaluation', entityId: fxId, userId: authorization.userId || undefined, details: { glPosting: 'not_configured' } }); return json({ ok: true, action, fxId, status: 'approved', glPosting: 'not_configured' });
    }
    if (action === 'prepare_intercompany') {
      const sourceEntity=String(value?.sourceEntity||'').trim(), targetEntity=String(value?.targetEntity||'').trim(), reference=String(value?.reference||'').trim(), period=String(value?.period||'');
      const amount=asMinor(value?.amountMinor); if(!sourceEntity||!targetEntity||!reference||amount===null||!periodPattern.test(period)||sourceEntity===targetEntity)return json({error:'intercompany_fields_invalid'},{status:400});
      const postingId=id('ic'); await db.prepare('INSERT INTO intercompany_postings (id,board_id,source_entity,target_entity,reference,amount_minor,currency,period,status,elimination_required) VALUES (?,?,?,?,?,?,?,?,?,1)').bind(postingId,boardId,sourceEntity,targetEntity,reference,amount,String(value?.currency||'NOK'),period,'prepared').run(); return json({ok:true,action,postingId,status:'prepared',requiresHumanApproval:true},{status:201});
    }
    if (action === 'approve_intercompany') {
      const postingId=String(value?.postingId||''); const result=await db.prepare("UPDATE intercompany_postings SET status='mirrored' WHERE id=? AND board_id=? AND status IN ('prepared','review')").bind(postingId,boardId).run(); if(!result.meta?.changes)return json({error:'intercompany_not_open_or_found'},{status:409}); return json({ok:true,action,postingId,status:'mirrored',targetVoucher:'not_created',requiresHumanApproval:true});
    }
    if (action === 'create_invoice') {
      const invoiceNumber=String(value?.invoiceNumber||'').trim(), issueDate=String(value?.issueDate||'').trim(), dueDate=String(value?.dueDate||'').trim()||null, description=String(value?.description||'').trim(), amountMinor=Number(value?.amountMinor||0), vatMinor=Number(value?.vatMinor||0);
      const accountId=String(value?.accountId||'').trim();
      if (!invoiceNumber||!accountId||!datePattern.test(issueDate)||(dueDate&&!datePattern.test(dueDate))||!description||!Number.isSafeInteger(amountMinor)||amountMinor<=0||!Number.isSafeInteger(vatMinor)||vatMinor<0) return json({error:'invoice_fields_invalid'},{status:400});
      if (!(await db.prepare("SELECT id FROM crm_accounts WHERE id=? AND board_id=? AND stage NOT IN ('lost')").bind(accountId,boardId).first())) return json({error:'customer_not_found'},{status:400});
      const invoiceId=id('sinv'), totalMinor=amountMinor+vatMinor;
      await db.prepare("INSERT INTO sales_invoices (id,board_id,account_id,invoice_number,issue_date,due_date,description,amount_minor,vat_minor,total_minor,currency,status,source,external_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'NOK','draft','manual','not_configured')").bind(invoiceId,boardId,accountId,invoiceNumber,issueDate,dueDate,description,amountMinor,vatMinor,totalMinor).run();
      await recordAudit(db,{boardId,action:'sales_invoice_created',entityType:'sales_invoice',entityId:invoiceId,userId:authorization.userId||undefined,details:{status:'draft',externalDelivery:'not_configured'}});
      return json({ok:true,action,invoiceId,status:'draft',totalMinor,externalDelivery:'not_configured'},{status:201});
    }
    if (action === 'review_invoice') {
      const invoiceId=String(value?.invoiceId||'').trim(); const result=await db.prepare("UPDATE sales_invoices SET status='review',updated_at=datetime('now') WHERE id=? AND board_id=? AND status='draft'").bind(invoiceId,boardId).run(); if(!result.meta?.changes)return json({error:'invoice_not_draft_or_found'},{status:409}); await recordAudit(db,{boardId,action:'sales_invoice_reviewed',entityType:'sales_invoice',entityId:invoiceId,userId:authorization.userId||undefined,details:{status:'review'}}); return json({ok:true,action,invoiceId,status:'review',requiresHumanApproval:true});
    }
    if (action === 'approve_invoice') {
      const invoiceId=String(value?.invoiceId||'').trim(); const result=await db.prepare("UPDATE sales_invoices SET status='approved',approved_by=?,approved_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND board_id=? AND status='review'").bind(authorization.userId||String(value?.approvedBy||'api'),invoiceId,boardId).run(); if(!result.meta?.changes)return json({error:'invoice_not_in_review_or_found'},{status:409}); await recordAudit(db,{boardId,action:'sales_invoice_approved',entityType:'sales_invoice',entityId:invoiceId,userId:authorization.userId||undefined,details:{status:'approved',externalDelivery:'not_configured'}}); return json({ok:true,action,invoiceId,status:'approved',externalDelivery:'not_configured'});
    }
    if (action === 'record_invoice_payment') {
      const invoiceId=String(value?.invoiceId||'').trim(), paymentReference=String(value?.paymentReference||'').trim(); if(!paymentReference)return json({error:'payment_reference_required'},{status:400}); const result=await db.prepare("UPDATE sales_invoices SET status='paid',paid_at=datetime('now'),payment_reference=?,updated_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('approved','sent','overdue')").bind(paymentReference,invoiceId,boardId).run(); if(!result.meta?.changes)return json({error:'invoice_not_payable_or_found'},{status:409}); await recordAudit(db,{boardId,action:'sales_invoice_payment_recorded',entityType:'sales_invoice',entityId:invoiceId,userId:authorization.userId||undefined,details:{status:'paid',paymentSource:'manual'}}); return json({ok:true,action,invoiceId,status:'paid',paymentSource:'manual'});
    }
    if (action === 'approve_note') {
      const noteId=String(value?.noteId||''); const result=await db.prepare("UPDATE statutory_notes SET status='approved',approved_by=?,approved_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('draft','review')").bind(value?.approvedBy||'api',noteId,boardId).run(); if(!result.meta?.changes)return json({error:'note_not_open_or_found'},{status:409}); return json({ok:true,action,noteId,status:'approved',externalFiling:'not_configured'});
    }
    if (action === 'prepare_note') {
      const period = String(value?.period || '').trim(); const noteType = String(value?.noteType || 'remuneration').trim();
      if (!/^\d{4}(?:-(0[1-9]|1[0-2]))?$/.test(period) || !['remuneration','fte','related_party_loans'].includes(noteType)) return json({ error: 'note_fields_invalid' }, { status: 400 });
      const payrollPeriod = period.length === 7 ? period : `${period}%`;
      const [people, payroll, equity, grants] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS count FROM people WHERE board_id=? AND employment_status='active'").bind(boardId).first<Record<string, unknown>>(),
        db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(gross_minor),0) AS gross_minor,COALESCE(SUM(employer_cost_minor),0) AS employer_cost_minor FROM payroll_runs WHERE board_id=? AND period LIKE ?").bind(boardId, payrollPeriod).first<Record<string, unknown>>(),
        db.prepare("SELECT COUNT(*) AS holders,COALESCE(SUM(shares),0) AS shares FROM equity_holders WHERE board_id=?").bind(boardId).first<Record<string, unknown>>(),
        db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(granted_shares),0) AS granted_shares FROM equity_grants WHERE board_id=? AND (grant_date IS NULL OR substr(grant_date,1,4)<=?)").bind(boardId, period.slice(0, 4)).first<Record<string, unknown>>(),
      ]);
      const payload = { noteType, period, fte: Number(people?.count || 0), payrollGrossMinor: Number(payroll?.gross_minor || 0), employerCostMinor: Number(payroll?.employer_cost_minor || 0), equityShares: Number(equity?.shares || 0), equityHolderCount: Number(equity?.holders || 0), grantedSharesToDate: Number(grants?.granted_shares || 0), relatedPartyLoansMinor: 0, relatedPartyLoansSource: 'not_configured', generatedBy: 'styr.ing-rules', externalFiling: 'not_configured' };
      const evidence = [{ source: 'people', period, rows: Number(people?.count || 0) }, { source: 'payroll_runs', period: period.length === 4 ? `through-${period}` : period, rows: Number(payroll?.count || 0) }, { source: 'equity_holders', period: 'all_current', rows: Number(equity?.holders || 0) }, { source: 'equity_grants', period: `through-${period.slice(0, 4)}`, rows: Number(grants?.count || 0) }, ...(noteType === 'related_party_loans' ? [{ source: 'related_party_loans', period, rows: 0, status: 'not_configured' }] : [])];
      const existing = await db.prepare("SELECT id FROM statutory_notes WHERE board_id=? AND note_type=? AND period=? AND status IN ('draft','review') ORDER BY created_at DESC LIMIT 1").bind(boardId, noteType, period).first<{ id: string }>();
      const noteId = existing?.id || id('note');
      if (existing) await db.prepare("UPDATE statutory_notes SET status='review',payload=?,evidence_refs=?,approved_by=NULL,approved_at=NULL WHERE id=? AND board_id=?").bind(JSON.stringify(payload), JSON.stringify(evidence), noteId, boardId).run();
      else await db.prepare("INSERT INTO statutory_notes (id,board_id,note_type,period,status,payload,evidence_refs) VALUES (?,?,?,?,?,?,?)").bind(noteId, boardId, noteType, period, 'review', JSON.stringify(payload), JSON.stringify(evidence)).run();
      await recordAudit(db, { boardId, action: existing ? 'statutory_note_refreshed' : 'statutory_note_prepared', entityType: 'statutory_note', entityId: noteId, userId: authorization.userId || undefined, details: { noteType, period, evidenceSources: evidence.map((item) => item.source), externalFiling: 'not_configured' } });
      return json({ ok: true, action, noteId, noteType, period, status: 'review', payload, evidence, externalFiling: 'not_configured' }, { status: existing ? 200 : 201 });
    }
    const voucher = (value?.voucher && typeof value.voucher === 'object') ? value.voucher as Record<string, unknown> : value || {};
    const voucherDate = String(voucher.voucherDate || voucher.voucher_date || ''); const period = String(voucher.period || voucherDate.slice(0, 7)); const description = String(voucher.description || '').trim();
    const lines = Array.isArray(voucher.lines) ? voucher.lines as Record<string, unknown>[] : [];
    if (!datePattern.test(voucherDate) || !periodPattern.test(period) || !description || lines.length < 2 || lines.length > 100) return json({ error: 'voucher_fields_invalid', required: ['voucherDate','period','description','lines(min 2)'] }, { status: 400 });
    const locked = await db.prepare("SELECT status FROM accounting_periods WHERE board_id=? AND period=? AND status='locked'").bind(boardId, period).first(); if (locked) return json({ error: 'period_locked', period }, { status: 409 });
    let debit = 0; let credit = 0; const normalized = [] as { accountId: string; description: string; debit: number; credit: number; vatCode: string | null }[];
    for (const line of lines) { const accountId = String(line.accountId || line.account_id || ''); const d = asMinor(line.debitMinor ?? line.debit_minor ?? 0); const c = asMinor(line.creditMinor ?? line.credit_minor ?? 0); if (!accountId || d === null || c === null || (d === 0 && c === 0) || (d > 0 && c > 0)) return json({ error: 'voucher_line_invalid' }, { status: 400 }); debit += d; credit += c; normalized.push({ accountId, description: String(line.description || ''), debit: d, credit: c, vatCode: line.vatCode ? String(line.vatCode) : null }); }
    if (debit !== credit) return json({ error: 'voucher_not_balanced', debitMinor: debit, creditMinor: credit }, { status: 422 });
    const accountIds = [...new Set(normalized.map((line) => line.accountId))]; const placeholders = accountIds.map(() => '?').join(','); const accountRows = (await db.prepare(`SELECT id FROM ledger_accounts WHERE board_id=? AND active=1 AND id IN (${placeholders})`).bind(boardId, ...accountIds).all()).results; if (accountRows.length !== accountIds.length) return json({ error: 'account_not_found' }, { status: 400 });
    // Allocate and consume the per-board sequence in the same D1 batch as the
    // voucher and its lines. A failed batch rolls back the sequence increment,
    // so successful vouchers keep a gapless, collision-free number trail.
    const voucherId = id('voucher');
    const statements = [
      db.prepare('INSERT INTO voucher_sequences (board_id,next_number) SELECT ?,COALESCE(MAX(voucher_number),0)+1 FROM vouchers WHERE board_id=? ON CONFLICT(board_id) DO NOTHING').bind(boardId, boardId),
      db.prepare("UPDATE voucher_sequences SET next_number=next_number+1,updated_at=datetime('now') WHERE board_id=?").bind(boardId),
      db.prepare('INSERT INTO vouchers (id,board_id,voucher_number,voucher_date,period,description,source,status,external_reference,created_by) SELECT ?,?,next_number-1,?,?,?,?,?,?,? FROM voucher_sequences WHERE board_id=?').bind(voucherId, boardId, voucherDate, period, description, String(voucher.source || 'manual'), 'posted', voucher.externalReference || null, String(voucher.createdBy || 'api'), boardId),
    ];
    normalized.forEach((line) => statements.push(db.prepare('INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,?)').bind(id('line'), voucherId, line.accountId, line.description, line.debit, line.credit, line.vatCode)));
    await db.batch(statements);
    const created = await db.prepare('SELECT voucher_number FROM vouchers WHERE id=? AND board_id=?').bind(voucherId, boardId).first<{ voucher_number: number }>();
    if (!created) return json({ error: 'voucher_created_without_number' }, { status: 503 });
    const voucherNumber = Number(created.voucher_number);
    await recordAudit(db, { boardId, action: 'voucher_created', entityType: 'voucher', entityId: voucherId, userId: authorization.userId || undefined, details: { period, voucherNumber, debitMinor: debit, creditMinor: credit, numbering: 'atomic_sequence' } });
    return json({ ok: true, action: 'create_voucher', boardId, voucherId, voucherNumber, period, debitMinor: debit, creditMinor: credit }, { status: 201 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
