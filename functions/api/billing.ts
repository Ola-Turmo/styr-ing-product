import { authorizeBoardRead, authorizeWrite, json, requireDb, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const boardId = (new URL(request.url).searchParams.get('boardId') || '').trim();
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const billing = await requireDb(env).prepare('SELECT provider,customer_id,subscription_id,status,plan,current_period_end,cancel_at_period_end,last_event_at FROM billing_accounts WHERE board_id=?').bind(boardId).first();
    return json({ boardId, configured: Boolean(billing && billing.status !== 'not_configured'), billing: billing || { provider: 'stripe', status: 'not_configured', plan: 'pilot' }, activation: 'requires_stripe_account_products_prices_tax_and_legal_terms' });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
  return json({ error: 'billing_webhook_not_configured', detail: 'Configure Stripe webhook verification and products before changing billing state.' }, { status: 501 });
};
