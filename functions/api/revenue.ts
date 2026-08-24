import { authorizeBoardRead, authorizeWrite, body, json, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'contracts', 'obligations', 'schedule']);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });

  try {
    const db = requireDb(env);
    const queries: Record<string, string> = {
      contracts: `SELECT c.*, a.company_name, q.quote_number FROM revenue_contracts c JOIN crm_accounts a ON a.id = c.account_id LEFT JOIN quotes q ON q.id = c.quote_id WHERE c.board_id = ? ORDER BY c.start_date DESC`,
      obligations: `SELECT o.*, c.contract_number, c.title FROM performance_obligations o JOIN revenue_contracts c ON c.id = o.contract_id WHERE o.board_id = ? ORDER BY c.contract_number, o.created_at`,
      schedule: `SELECT s.*, c.contract_number, c.title, o.description obligation_description FROM revenue_schedule_entries s JOIN revenue_contracts c ON c.id = s.contract_id LEFT JOIN performance_obligations o ON o.id = s.obligation_id WHERE s.board_id = ? ORDER BY s.period, c.contract_number`,
    };
    if (view !== 'summary') return json({ boardId, view, data: (await db.prepare(queries[view]).bind(boardId).all()).results });
    const [contracts, total, planned, review] = await Promise.all([
      db.prepare("SELECT COUNT(*) count FROM revenue_contracts WHERE board_id = ? AND status NOT IN ('complete','cancelled')").bind(boardId).first(),
      db.prepare("SELECT COALESCE(SUM(transaction_price_minor), 0) amount_minor FROM revenue_contracts WHERE board_id = ? AND status <> 'cancelled'").bind(boardId).first(),
      db.prepare("SELECT COALESCE(SUM(planned_minor), 0) amount_minor FROM revenue_schedule_entries WHERE board_id = ? AND status <> 'posted'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM revenue_schedule_entries WHERE board_id = ? AND status IN ('planned','review')").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { contracts, total, planned, review } });
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
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    const db = requireDb(env);
    if (action === 'approve_schedule_entry') {
      const entryId = String(value?.entryId || '').trim();
      if (!entryId) return json({ error: 'entryId_required' }, { status: 400 });
      const result = await db.prepare("UPDATE revenue_schedule_entries SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ? AND board_id = ? AND status IN ('planned','review')").bind(String(value?.approvedBy || 'api'), entryId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'entry_not_pending_or_found' }, { status: 409 });
      return json({ ok: true, action, entryId, status: 'approved', ledgerPosting: 'not_configured', requiresHumanReview: true });
    }
    if (action === 'prepare_schedule') {
      const contractId = String(value?.contractId || '').trim();
      if (!contractId) return json({ error: 'contractId_required' }, { status: 400 });
      const contract = await db.prepare('SELECT transaction_price_minor FROM revenue_contracts WHERE id = ? AND board_id = ?').bind(contractId, boardId).first<{ transaction_price_minor: number }>();
      if (!contract) return json({ error: 'contract_not_found' }, { status: 404 });
      const allocation = await db.prepare('SELECT COALESCE(SUM(allocated_minor), 0) allocated_minor FROM performance_obligations WHERE contract_id = ? AND board_id = ?').bind(contractId, boardId).first<{ allocated_minor: number }>();
      if (Number(allocation?.allocated_minor || 0) !== Number(contract.transaction_price_minor || 0)) return json({ error: 'allocations_do_not_equal_transaction_price', transactionPriceMinor: contract.transaction_price_minor, allocatedMinor: allocation?.allocated_minor || 0 }, { status: 422 });
      const result = await db.prepare("UPDATE revenue_schedule_entries SET status = 'review' WHERE contract_id = ? AND board_id = ? AND status = 'planned'").bind(contractId, boardId).run();
      return json({ ok: true, action, contractId, rowsMovedToReview: result.meta?.changes || 0, requiresHumanReview: true, ledgerPosting: 'not_configured' });
    }
    return json({ error: 'unknown_action', allowed: ['approve_schedule_entry', 'prepare_schedule'] }, { status: 400 });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
