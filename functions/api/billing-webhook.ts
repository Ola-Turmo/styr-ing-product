import { json, requireDb, type Env } from './_lib';

function hex(bytes: ArrayBuffer) { return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

async function verify(payload: string, header: string, secret: string) {
  const timestamp = header.split(',').find((part) => part.startsWith('t='))?.slice(2);
  const signatures = header.split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  return signatures.some((signature) => signature.length === expected.length && signature.split('').every((character, index) => character === expected[index]));
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'stripe_webhook_not_configured' }, { status: 503 });
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') || '';
  if (!(await verify(payload, signature, env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'invalid_signature' }, { status: 400 });
  try {
    const event = JSON.parse(payload) as { id: string; type: string; created?: number; data?: { object?: Record<string, any> } };
    const object = event.data?.object || {};
    const supported = new Set(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed']);
    if (!supported.has(event.type)) return json({ received: true, ignored: true, type: event.type });
    const boardId = String(object.metadata?.board_id || '').trim();
    if (!boardId) return json({ received: true, ignored: true, reason: 'board_id_metadata_missing' });
    const db = requireDb(env);
    const duplicate = await db.prepare('SELECT 1 seen FROM billing_accounts WHERE board_id=? AND last_event_id=?').bind(boardId, event.id).first();
    if (duplicate) return json({ received: true, duplicate: true });
    const map: Record<string, string> = { trialing: 'trialing', active: 'active', past_due: 'past_due', canceled: 'canceled', incomplete: 'incomplete', incomplete_expired: 'incomplete', paused: 'paused', unpaid: 'past_due' };
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : map[String(object.status || '')] || 'incomplete';
    const periodEnd = object.current_period_end || object.items?.data?.[0]?.current_period_end;
    await db.prepare("INSERT INTO billing_accounts (board_id,provider,customer_id,subscription_id,status,plan,current_period_end,cancel_at_period_end,last_event_id,last_event_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(board_id) DO UPDATE SET customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,status=excluded.status,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,last_event_id=excluded.last_event_id,last_event_at=excluded.last_event_at,updated_at=datetime('now')").bind(boardId, 'stripe', String(object.customer || ''), String(object.id || ''), status, String(object.metadata?.plan || 'paid'), periodEnd ? new Date(Number(periodEnd) * 1000).toISOString() : null, object.cancel_at_period_end ? 1 : 0, event.id, event.created ? new Date(event.created * 1000).toISOString() : new Date().toISOString()).run();
    await db.prepare('UPDATE boards SET stripe_customer_id=?,stripe_subscription_id=?,plan=?,updated_at=datetime(\'now\') WHERE id=?').bind(String(object.customer || ''), String(object.id || ''), status === 'active' || status === 'trialing' ? String(object.metadata?.plan || 'paid') : 'pilot', boardId).run();
    return json({ received: true, boardId, status });
  } catch (error) { return json({ error: 'webhook_processing_failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 500 }); }
};
