import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'contracts', 'redlines', 'mandates', 'equity', 'grants']);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url); const boardId = (url.searchParams.get('boardId') || '').trim(); const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'contracts') return json({ boardId, view, data: (await db.prepare(`SELECT c.id,c.title,c.counterparty,c.contract_type,c.status,c.start_date,c.end_date,c.renewal_notice_date,p.name owner_name,r.id review_id,r.status review_status,r.findings,r.due_date FROM contracts c LEFT JOIN people p ON p.id=c.owner_id LEFT JOIN contract_reviews r ON r.contract_id=c.id AND r.board_id=c.board_id WHERE c.board_id=? ORDER BY COALESCE(r.due_date,c.renewal_notice_date)`).bind(boardId).all()).results });
    if (view === 'redlines') return json({ boardId, view, data: (await db.prepare(`SELECT r.*,c.title contract_title,c.counterparty FROM contract_redlines r JOIN contracts c ON c.id=r.contract_id WHERE r.board_id=? ORDER BY CASE r.risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,r.created_at DESC`).bind(boardId).all()).results });
    if (view === 'mandates') return json({ boardId, view, data: (await db.prepare(`SELECT m.*,p.name holder_name FROM mandates m LEFT JOIN people p ON p.id=m.holder_id WHERE m.board_id=? ORDER BY CASE m.status WHEN 'draft' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,m.valid_until`).bind(boardId).all()).results });
    if (view === 'equity') return json({ boardId, view, data: (await db.prepare('SELECT * FROM equity_holders WHERE board_id=? ORDER BY ownership_percent DESC').bind(boardId).all()).results });
    if (view === 'grants') return json({ boardId, view, data: (await db.prepare(`SELECT g.*,p.name holder_name FROM equity_grants g LEFT JOIN people p ON p.id=g.holder_id WHERE g.board_id=? ORDER BY g.grant_date DESC`).bind(boardId).all()).results });
    const [contracts, mandates, equity, redlines, grants] = await Promise.all([
      db.prepare("SELECT COUNT(*) count,SUM(CASE WHEN status='review' THEN 1 ELSE 0 END) review_count FROM contracts WHERE board_id=?").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count,SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) draft_count FROM mandates WHERE board_id=?").bind(boardId).first(),
      db.prepare('SELECT COALESCE(SUM(shares),0) shares,COUNT(*) holders FROM equity_holders WHERE board_id=?').bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count,SUM(CASE WHEN status IN ('draft','review') THEN 1 ELSE 0 END) open_count FROM contract_redlines WHERE board_id=?").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count,SUM(CASE WHEN tax_review_status!='cleared' THEN 1 ELSE 0 END) review_count FROM equity_grants WHERE board_id=?").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { contracts, mandates, equity, redlines, grants } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request); const boardId = String(value?.boardId || '').trim(); const action = String(value?.action || '').trim();
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId);
    if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 });
    const db = requireDb(env);
    if (action === 'review_contract') {
      const reviewId = String(value?.reviewId || '').trim(); if (!reviewId) return json({ error: 'reviewId_required' }, { status: 400 });
      const result = await db.prepare("UPDATE contract_reviews SET status='approved',decision=?,reviewed_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('open','in_review')").bind(String(value?.decision || 'approved'), reviewId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'review_not_open_or_found' }, { status: 409 });
      await recordAudit(db, { boardId, action: 'contract_review_approved', entityType: 'contract_review', entityId: reviewId, userId: authorization.userId || undefined, details: { decision: String(value?.decision || 'approved') } });
      return json({ ok: true, action, reviewId, status: 'approved', requiresHumanApproval: false });
    }
    if (action === 'activate_mandate') {
      const mandateId = String(value?.mandateId || '').trim(); if (!mandateId) return json({ error: 'mandateId_required' }, { status: 400 });
      const result = await db.prepare("UPDATE mandates SET status='active' WHERE id=? AND board_id=? AND status='draft'").bind(mandateId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'mandate_not_draft_or_found' }, { status: 409 });
      await recordAudit(db, { boardId, action: 'mandate_activated', entityType: 'mandate', entityId: mandateId, userId: authorization.userId || undefined, details: { requiresEvidence: true } });
      return json({ ok: true, action, mandateId, status: 'active', requiresEvidence: true });
    }
    if (action === 'create_contract_review') {
      const contractId = String(value?.contractId || '').trim(); if (!contractId) return json({ error: 'contractId_required' }, { status: 400 });
      const reviewId = id('review'); await db.prepare("INSERT INTO contract_reviews (id,board_id,contract_id,review_type,status,owner_id,findings,due_date) VALUES (?,?,?,?,?,?,?,?)").bind(reviewId, boardId, contractId, String(value?.reviewType || 'risk'), 'open', value?.ownerId || null, '[]', value?.dueDate || null).run();
      await recordAudit(db, { boardId, action: 'contract_review_created', entityType: 'contract_review', entityId: reviewId, userId: authorization.userId || undefined, details: { contractId } });
      return json({ ok: true, action, id: reviewId, status: 'open' }, { status: 201 });
    }
    if (action === 'accept_redline') {
      const redlineId = String(value?.redlineId || '').trim(); if (!redlineId) return json({ error: 'redlineId_required' }, { status: 400 });
      const result = await db.prepare("UPDATE contract_redlines SET status='accepted',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('draft','review')").bind(value?.reviewedBy || 'api', redlineId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'redline_not_open_or_found' }, { status: 409 });
      await recordAudit(db, { boardId, action: 'contract_redline_accepted', entityType: 'contract_redline', entityId: redlineId, userId: authorization.userId || undefined, details: { requiresHumanApproval: false } });
      return json({ ok: true, action, redlineId, status: 'accepted', requiresHumanApproval: false });
    }
    if (action === 'approve_grant') {
      const grantId = String(value?.grantId || '').trim(); if (!grantId) return json({ error: 'grantId_required' }, { status: 400 });
      const result = await db.prepare("UPDATE equity_grants SET status='approved',tax_review_status='review',updated_at=datetime('now') WHERE id=? AND board_id=? AND status='draft'").bind(grantId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'grant_not_draft_or_found' }, { status: 409 });
      await recordAudit(db, { boardId, action: 'equity_grant_approved', entityType: 'equity_grant', entityId: grantId, userId: authorization.userId || undefined, details: { taxReview: 'required', externalFiling: 'not_configured' } });
      return json({ ok: true, action, grantId, status: 'approved', taxReview: 'required', externalFiling: 'not_configured' });
    }
    return json({ error: 'unknown_action', allowed: ['review_contract', 'activate_mandate', 'create_contract_review', 'accept_redline', 'approve_grant'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
