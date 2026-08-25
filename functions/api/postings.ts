import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, sha256, type Env } from './_lib';

const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const text = (value: unknown, max = 240) => String(value ?? '').trim().slice(0, max);
const integerMinor = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
type PostingLine = { accountId: string; description: string; debitMinor: number; creditMinor: number; vatCode?: string | null };

async function accountsExist(db: D1Database, boardId: string, accountIds: string[]) {
  const unique = [...new Set(accountIds.filter(Boolean))]; if (!unique.length) return false;
  const placeholders = unique.map(() => '?').join(',');
  const rows = (await db.prepare(`SELECT id FROM ledger_accounts WHERE board_id=? AND active=1 AND id IN (${placeholders})`).bind(boardId, ...unique).all()).results as Record<string, unknown>[];
  return rows.length === unique.length;
}

async function nextVoucher(db: D1Database, boardId: string, voucher: { voucherDate: string; period: string; description: string; source: string; externalReference: string; createdBy: string }, lines: PostingLine[]) {
  const voucherId = id('voucher');
  let debit = 0; let credit = 0;
  for (const line of lines) { debit += line.debitMinor; credit += line.creditMinor; }
  if (debit !== credit || debit <= 0) throw new Error('posting_not_balanced');
  const statements = [
    db.prepare('INSERT INTO voucher_sequences (board_id,next_number) SELECT ?,COALESCE(MAX(voucher_number),0)+1 FROM vouchers WHERE board_id=? ON CONFLICT(board_id) DO NOTHING').bind(boardId, boardId),
    db.prepare("UPDATE voucher_sequences SET next_number=next_number+1,updated_at=datetime('now') WHERE board_id=?").bind(boardId),
    db.prepare('INSERT INTO vouchers (id,board_id,voucher_number,voucher_date,period,description,source,status,external_reference,created_by) SELECT ?,?,next_number-1,?,?,?,?,?,?,? FROM voucher_sequences WHERE board_id=?').bind(voucherId, boardId, voucher.voucherDate, voucher.period, voucher.description, voucher.source, 'posted', voucher.externalReference, voucher.createdBy, boardId),
  ];
  for (const line of lines) statements.push(db.prepare('INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,?)').bind(id('line'), voucherId, line.accountId, line.description, line.debitMinor, line.creditMinor, line.vatCode || null));
  await db.batch(statements);
  const created = await db.prepare('SELECT voucher_number FROM vouchers WHERE id=? AND board_id=?').bind(voucherId, boardId).first<{ voucher_number: number }>();
  if (!created) throw new Error('voucher_created_without_number');
  return { voucherId, voucherNumber: Number(created.voucher_number), debit, credit };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const u = new URL(request.url); const boardId = text(u.searchParams.get('boardId'), 100); const view = u.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 }); if (!['summary', 'proposals'].includes(view)) return json({ error: 'unknown_view', allowed: ['summary', 'proposals'] }, { status: 400 }); if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'proposals') return json({ boardId, view, data: (await db.prepare('SELECT p.*,CASE WHEN p.source_type=\'sales_invoice\' THEN s.invoice_number ELSE si.invoice_number END AS source_reference,CASE WHEN p.source_type=\'sales_invoice\' THEN s.description ELSE si.supplier_name END AS source_label FROM posting_proposals p LEFT JOIN sales_invoices s ON p.source_type=\'sales_invoice\' AND s.id=p.source_id LEFT JOIN supplier_invoices si ON p.source_type=\'supplier_invoice\' AND si.id=p.source_id WHERE p.board_id=? ORDER BY p.created_at DESC').bind(boardId).all()).results });
    const [review, approved, posted] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM posting_proposals WHERE board_id=? AND status='review'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM posting_proposals WHERE board_id=? AND status='approved'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM posting_proposals WHERE board_id=? AND status='posted'").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { review, approved, posted, ledgerPosting: 'controlled' } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request); const boardId = text(value?.boardId, 100); const action = text(value?.action, 60); const db = requireDb(env);
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 }); const authorization = await authorizeBoardWrite(request, env, boardId); if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 }); const actor = authorization.userId || 'service';
    if (action === 'prepare_sales_invoice' || action === 'prepare_supplier_invoice') {
      const sourceType = action === 'prepare_sales_invoice' ? 'sales_invoice' : 'supplier_invoice'; const sourceId = text(value?.sourceId, 120);
      const source = sourceType === 'sales_invoice'
        ? await db.prepare("SELECT id,invoice_number,issue_date,description,amount_minor,vat_minor,total_minor,status FROM sales_invoices WHERE id=? AND board_id=? AND status='approved'").bind(sourceId, boardId).first<Record<string, unknown>>()
        : await db.prepare("SELECT id,invoice_number,supplier_name,due_date,amount_minor,status,match_status FROM supplier_invoices WHERE id=? AND board_id=? AND status='approved' AND match_status='matched'").bind(sourceId, boardId).first<Record<string, unknown>>();
      if (!source) return json({ error: sourceType === 'sales_invoice' ? 'sales_invoice_not_approved' : 'supplier_invoice_not_approved_or_unmatched' }, { status: 409 });
      const period = text(value?.period, 20) || text(sourceType === 'sales_invoice' ? source.issue_date : source.due_date, 20).slice(0, 7); const voucherDate = text(value?.voucherDate, 20) || text(sourceType === 'sales_invoice' ? source.issue_date : source.due_date, 20);
      if (!periodPattern.test(period) || !datePattern.test(voucherDate)) return json({ error: 'period_or_voucher_date_invalid' }, { status: 400 });
      const total = sourceType === 'sales_invoice' ? Number(source.total_minor || 0) : Number(source.amount_minor || 0); const suppliedVat = integerMinor(value?.vatMinor ?? (sourceType === 'sales_invoice' ? source.vat_minor : 0));
      if (!Number.isSafeInteger(total) || total <= 0 || suppliedVat === null || suppliedVat > total) return json({ error: 'amount_or_vat_invalid' }, { status: 400 });
      const net = total - suppliedVat; const accountIds = sourceType === 'sales_invoice' ? [text(value?.receivableAccountId || value?.primaryAccountId, 120), text(value?.revenueAccountId || value?.secondaryAccountId, 120), suppliedVat ? text(value?.vatAccountId, 120) : ''] : [text(value?.expenseAccountId || value?.primaryAccountId, 120), text(value?.payableAccountId || value?.secondaryAccountId, 120), suppliedVat ? text(value?.vatAccountId, 120) : ''];
      if (accountIds.some((x, index) => index < 2 && !x) || (suppliedVat && !accountIds[2]) || !(await accountsExist(db, boardId, accountIds))) return json({ error: 'posting_accounts_invalid' }, { status: 400 });
      const lines: PostingLine[] = sourceType === 'sales_invoice'
        ? [{ accountId: accountIds[0], description: `Kundefordring ${text(source.invoice_number, 80)}`, debitMinor: total, creditMinor: 0 }, { accountId: accountIds[1], description: text(source.description, 200), debitMinor: 0, creditMinor: net, vatCode: suppliedVat ? '3' : null }, ...(suppliedVat ? [{ accountId: accountIds[2], description: `Utgående MVA ${text(source.invoice_number, 80)}`, debitMinor: 0, creditMinor: suppliedVat, vatCode: null }] : [])]
        : [{ accountId: accountIds[0], description: `Kjøp ${text(source.invoice_number, 80)}`, debitMinor: net, creditMinor: 0, vatCode: suppliedVat ? '1' : null }, ...(suppliedVat ? [{ accountId: accountIds[2], description: `Inngående MVA ${text(source.invoice_number, 80)}`, debitMinor: suppliedVat, creditMinor: 0, vatCode: null }] : []), { accountId: accountIds[1], description: `Leverandørgjeld ${text(source.invoice_number, 80)}`, debitMinor: 0, creditMinor: total }];
      const snapshot = JSON.stringify({ sourceType, source, period, voucherDate, suppliedVat, lines }); const proposalId = id('posting'); const sourceHash = await sha256(snapshot);
      try { await db.prepare('INSERT INTO posting_proposals (id,board_id,source_type,source_id,period,voucher_date,description,amount_minor,lines_json,source_snapshot,source_hash,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,\'review\',?)').bind(proposalId, boardId, sourceType, sourceId, period, voucherDate, sourceType === 'sales_invoice' ? `Faktura ${text(source.invoice_number, 80)}` : `Leverandørfaktura ${text(source.invoice_number, 80)}`, total, JSON.stringify(lines), snapshot, sourceHash, actor).run(); } catch (error) { if (error instanceof Error && error.message.includes('UNIQUE')) return json({ error: 'posting_proposal_exists' }, { status: 409 }); throw error; }
      await recordAudit(db, { boardId, action: 'posting_proposal_prepared', entityType: 'posting_proposal', entityId: proposalId, userId: authorization.userId || undefined, details: { sourceType, sourceId, period, amountMinor: total, vatMinor: suppliedVat, requiresHumanApproval: true } }); return json({ ok: true, action, proposalId, sourceType, sourceId, period, status: 'review', amountMinor: total, vatMinor: suppliedVat, requiresHumanApproval: true }, { status: 201 });
    }
    if (action === 'approve_proposal') { const proposalId = text(value?.proposalId, 120); const result = await db.prepare("UPDATE posting_proposals SET status='approved',approved_by=?,approved_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND board_id=? AND status='review'").bind(actor, proposalId, boardId).run(); if (!result.meta?.changes) return json({ error: 'proposal_not_in_review_or_found' }, { status: 409 }); await recordAudit(db, { boardId, action: 'posting_proposal_approved', entityType: 'posting_proposal', entityId: proposalId, userId: authorization.userId || undefined, details: { requiresHumanApproval: false } }); return json({ ok: true, action, proposalId, status: 'approved' }); }
    if (action === 'post_proposal') {
      const proposalId = text(value?.proposalId, 120); const proposal = await db.prepare("SELECT * FROM posting_proposals WHERE id=? AND board_id=? AND status='approved'").bind(proposalId, boardId).first<Record<string, unknown>>(); if (!proposal) return json({ error: 'proposal_not_approved_or_found' }, { status: 409 });
      if (await db.prepare("SELECT 1 FROM accounting_periods WHERE board_id=? AND period=? AND status='locked'").bind(boardId, proposal.period).first()) return json({ error: 'period_locked', period: proposal.period }, { status: 409 });
      const lines = JSON.parse(String(proposal.lines_json || '[]')) as PostingLine[]; if (!lines.length || !(await accountsExist(db, boardId, lines.map((line) => line.accountId)))) return json({ error: 'posting_lines_invalid' }, { status: 400 });
      const posted = await nextVoucher(db, boardId, { voucherDate: String(proposal.voucher_date), period: String(proposal.period), description: String(proposal.description), source: `posting:${proposal.source_type}`, externalReference: `${proposal.source_type}:${proposal.source_id}`, createdBy: actor }, lines);
      await db.prepare("UPDATE posting_proposals SET status='posted',voucher_id=?,posted_by=?,posted_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND board_id=? AND status='approved'").bind(posted.voucherId, actor, proposalId, boardId).run(); await recordAudit(db, { boardId, action: 'posting_proposal_posted', entityType: 'posting_proposal', entityId: proposalId, userId: authorization.userId || undefined, details: { voucherId: posted.voucherId, voucherNumber: posted.voucherNumber, period: proposal.period, sourceType: proposal.source_type, sourceId: proposal.source_id } }); return json({ ok: true, action, proposalId, status: 'posted', voucherId: posted.voucherId, voucherNumber: posted.voucherNumber, period: proposal.period }, { status: 201 });
    }
    return json({ error: 'unknown_action', allowed: ['prepare_sales_invoice', 'prepare_supplier_invoice', 'approve_proposal', 'post_proposal'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
