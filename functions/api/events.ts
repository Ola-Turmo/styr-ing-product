import { authorizeBoardRead, authorizeWrite, body, id, json, recordAudit, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'destinations', 'deliveries', 'events']);
const validStatuses = new Set(['proposed', 'active', 'paused', 'revoked']);

function matches(filter: string, eventType: string) {
  return filter === '*' || filter.split(',').map((item) => item.trim()).includes(eventType);
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!authorizeBoardRead(request, env, boardId)) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'destinations') {
      const rows = await db.prepare('SELECT id,name,endpoint_url,event_filter,status,secret_ref,created_at,activated_at FROM event_destinations WHERE board_id=? ORDER BY created_at DESC').bind(boardId).all();
      return json({ boardId, view, data: rows.results });
    }
    if (view === 'deliveries') {
      const rows = await db.prepare('SELECT d.*,x.name destination_name,e.event_type FROM event_deliveries d JOIN event_destinations x ON x.id=d.destination_id JOIN api_events e ON e.id=d.event_id WHERE d.board_id=? ORDER BY d.created_at DESC LIMIT 100').bind(boardId).all();
      return json({ boardId, view, data: rows.results });
    }
    if (view === 'events') {
      const rows = await db.prepare('SELECT * FROM api_events WHERE board_id=? ORDER BY created_at DESC LIMIT 100').bind(boardId).all();
      return json({ boardId, view, data: rows.results });
    }
    const [destinations, queued, sent, failed, recent] = await Promise.all([
      db.prepare('SELECT COUNT(*) count FROM event_destinations WHERE board_id=?').bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM event_deliveries WHERE board_id=? AND status='queued'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM event_deliveries WHERE board_id=? AND status='sent'").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM event_deliveries WHERE board_id=? AND status='failed'").bind(boardId).first(),
      db.prepare('SELECT COUNT(*) count FROM api_events WHERE board_id=? AND created_at >= datetime(\'now\', \'-7 day\')').bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { destinations, queued, sent, failed, recent } });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return json({ error: 'write_not_authorized' }, { status: 401 });
  try {
    const value = await body(request);
    const action = String(value?.action || 'ingest_event');
    const boardId = String(value?.boardId || '').trim();
    if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
    const db = requireDb(env);

    if (action === 'register_destination') {
      const name = String(value?.name || '').trim();
      const endpointUrl = String(value?.endpointUrl || '').trim();
      const eventFilter = String(value?.eventFilter || '*').trim().slice(0, 500);
      if (!name || !endpointUrl) return json({ error: 'name_and_endpointUrl_required' }, { status: 400 });
      let parsed: URL;
      try { parsed = new URL(endpointUrl); } catch { return json({ error: 'endpointUrl_invalid' }, { status: 400 }); }
      if (!['https:', 'http:'].includes(parsed.protocol)) return json({ error: 'endpointUrl_must_be_http' }, { status: 400 });
      const destinationId = id('destination');
      await db.prepare('INSERT INTO event_destinations (id,board_id,name,endpoint_url,event_filter,status,secret_ref) VALUES (?,?,?,?,?,?,?)').bind(destinationId, boardId, name, parsed.toString(), eventFilter || '*', 'proposed', value?.secretRef ? String(value.secretRef).slice(0, 200) : null).run();
      await recordAudit(db, { boardId, action: 'event_destination_registered', entityType: 'event_destination', entityId: destinationId, details: { name, eventFilter } });
      return json({ ok: true, action, destinationId, status: 'proposed', delivery: 'disabled_until_activation' }, { status: 201 });
    }

    if (action === 'activate_destination' || action === 'pause_destination' || action === 'revoke_destination') {
      const destinationId = String(value?.destinationId || '').trim();
      const status = action === 'activate_destination' ? 'active' : action === 'pause_destination' ? 'paused' : 'revoked';
      const result = await db.prepare(`UPDATE event_destinations SET status=?,activated_at=CASE WHEN ?='active' THEN datetime('now') ELSE activated_at END WHERE id=? AND board_id=?`).bind(status, status, destinationId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'destination_not_found' }, { status: 404 });
      await recordAudit(db, { boardId, action: `event_destination_${status}`, entityType: 'event_destination', entityId: destinationId });
      return json({ ok: true, action, destinationId, status, delivery: status === 'active' ? 'queued_only_until_sender_enabled' : 'disabled' });
    }

    if (action === 'retry_delivery') {
      const deliveryId = String(value?.deliveryId || '').trim();
      const result = await db.prepare("UPDATE event_deliveries SET status='queued',last_error=NULL WHERE id=? AND board_id=? AND status='failed'").bind(deliveryId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'failed_delivery_not_found' }, { status: 404 });
      await recordAudit(db, { boardId, action: 'event_delivery_retried', entityType: 'event_delivery', entityId: deliveryId });
      return json({ ok: true, action, deliveryId, status: 'queued', delivery: 'sender_not_configured' });
    }

    if (action === 'ingest_event') {
      const eventType = String(value?.eventType || '').trim();
      if (!eventType) return json({ error: 'eventType_required' }, { status: 400 });
      const eventId = id('event');
      const payload = JSON.stringify(value?.payload ?? {});
      await db.prepare('INSERT INTO api_events (id,board_id,event_type,payload) VALUES (?,?,?,?)').bind(eventId, boardId, eventType, payload).run();
      const destinations = await db.prepare("SELECT id,event_filter FROM event_destinations WHERE board_id=? AND status='active'").bind(boardId).all<{ id: string; event_filter: string }>();
      let queued = 0;
      for (const destination of destinations.results) {
        if (!matches(destination.event_filter, eventType)) continue;
        await db.prepare('INSERT OR IGNORE INTO event_deliveries (id,board_id,destination_id,event_id,status) VALUES (?,?,?,?,?)').bind(id('delivery'), boardId, destination.id, eventId, 'queued').run();
        queued += 1;
      }
      await recordAudit(db, { boardId, action: 'event_ingested', entityType: 'api_event', entityId: eventId, details: { eventType, queued } });
      return json({ ok: true, action, eventId, eventType, queued, sender: 'not_configured', requiresHumanApproval: true });
    }

    return json({ error: 'unknown_action', allowed: ['ingest_event', 'register_destination', 'activate_destination', 'pause_destination', 'revoke_destination', 'retry_delivery'] }, { status: 400 });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
