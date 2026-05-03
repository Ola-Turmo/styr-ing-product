// Styr.ing Auth Middleware
// Simple session-based auth for MVP. Replace with Clerk/Ory for production.

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export async function getSession(request: Request, env: any): Promise<Session | null> {
  const cookie = request.headers.get('Cookie') || '';
  const sessionId = cookie.match(/styr_session=([^;]+)/)?.[1];
  if (!sessionId) return null;
  
  try {
    const result = await env.DB.prepare(
      "SELECT u.id as userId, u.email, u.name, u.role FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > datetime('now')"
    ).bind(sessionId).first();
    
    if (!result) return null;
    return result as Session;
  } catch {
    return null;
  }
}

export async function createSession(env: any, userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))"
  ).bind(sessionId, userId).run();
  return sessionId;
}

export async function destroySession(env: any, sessionId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}
