import { authorizeBoardRead, authorizeWrite, body, json, requireDb, type Env } from './_lib';
const views = new Set(['summary','orders','receipts','invoices']);
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const u = new URL(request.url); const boardId = (u.searchParams.get('boardId') || '').trim(); const view = u.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 }); if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try { const db = requireDb(env); const q: Record<string,string> = {
    orders: `SELECT * FROM purchase_orders WHERE board_id=? ORDER BY created_at DESC`,
    receipts: `SELECT r.*,o.order_number,o.supplier_name FROM goods_receipts r JOIN purchase_orders o ON o.id=r.purchase_order_id WHERE r.board_id=? ORDER BY r.received_date DESC`,
    invoices: `SELECT i.*,o.order_number FROM supplier_invoices i LEFT JOIN purchase_orders o ON o.id=i.purchase_order_id WHERE i.board_id=? ORDER BY i.due_date`,
  }; if (view !== 'summary') return json({ boardId, view, data: (await db.prepare(q[view]).bind(boardId).all()).results });
    const [orders, receipts, invoices, exceptions] = await Promise.all([
      db.prepare("SELECT COUNT(*) count,COALESCE(SUM(total_minor),0) total_minor FROM purchase_orders WHERE board_id=? AND status NOT IN ('closed','cancelled')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM goods_receipts WHERE board_id=? AND status='confirmed'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count,COALESCE(SUM(amount_minor),0) amount_minor FROM supplier_invoices WHERE board_id=? AND status NOT IN ('paid','booked')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM supplier_invoices WHERE board_id=? AND match_status='exception'").bind(boardId).first(),
    ]); return json({ boardId, view, data: { orders, receipts, invoices, exceptions } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
  try { const v = await body(request); const boardId = String(v?.boardId || ''); const action = String(v?.action || ''); const db = requireDb(env); if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    if (action === 'approve_order') { const orderId = String(v?.orderId || ''); const result = await db.prepare("UPDATE purchase_orders SET status='approved',approved_by=?,approved_at=datetime('now') WHERE id=? AND board_id=? AND status='pending_approval'").bind(v?.approvedBy || 'api', orderId, boardId).run(); if (!result.meta?.changes) return json({ error: 'order_not_pending_or_found' }, { status: 409 }); return json({ ok: true, action, orderId, status: 'approved', externalOrdering: 'not_configured' }); }
    if (action === 'match_invoice') { const invoiceId = String(v?.invoiceId || ''); const result = await db.prepare("UPDATE supplier_invoices SET match_status='matched',status='matched' WHERE id=? AND board_id=? AND status='received'").bind(invoiceId, boardId).run(); if (!result.meta?.changes) return json({ error: 'invoice_not_received_or_found' }, { status: 409 }); return json({ ok: true, action, invoiceId, status: 'matched', requiresHumanApproval: true }); }
    return json({ error: 'unknown_action', allowed: ['approve_order','match_invoice'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
