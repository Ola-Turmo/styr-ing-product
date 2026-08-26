import { authorizeBoardRead, json, requireDb, sha256, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200);
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    const rows = await db.prepare('SELECT id,user_id,action,entity_type,entity_id,details,ip_address,prev_hash,event_hash,created_at FROM audit_log WHERE board_id=? ORDER BY created_at DESC,id DESC LIMIT ?').bind(boardId, limit).all();
    const ordered = [...rows.results].reverse() as Record<string, unknown>[];
    let previousHash: string | null = null; let checked = 0; let valid = true; let legacy = 0; let first = true;
    for (const row of ordered) {
      if (!row.event_hash) { legacy += 1; previousHash = null; continue; }
      const payload = JSON.stringify({ auditId: row.id, userId: row.user_id || null, boardId, action: row.action, entityType: row.entity_type || null, entityId: row.entity_id || null, details: row.details || null, ipAddress: row.ip_address || null, prevHash: row.prev_hash || null });
      const expected = await sha256(payload); checked += 1;
      // The first row may point to an older event outside the requested limit;
      // verify its own hash, then verify links between rows included here.
      if (expected !== row.event_hash || (!first && (row.prev_hash || null) !== previousHash)) valid = false;
      previousHash = String(row.event_hash);
      first = false;
    }
    return json({ boardId, data: rows.results, integrity: { valid, checked, legacy, scope: `latest_${limit}`, note: legacy ? 'Eldre hendelser mangler hash og er beholdt som legacy.' : 'Alle viste hendelser er hash-verifisert.' } });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
