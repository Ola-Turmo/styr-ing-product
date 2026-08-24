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

// The public preview is intentionally limited to its fictional board. Any
// customer board must come through an authenticated service boundary (the
// write key is the current adapter credential until end-user SSO is enabled).
export function authorizeBoardRead(request: Request, env: Env, boardId: string) {
  return boardId === 'board-1' || authorizeWrite(request, env);
}

export function id(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }

export async function recordAudit(db: D1Database, input: {
  boardId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  userId?: string;
  ipAddress?: string;
}) {
  await db.prepare('INSERT INTO audit_log (id,user_id,board_id,action,entity_type,entity_id,details,ip_address) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id('audit'), input.userId || null, input.boardId, input.action, input.entityType || null, input.entityId || null, input.details ? JSON.stringify(input.details) : null, input.ipAddress || null)
    .run();
}
