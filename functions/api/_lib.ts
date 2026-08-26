import type { R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  DB?: D1Database;
  DOCS?: R2Bucket;
  API_WRITE_KEY?: string;
  STRIPE_RESTRICTED_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PAID?: string;
  STRIPE_PRICE_ENTERPRISE?: string;
}

export interface SessionUser { userId: string; email: string; name: string; role: string; }

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
export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export async function sha256Bytes(value: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', value as BufferSource);
  return bytesToBase64(new Uint8Array(digest));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$120000$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [scheme, iterationsText, saltText, expectedText] = encoded.split('$');
  if (scheme !== 'pbkdf2' || !iterationsText || !saltText || !expectedText) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 500000) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: base64ToBytes(saltText), iterations, hash: 'SHA-256' }, key, 256);
  const actual = bytesToBase64(new Uint8Array(bits));
  return actual === expectedText;
}

export function sessionToken(request: Request) {
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)styr_session=([^;]+)/)?.[1] || null;
}

export async function getSession(request: Request, env: Env): Promise<SessionUser | null> {
  const token = sessionToken(request);
  if (!token || !env.DB) return null;
  try {
    const tokenHash = await sha256(token);
    const row = await env.DB.prepare("SELECT u.id AS userId,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>datetime('now')").bind(tokenHash).first<SessionUser>();
    if (!row) return null;
    await env.DB.prepare("UPDATE sessions SET last_seen_at=datetime('now') WHERE id=?").bind(tokenHash).run();
    return row;
  } catch { return null; }
}

export async function createSession(env: Env, userId: string, request: Request) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64(tokenBytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const tokenHash = await sha256(token);
  await requireDb(env).prepare("INSERT INTO sessions (id,user_id,expires_at,user_agent,ip_address) VALUES (?,?,datetime('now','+7 days'),?,?)").bind(tokenHash, userId, request.headers.get('user-agent')?.slice(0, 300) || null, request.headers.get('cf-connecting-ip') || null).run();
  return token;
}

export async function destroySession(request: Request, env: Env) {
  const token = sessionToken(request);
  if (!token || !env.DB) return;
  await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(await sha256(token)).run();
}

export function sessionCookie(token: string, maxAge = 604800) {
  return `styr_session=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function authorizeWriteOrSession(request: Request, env: Env, session: SessionUser | null) {
  return authorizeWrite(request, env) || Boolean(session);
}

export async function authorizeBoardRead(request: Request, env: Env, boardId: string) {
  if (boardId === 'board-1' || authorizeWrite(request, env)) return true;
  const session = await getSession(request, env);
  if (!session || !env.DB) return false;
  const membership = await env.DB.prepare('SELECT 1 AS allowed FROM user_boards WHERE user_id=? AND board_id=?').bind(session.userId, boardId).first();
  return Boolean(membership);
}

export async function authorizeBoardWrite(request: Request, env: Env, boardId: string) {
  if (authorizeWrite(request, env)) return { allowed: true, userId: null as string | null, role: 'service' };
  const session = await getSession(request, env);
  if (!session || !env.DB) return { allowed: false, userId: null as string | null, role: null as string | null };
  const membership = await env.DB.prepare("SELECT role FROM user_boards WHERE user_id=? AND board_id=? AND role IN ('owner','editor')").bind(session.userId, boardId).first<{ role: string }>();
  return { allowed: Boolean(membership), userId: session.userId, role: membership?.role || null };
}

export async function authorizeBoardMember(request: Request, env: Env, boardId: string) {
  if (authorizeWrite(request, env)) return { allowed: true, userId: null as string | null, role: 'service' };
  const session = await getSession(request, env);
  if (!session || !env.DB) return { allowed: false, userId: null as string | null, role: null as string | null };
  const membership = await env.DB.prepare('SELECT role FROM user_boards WHERE user_id=? AND board_id=?').bind(session.userId, boardId).first<{ role: string }>();
  return { allowed: Boolean(membership), userId: session.userId, role: membership?.role || null };
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
  const auditId = id('audit');
  const details = input.details ? JSON.stringify(input.details) : null;
  const previous = await db.prepare('SELECT event_hash FROM audit_log WHERE board_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(input.boardId).first<{ event_hash: string | null }>();
  const prevHash = previous?.event_hash || null;
  const eventPayload = JSON.stringify({ auditId, userId: input.userId || null, boardId: input.boardId, action: input.action, entityType: input.entityType || null, entityId: input.entityId || null, details, ipAddress: input.ipAddress || null, prevHash });
  const eventHash = await sha256(eventPayload);
  await db.prepare('INSERT INTO audit_log (id,user_id,board_id,action,entity_type,entity_id,details,ip_address,prev_hash,event_hash) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(auditId, input.userId || null, input.boardId, input.action, input.entityType || null, input.entityId || null, details, input.ipAddress || null, prevHash, eventHash)
    .run();
  return { id: auditId, prevHash, eventHash };
}
