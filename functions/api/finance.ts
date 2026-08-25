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

async function boardData(env: Env, boardId: string, view: string) {
  const db = requireDb(env);
  if (view === 'accounts') return (await db.prepare('SELECT id,code,name,account_type,vat_code,active FROM ledger_accounts WHERE board_id = ? ORDER BY code').bind(boardId).all()).results;
  if (view === 'periods') return (await db.prepare('SELECT id,period,status,locked_by,locked_at FROM accounting_periods WHERE board_id = ? ORDER BY period DESC').bind(boardId).all()).results;
  if (view === 'saf-t-exports') return (await db.prepare('SELECT id,period_from,period_to,status,row_count,checksum,created_by,created_at FROM saf_t_exports WHERE board_id=? ORDER BY created_at DESC LIMIT 50').bind(boardId).all()).results;
  if (view === 'intercompany') return (await db.prepare('SELECT * FROM intercompany_postings WHERE board_id=? ORDER BY period DESC,created_at DESC').bind(boardId).all()).results;
  if (view === 'notes') return (await db.prepare('SELECT * FROM statutory_notes WHERE board_id=? ORDER BY period DESC,created_at DESC').bind(boardId).all()).results;
  if (view === 'vouchers') return (await db.prepare(`SELECT v.id,v.voucher_number,v.voucher_date,v.period,v.description,v.source,v.status,v.external_reference,
    COALESCE(SUM(l.debit_minor),0) AS debit_minor, COALESCE(SUM(l.credit_minor),0) AS credit_minor
    FROM vouchers v LEFT JOIN voucher_lines l ON l.voucher_id = v.id WHERE v.board_id = ? GROUP BY v.id ORDER BY v.voucher_date DESC,v.voucher_number DESC LIMIT 500`).bind(boardId).all()).results;
    const [accounts, periods, vouchers, intercompany, notes] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM ledger_accounts WHERE board_id = ? AND active = 1').bind(boardId).first(),
    db.prepare("SELECT COUNT(*) AS count FROM accounting_periods WHERE board_id = ? AND status = 'locked'").bind(boardId).first(),
    db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(debit_minor),0) AS debit_minor, COALESCE(SUM(credit_minor),0) AS credit_minor FROM vouchers v LEFT JOIN voucher_lines l ON l.voucher_id = v.id WHERE v.board_id = ?').bind(boardId).first(),
    db.prepare("SELECT COUNT(*) AS count,SUM(CASE WHEN status IN ('prepared','review') THEN 1 ELSE 0 END) AS open_count FROM intercompany_postings WHERE board_id=?").bind(boardId).first(),
    db.prepare("SELECT COUNT(*) AS count,SUM(CASE WHEN status IN ('draft','review') THEN 1 ELSE 0 END) AS open_count FROM statutory_notes WHERE board_id=?").bind(boardId).first(),
  ]);
  return { accounts, periods, vouchers, intercompany, notes };
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
    if (action === 'lock_period') {
      const period = String(value?.period || ''); if (!periodPattern.test(period)) return json({ error: 'period_invalid' }, { status: 400 });
      const existing = await db.prepare('SELECT status FROM accounting_periods WHERE board_id=? AND period=?').bind(boardId, period).first<Record<string, unknown>>();
      if (existing?.status === 'locked') return json({ error: 'period_already_locked' }, { status: 409 });
      const lockedBy = authorization.userId || String(value?.lockedBy || 'service');
      await db.prepare("INSERT INTO accounting_periods (id,board_id,period,status,locked_by,locked_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(board_id,period) DO UPDATE SET status='locked',locked_by=excluded.locked_by,locked_at=datetime('now')").bind(id('period'), boardId, period, 'locked', lockedBy).run();
      await recordAudit(db, { boardId, action: 'accounting_period_locked', entityType: 'accounting_period', entityId: period, userId: authorization.userId || undefined, details: { period } });
      return json({ ok: true, action, boardId, period, status: 'locked', requiresHumanReview: true });
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
    if (action === 'prepare_intercompany') {
      const sourceEntity=String(value?.sourceEntity||'').trim(), targetEntity=String(value?.targetEntity||'').trim(), reference=String(value?.reference||'').trim(), period=String(value?.period||'');
      const amount=asMinor(value?.amountMinor); if(!sourceEntity||!targetEntity||!reference||amount===null||!periodPattern.test(period)||sourceEntity===targetEntity)return json({error:'intercompany_fields_invalid'},{status:400});
      const postingId=id('ic'); await db.prepare('INSERT INTO intercompany_postings (id,board_id,source_entity,target_entity,reference,amount_minor,currency,period,status,elimination_required) VALUES (?,?,?,?,?,?,?,?,?,1)').bind(postingId,boardId,sourceEntity,targetEntity,reference,amount,String(value?.currency||'NOK'),period,'prepared').run(); return json({ok:true,action,postingId,status:'prepared',requiresHumanApproval:true},{status:201});
    }
    if (action === 'approve_intercompany') {
      const postingId=String(value?.postingId||''); const result=await db.prepare("UPDATE intercompany_postings SET status='mirrored' WHERE id=? AND board_id=? AND status IN ('prepared','review')").bind(postingId,boardId).run(); if(!result.meta?.changes)return json({error:'intercompany_not_open_or_found'},{status:409}); return json({ok:true,action,postingId,status:'mirrored',targetVoucher:'not_created',requiresHumanApproval:true});
    }
    if (action === 'approve_note') {
      const noteId=String(value?.noteId||''); const result=await db.prepare("UPDATE statutory_notes SET status='approved',approved_by=?,approved_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('draft','review')").bind(value?.approvedBy||'api',noteId,boardId).run(); if(!result.meta?.changes)return json({error:'note_not_open_or_found'},{status:409}); return json({ok:true,action,noteId,status:'approved',externalFiling:'not_configured'});
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
    const next = await db.prepare('SELECT COALESCE(MAX(voucher_number),0)+1 AS next FROM vouchers WHERE board_id=?').bind(boardId).first<Record<string, unknown>>(); const voucherNumber = Number(next?.next || 1); const voucherId = id('voucher');
    const statements = [db.prepare('INSERT INTO vouchers (id,board_id,voucher_number,voucher_date,period,description,source,status,external_reference,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(voucherId, boardId, voucherNumber, voucherDate, period, description, String(voucher.source || 'manual'), 'posted', voucher.externalReference || null, String(voucher.createdBy || 'api'))];
    normalized.forEach((line) => statements.push(db.prepare('INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,?)').bind(id('line'), voucherId, line.accountId, line.description, line.debit, line.credit, line.vatCode)));
    await db.batch(statements); return json({ ok: true, action: 'create_voucher', boardId, voucherId, voucherNumber, period, debitMinor: debit, creditMinor: credit }, { status: 201 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
