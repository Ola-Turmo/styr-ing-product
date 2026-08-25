import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'accounts', 'transactions', 'suggestions']);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const text = (value: unknown, max = 240) => String(value ?? '').trim().slice(0, max);
const amount = (value: unknown) => Number.isInteger(Number(value)) ? Number(value) : NaN;

type Candidate = { entityType: 'sales_invoice' | 'supplier_invoice' | 'card_transaction'; entityId: string; reference: string; description: string; amountMinor: number; score: number; confidence: 'exact' | 'strong' | 'weak' };

async function candidates(db: D1Database, boardId: string, transaction: Record<string, unknown>) {
  const absoluteAmount = Math.abs(Number(transaction.amount_minor || 0));
  const reference = `${text(transaction.external_reference, 120)} ${text(transaction.description, 240)} ${text(transaction.counterparty, 160)}`.toLowerCase();
  const [sales, suppliers, cards] = await Promise.all([
    db.prepare("SELECT id,invoice_number,description,total_minor FROM sales_invoices WHERE board_id=? AND status NOT IN ('cancelled') AND ABS(total_minor)=?").bind(boardId, absoluteAmount).all(),
    db.prepare("SELECT id,invoice_number,supplier_name,amount_minor FROM supplier_invoices WHERE board_id=? AND status NOT IN ('paid') AND ABS(amount_minor)=?").bind(boardId, absoluteAmount).all(),
    db.prepare("SELECT id,merchant,amount_minor,transaction_date FROM card_transactions WHERE board_id=? AND status NOT IN ('reconciled','rejected') AND ABS(amount_minor)=?").bind(boardId, absoluteAmount).all(),
  ]);
  const result: Candidate[] = [];
  for (const row of (sales.results || []) as Record<string, unknown>[]) {
    const invoiceNumber = text(row.invoice_number, 80); const hit = invoiceNumber && reference.includes(invoiceNumber.toLowerCase());
    result.push({ entityType: 'sales_invoice', entityId: text(row.id), reference: invoiceNumber, description: text(row.description), amountMinor: Number(row.total_minor || 0), score: hit ? 100 : 50, confidence: hit ? 'exact' : 'strong' });
  }
  for (const row of (suppliers.results || []) as Record<string, unknown>[]) {
    const invoiceNumber = text(row.invoice_number, 80); const supplier = text(row.supplier_name, 160); const hit = (invoiceNumber && reference.includes(invoiceNumber.toLowerCase())) || (supplier && reference.includes(supplier.toLowerCase()));
    result.push({ entityType: 'supplier_invoice', entityId: text(row.id), reference: invoiceNumber, description: supplier, amountMinor: Number(row.amount_minor || 0), score: hit ? 100 : 50, confidence: hit ? 'exact' : 'strong' });
  }
  for (const row of (cards.results || []) as Record<string, unknown>[]) {
    const merchant = text(row.merchant, 160); const hit = merchant && reference.includes(merchant.toLowerCase());
    result.push({ entityType: 'card_transaction', entityId: text(row.id), reference: text(row.transaction_date, 30), description: merchant, amountMinor: Number(row.amount_minor || 0), score: hit ? 90 : 40, confidence: hit ? 'exact' : 'weak' });
  }
  return result.sort((a, b) => b.score - a.score || a.entityType.localeCompare(b.entityType));
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const u = new URL(request.url); const boardId = text(u.searchParams.get('boardId'), 100); const view = u.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'accounts') return json({ boardId, view, data: (await db.prepare('SELECT * FROM bank_accounts WHERE board_id=? ORDER BY name').bind(boardId).all()).results });
    const txQuery = view === 'suggestions'
      ? "SELECT t.*,a.name account_name FROM bank_transactions t JOIN bank_accounts a ON a.id=t.bank_account_id WHERE t.board_id=? AND t.status='suggested' ORDER BY t.transaction_date DESC"
      : 'SELECT t.*,a.name account_name FROM bank_transactions t JOIN bank_accounts a ON a.id=t.bank_account_id WHERE t.board_id=? ORDER BY t.transaction_date DESC,t.created_at DESC';
    if (view === 'transactions' || view === 'suggestions') return json({ boardId, view, data: (await db.prepare(txQuery).bind(boardId).all()).results });
    const [accounts, transactions, suggestions, approved] = await Promise.all([
      db.prepare("SELECT COUNT(*) count FROM bank_accounts WHERE board_id=? AND status NOT IN ('paused')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count,COALESCE(SUM(ABS(amount_minor)),0) amount_minor FROM bank_transactions WHERE board_id=? AND status IN ('imported','suggested')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM bank_transactions WHERE board_id=? AND status='suggested'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM bank_transactions WHERE board_id=? AND status='approved'").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { accounts, transactions, suggestions, approved, provider: 'not_configured', autoPosting: 'disabled' } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const v = await body(request); const boardId = text(v?.boardId, 100); const action = text(v?.action, 80); if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId); if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 });
    const db = requireDb(env); const actor = authorization.userId || 'service';
    if (action === 'create_account') {
      const name = text(v?.name, 160); const ledgerAccountId = text(v?.ledgerAccountId, 120) || null; if (!name) return json({ error: 'account_name_required' }, { status: 400 });
      if (ledgerAccountId && !(await db.prepare('SELECT id FROM ledger_accounts WHERE id=? AND board_id=? AND active=1').bind(ledgerAccountId, boardId).first())) return json({ error: 'ledger_account_not_found' }, { status: 400 });
      const accountId = id('bankacct'); await db.prepare('INSERT INTO bank_accounts (id,board_id,name,account_last_four,currency,provider,ledger_account_id,status) VALUES (?,?,?,?,?,?,?,?)').bind(accountId, boardId, name, text(v?.accountLastFour, 4) || null, text(v?.currency, 3) || 'NOK', text(v?.provider, 120) || null, ledgerAccountId, 'manual').run();
      await recordAudit(db, { boardId, action: 'bank_account_created', entityType: 'bank_account', entityId: accountId, userId: authorization.userId || undefined, details: { provider: 'not_configured', connection: 'manual', ledgerAccountId } }); return json({ ok: true, action, accountId, status: 'manual', provider: 'not_configured', ledgerAccountId }, { status: 201 });
    }
    if (action === 'import_transaction') {
      const bankAccountId = text(v?.bankAccountId, 120); const transactionDate = text(v?.transactionDate, 20); const description = text(v?.description, 240); const externalReference = text(v?.externalReference, 160); const amountMinor = amount(v?.amountMinor);
      if (!bankAccountId || !datePattern.test(transactionDate) || !description || !externalReference || !Number.isInteger(amountMinor) || amountMinor === 0) return json({ error: 'valid_account_date_description_reference_and_nonzero_amount_required' }, { status: 400 });
      if (!(await db.prepare('SELECT id FROM bank_accounts WHERE id=? AND board_id=?').bind(bankAccountId, boardId).first())) return json({ error: 'bank_account_not_found' }, { status: 404 });
      const transactionId = id('banktx'); await db.prepare('INSERT INTO bank_transactions (id,board_id,bank_account_id,transaction_date,value_date,description,counterparty,amount_minor,currency,external_reference,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(transactionId, boardId, bankAccountId, transactionDate, text(v?.valueDate, 20) || null, description, text(v?.counterparty, 160) || null, amountMinor, text(v?.currency, 3) || 'NOK', externalReference, 'imported').run();
      await recordAudit(db, { boardId, action: 'bank_transaction_imported', entityType: 'bank_transaction', entityId: transactionId, userId: authorization.userId || undefined, details: { source: 'manual_import', autoPosting: 'disabled' } }); return json({ ok: true, action, transactionId, status: 'imported', autoPosting: 'disabled' }, { status: 201 });
    }
    if (action === 'suggest_match') {
      const transactionId = text(v?.transactionId, 120); const transaction = await db.prepare('SELECT * FROM bank_transactions WHERE id=? AND board_id=? AND status IN (\'imported\',\'suggested\')').bind(transactionId, boardId).first<Record<string, unknown>>(); if (!transaction) return json({ error: 'transaction_not_imported_or_found' }, { status: 409 });
      const suggestions = await candidates(db, boardId, transaction); const best = suggestions[0]; if (!best) return json({ error: 'no_match_suggestion', transactionId, status: 'imported', suggestions: [] }, { status: 409 });
      await db.prepare("UPDATE bank_transactions SET status='suggested',match_entity_type=?,match_entity_id=?,match_confidence=? WHERE id=? AND board_id=?").bind(best.entityType, best.entityId, best.confidence, transactionId, boardId).run(); await recordAudit(db, { boardId, action: 'bank_match_suggested', entityType: 'bank_transaction', entityId: transactionId, userId: authorization.userId || undefined, details: { candidate: best, candidateCount: suggestions.length, requiresHumanApproval: true } }); return json({ ok: true, action, transactionId, status: 'suggested', suggestion: best, alternatives: suggestions.slice(1, 5), requiresHumanApproval: true });
    }
    if (action === 'approve_match') {
      const transactionId = text(v?.transactionId, 120); const transaction = await db.prepare("SELECT match_entity_type,match_entity_id,status FROM bank_transactions WHERE id=? AND board_id=? AND status='suggested'").bind(transactionId, boardId).first<{ match_entity_type?: string; match_entity_id?: string; status?: string }>(); if (!transaction?.match_entity_type || !transaction.match_entity_id) return json({ error: 'transaction_not_suggested' }, { status: 409 });
      await db.prepare("UPDATE bank_transactions SET status='approved',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND board_id=? AND status='suggested'").bind(actor, transactionId, boardId).run(); await recordAudit(db, { boardId, action: 'bank_match_approved', entityType: 'bank_transaction', entityId: transactionId, userId: authorization.userId || undefined, details: { matchEntityType: transaction.match_entity_type, matchEntityId: transaction.match_entity_id, ledgerPosting: 'controlled_human_posting' } }); return json({ ok: true, action, transactionId, status: 'approved', ledgerPosting: 'controlled_human_posting' });
    }
    if (action === 'reject_match') {
      const transactionId = text(v?.transactionId, 120); const result = await db.prepare("UPDATE bank_transactions SET status='rejected',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('imported','suggested')").bind(actor, transactionId, boardId).run(); if (!result.meta?.changes) return json({ error: 'transaction_not_open_or_found' }, { status: 409 }); await recordAudit(db, { boardId, action: 'bank_match_rejected', entityType: 'bank_transaction', entityId: transactionId, userId: authorization.userId || undefined, details: { reason: text(v?.reason, 240) || 'human_rejection' } }); return json({ ok: true, action, transactionId, status: 'rejected' });
    }
    if (action === 'post_match') {
      const transactionId = text(v?.transactionId, 120); const transaction = await db.prepare("SELECT t.*,a.ledger_account_id FROM bank_transactions t JOIN bank_accounts a ON a.id=t.bank_account_id WHERE t.id=? AND t.board_id=? AND t.status='approved' AND t.posted_voucher_id IS NULL").bind(transactionId, boardId).first<Record<string, unknown>>();
      if (!transaction) return json({ error: 'bank_match_not_approved_or_found' }, { status: 409 });
      const bankAccountId = text(transaction.ledger_account_id || v?.bankLedgerAccountId, 120); const counterAccountId = text(v?.counterAccountId, 120); const entityType = text(transaction.match_entity_type, 40); const entityId = text(transaction.match_entity_id, 120); const amountMinor = Math.abs(Number(transaction.amount_minor || 0));
      if (!bankAccountId || !counterAccountId || bankAccountId === counterAccountId) return json({ error: 'bank_and_counter_accounts_required' }, { status: 400 });
      const accountRows = (await db.prepare('SELECT id FROM ledger_accounts WHERE board_id=? AND active=1 AND id IN (?,?)').bind(boardId, bankAccountId, counterAccountId).all()).results; if (accountRows.length !== 2) return json({ error: 'ledger_account_not_found' }, { status: 400 });
      const source = entityType === 'sales_invoice' ? await db.prepare("SELECT invoice_number,total_minor,status FROM sales_invoices WHERE id=? AND board_id=?").bind(entityId, boardId).first<Record<string, unknown>>() : entityType === 'supplier_invoice' ? await db.prepare("SELECT invoice_number,amount_minor,status FROM supplier_invoices WHERE id=? AND board_id=?").bind(entityId, boardId).first<Record<string, unknown>>() : entityType === 'card_transaction' ? await db.prepare("SELECT merchant,amount_minor,status FROM card_transactions WHERE id=? AND board_id=?").bind(entityId, boardId).first<Record<string, unknown>>() : null;
      if (!source || !['sales_invoice','supplier_invoice','card_transaction'].includes(entityType)) return json({ error: 'matched_source_not_found' }, { status: 404 });
      const sourceAmount = Math.abs(Number(source.total_minor ?? source.amount_minor ?? 0)); if (!sourceAmount || sourceAmount !== amountMinor) return json({ error: 'bank_source_amount_mismatch', bankAmountMinor: amountMinor, sourceAmountMinor: sourceAmount }, { status: 409 });
      const date = text(transaction.transaction_date, 20); const period = date.slice(0, 7); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return json({ error: 'bank_transaction_period_invalid' }, { status: 400 }); if (await db.prepare("SELECT 1 FROM accounting_periods WHERE board_id=? AND period=? AND status='locked'").bind(boardId, period).first()) return json({ error: 'period_locked', period }, { status: 409 });
      const voucherId = id('voucher'); const debitBank = Number(transaction.amount_minor || 0) > 0; const lines = debitBank ? [{ accountId: bankAccountId, description: text(transaction.description, 200), debit: amountMinor, credit: 0 }, { accountId: counterAccountId, description: `Avstemming ${text(transaction.external_reference, 120)}`, debit: 0, credit: amountMinor }] : [{ accountId: counterAccountId, description: `Avstemming ${text(transaction.external_reference, 120)}`, debit: amountMinor, credit: 0 }, { accountId: bankAccountId, description: text(transaction.description, 200), debit: 0, credit: amountMinor }];
      const statements = [db.prepare('INSERT INTO voucher_sequences (board_id,next_number) SELECT ?,COALESCE(MAX(voucher_number),0)+1 FROM vouchers WHERE board_id=? ON CONFLICT(board_id) DO NOTHING').bind(boardId, boardId),db.prepare("UPDATE voucher_sequences SET next_number=next_number+1,updated_at=datetime('now') WHERE board_id=?").bind(boardId),db.prepare('INSERT INTO vouchers (id,board_id,voucher_number,voucher_date,period,description,source,status,external_reference,created_by) SELECT ?,?,next_number-1,?,?,?,?,?,?,? FROM voucher_sequences WHERE board_id=?').bind(voucherId,boardId,date,period,`Bankavstemming ${text(transaction.external_reference,120)}`,'bank_reconciliation','posted',`bank:${transactionId}`,actor,boardId)]; lines.forEach(line=>statements.push(db.prepare('INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,?)').bind(id('line'),voucherId,line.accountId,line.description,line.debit,line.credit,null))); await db.batch(statements); const created=await db.prepare('SELECT voucher_number FROM vouchers WHERE id=? AND board_id=?').bind(voucherId,boardId).first<{voucher_number:number}>(); if(!created)return json({error:'voucher_created_without_number'},{status:503}); await db.prepare("UPDATE bank_transactions SET posted_voucher_id=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND board_id=? AND status='approved' AND posted_voucher_id IS NULL").bind(voucherId,actor,transactionId,boardId).run(); if(entityType==='sales_invoice')await db.prepare("UPDATE sales_invoices SET status='paid',paid_at=datetime('now'),payment_reference=? WHERE id=? AND board_id=? AND status NOT IN ('paid','cancelled')").bind(`BANK:${text(transaction.external_reference,120)}`,entityId,boardId).run(); if(entityType==='supplier_invoice')await db.prepare("UPDATE supplier_invoices SET status='paid',approved_by=COALESCE(approved_by,?),approved_at=COALESCE(approved_at,datetime('now')) WHERE id=? AND board_id=? AND status!='paid'").bind(actor,entityId,boardId).run(); if(entityType==='card_transaction')await db.prepare("UPDATE card_transactions SET status='reconciled',reviewed_by=COALESCE(reviewed_by,?),reviewed_at=COALESCE(reviewed_at,datetime('now')) WHERE id=? AND board_id=?").bind(actor,entityId,boardId).run(); await recordAudit(db,{boardId,action:'bank_match_posted',entityType:'bank_transaction',entityId:transactionId,userId:authorization.userId||undefined,details:{voucherId,voucherNumber:created.voucher_number,matchEntityType:entityType,matchEntityId:entityId,bankAccountId,counterAccountId}}); return json({ok:true,action,transactionId,status:'posted',voucherId,voucherNumber:Number(created.voucher_number),period,sourceType:entityType},{status:201});
    }
    return json({ error: 'unknown_action', allowed: ['create_account', 'import_transaction', 'suggest_match', 'approve_match', 'post_match', 'reject_match'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
