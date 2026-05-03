import type { APIRoute } from 'astro';
import { getSession } from '../../../session';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime as any)?.env;
  const session = await getSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  
  const { board_id, plan } = await request.json();
  if (!board_id) return new Response(JSON.stringify({ error: 'board_id required' }), { status: 400 });
  
  const STRIPE_KEY = env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 503 });
  
  const PRICE_ID = plan === 'enterprise' ? env.STRIPE_ENTERPRISE_PRICE_ID : env.STRIPE_PRICE_ID;
  
  try {
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'price': PRICE_ID,
        'mode': 'subscription',
        'success_url': `${new URL(request.url).origin}/board/${board_id}?checkout=success`,
        'cancel_url': `${new URL(request.url).origin}/board/${board_id}?checkout=cancelled`,
        'metadata[board_id]': board_id,
        'metadata[user_id]': session.userId,
      }).toString()
    });
    const data = await resp.json() as any;
    if (data.url) return new Response(JSON.stringify({ url: data.url }), { status: 200 });
    return new Response(JSON.stringify({ error: data.error?.message || 'Stripe error' }), { status: 400 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
