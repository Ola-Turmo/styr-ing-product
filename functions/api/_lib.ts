export interface Env { DB?: D1Database; }

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

export function id(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
