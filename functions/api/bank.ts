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
      const name = text(v?.name, 160); if (!name) return json({ error: 'account_name_required' }, { status: 400 });
      const accountId = id('bankacct'); await db.prepare('INSERT INTO bank_accounts (id,board_id,name,account_last_four,currency,provider,status) VALUES (?,?,?,?,?,?,?)').bind(accountId, boardId, name, text(v?.accountLastFour, 4) || null, text(v?.currency, 3) || 'NOK', text(v?.provider, 120) || null, 'manual').run();
      await recordAudit(db, { boardId, action: 'bank_account_created', entityType: 'bank_account', entityId: accountId, userId: authorization.userId || undefined, details: { provider: 'not_configured', connection: 'manual' } }); return json({ ok: true, action, accountId, status: 'manual', provider: 'not_configured' }, { status: 201 });
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
      await db.prepare("UPDATE bank_transactions SET status='approved',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND board_id=? AND status='suggested'").bind(actor, transactionId, boardId).run(); await recordAudit(db, { boardId, action: 'bank_match_approved', entityType: 'bank_transaction', entityId: transactionId, userId: authorization.userId || undefined, details: { matchEntityType: transaction.match_entity_type, matchEntityId: transaction.match_entity_id, ledgerPosting: 'not_configured' } }); return json({ ok: true, action, transactionId, status: 'approved', ledgerPosting: 'not_configured' });
    }
    if (action === 'reject_match') {
      const transactionId = text(v?.transactionId, 120); const result = await db.prepare("UPDATE bank_transactions SET status='rejected',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('imported','suggested')").bind(actor, transactionId, boardId).run(); if (!result.meta?.changes) return json({ error: 'transaction_not_open_or_found' }, { status: 409 }); await recordAudit(db, { boardId, action: 'bank_match_rejected', entityType: 'bank_transaction', entityId: transactionId, userId: authorization.userId || undefined, details: { reason: text(v?.reason, 240) || 'human_rejection' } }); return json({ ok: true, action, transactionId, status: 'rejected' });
    }
    return json({ error: 'unknown_action', allowed: ['create_account', 'import_transaction', 'suggest_match', 'approve_match', 'reject_match'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
