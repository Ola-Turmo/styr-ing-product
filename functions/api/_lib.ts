export interface Env { DB?: D1Database; API_WRITE_KEY?: string; }

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) } });
}

export async function body(request: Request) {
  try { return await request.json() as Record<string, unknown>; } catch { return null; }
}

export function method(request: Request, allowed: string[]) {
  return allowed.includes(request.method);
}

export function requireDb(env: Env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  return env.DB;
}

export function authorizeWrite(request: Request, env: Env) {
  const configured = env.API_WRITE_KEY;
  if (!configured) return false;
  const supplied = request.headers.get('x-styr-api-key');
  return Boolean(supplied && supplied === configured);
}

export function id(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
