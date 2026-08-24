import { authorizeBoardWrite, body, json, requireDb, type Env } from './_lib';

const requiredDocuments = ['privacy', 'terms', 'subscription', 'refund', 'sla', 'dpa'];

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const value = await body(request);
  const boardId = String(value?.boardId || '').trim();
  const plan = String(value?.plan || 'paid').trim();
  if (!boardId || !['paid', 'enterprise'].includes(plan)) return json({ error: 'boardId_and_valid_plan_required' }, { status: 400 });
  const authorization = await authorizeBoardWrite(request, env, boardId);
  if (!authorization.allowed || !authorization.userId) return json({ error: 'authenticated_owner_required' }, { status: 401 });
  if (authorization.role !== 'owner') return json({ error: 'owner_role_required' }, { status: 403 });
  const key = env.STRIPE_RESTRICTED_KEY;
  const price = plan === 'enterprise' ? env.STRIPE_PRICE_ENTERPRISE : env.STRIPE_PRICE_PAID;
  if (!key || !price) return json({ error: 'stripe_not_configured', requires: ['STRIPE_RESTRICTED_KEY', plan === 'enterprise' ? 'STRIPE_PRICE_ENTERPRISE' : 'STRIPE_PRICE_PAID'] }, { status: 503 });
  try {
    const db = requireDb(env);
    const rows = (await db.prepare("SELECT d.document_type,d.version,a.id accepted FROM legal_documents d LEFT JOIN legal_acceptances a ON a.board_id=? AND a.user_id=? AND a.document_type=d.document_type AND a.document_version=d.version WHERE d.status='published' AND d.document_type IN ('privacy','terms','subscription','refund','sla','dpa')").bind(boardId, authorization.userId).all<{ document_type: string; version: string; accepted: string | null }>()).results;
    const latest = new Map<string, { version: string; accepted: boolean }>();
    for (const row of rows) if (!latest.has(row.document_type)) latest.set(row.document_type, { version: row.version, accepted: Boolean(row.accepted) });
    const missing = requiredDocuments.filter((type) => !latest.get(type)?.accepted);
    if (missing.length) return json({ error: 'legal_acceptance_required', missing }, { status: 409 });
    const board = await db.prepare('SELECT id,name,stripe_customer_id FROM boards WHERE id=?').bind(boardId).first<{ id: string; name: string; stripe_customer_id: string | null }>();
    if (!board) return json({ error: 'board_not_found' }, { status: 404 });
    const form = new URLSearchParams();
    form.set('mode', 'subscription');
    form.set('line_items[0][price]', price);
    form.set('line_items[0][quantity]', '1');
    form.set('success_url', `${new URL(request.url).origin}/legal?checkout=success`);
    form.set('cancel_url', `${new URL(request.url).origin}/legal?checkout=cancelled`);
    form.set('metadata[board_id]', boardId);
    form.set('subscription_data[metadata][board_id]', boardId);
    form.set('integration_identifier', `styring_checkout_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`);
    if (board.stripe_customer_id) form.set('customer', board.stripe_customer_id);
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2026-07-29.dahlia' }, body: form });
    const result = await response.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !result.url) return json({ error: 'stripe_checkout_failed', detail: result.error?.message || 'unknown' }, { status: 502 });
    return json({ ok: true, checkoutSessionId: result.id, url: result.url });
  } catch (error) { return json({ error: 'checkout_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
