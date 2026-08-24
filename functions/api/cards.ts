import { authorizeBoardRead, authorizeWrite, body, json, requireDb, type Env } from './_lib';
const views = new Set(['summary', 'cards', 'transactions']);
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const u = new URL(request.url); const boardId = (u.searchParams.get('boardId') || '').trim(); const view = u.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try { const db = requireDb(env); const q: Record<string, string> = {
    cards: `SELECT c.*,p.name holder_name FROM corporate_cards c LEFT JOIN people p ON p.id=c.holder_id WHERE c.board_id=? ORDER BY c.card_name`,
    transactions: `SELECT t.*,c.card_name,p.name holder_name FROM card_transactions t LEFT JOIN corporate_cards c ON c.id=t.card_id LEFT JOIN people p ON p.id=c.holder_id WHERE t.board_id=? ORDER BY t.transaction_date DESC`,
  }; if (view !== 'summary') return json({ boardId, view, data: (await db.prepare(q[view]).bind(boardId).all()).results });
    const [cards, transactions, missingReceipts, review] = await Promise.all([
      db.prepare("SELECT COUNT(*) count FROM corporate_cards WHERE board_id=? AND status IN ('active','proposed')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count,COALESCE(SUM(amount_minor),0) amount_minor FROM card_transactions WHERE board_id=? AND status NOT IN ('reconciled','rejected')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count,COALESCE(SUM(amount_minor),0) amount_minor FROM card_transactions WHERE board_id=? AND status='needs_receipt'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM card_transactions WHERE board_id=? AND status='ready_for_review'").bind(boardId).first(),
    ]); return json({ boardId, view, data: { cards, transactions, missingReceipts, review } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
  try { const v = await body(request); const boardId = String(v?.boardId || ''); const action = String(v?.action || ''); const db = requireDb(env); if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    if (action === 'attach_receipt') { const transactionId = String(v?.transactionId || ''); const ref = String(v?.receiptRef || '').trim(); if (!ref) return json({ error: 'receipt_ref_required' }, { status: 400 }); const result = await db.prepare("UPDATE card_transactions SET receipt_ref=?,status='ready_for_review' WHERE id=? AND board_id=? AND status='needs_receipt'").bind(ref, transactionId, boardId).run(); if (!result.meta?.changes) return json({ error: 'transaction_not_missing_receipt_or_found' }, { status: 409 }); return json({ ok: true, action, transactionId, status: 'ready_for_review' }); }
    if (action === 'approve_transaction') { const transactionId = String(v?.transactionId || ''); const result = await db.prepare("UPDATE card_transactions SET status='approved',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND board_id=? AND status='ready_for_review'").bind(v?.reviewedBy || 'api', transactionId, boardId).run(); if (!result.meta?.changes) return json({ error: 'transaction_not_ready_or_found' }, { status: 409 }); return json({ ok: true, action, transactionId, status: 'approved', ledgerPosting: 'not_configured' }); }
    return json({ error: 'unknown_action', allowed: ['attach_receipt', 'approve_transaction'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
