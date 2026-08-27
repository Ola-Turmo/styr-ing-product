import { authorizeBoardRead, authorizeBoardWrite, id, json, recordAudit, requireDb, sha256Bytes, type Env } from './_lib';

const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/csv', 'application/xml', 'text/xml']);
const maxBytes = 10 * 1024 * 1024;
const text = (value: unknown, max = 240) => String(value ?? '').trim().slice(0, max);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url); const boardId = text(url.searchParams.get('boardId')); const documentId = text(url.searchParams.get('documentId'));
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (!documentId) {
      const rows = await db.prepare('SELECT id,file_name,content_type,size_bytes,content_hash,entity_type,entity_id,uploaded_by,created_at FROM accounting_documents WHERE board_id=? ORDER BY created_at DESC LIMIT 200').bind(boardId).all();
      return json({ boardId, data: rows.results, storage: env.DOCS ? 'r2' : 'not_configured' });
    }
    const row = await db.prepare('SELECT storage_key,file_name,content_type,content_hash,size_bytes FROM accounting_documents WHERE id=? AND board_id=?').bind(documentId, boardId).first<{ storage_key: string; file_name: string; content_type: string; content_hash: string; size_bytes: number }>();
    if (!row) return json({ error: 'document_not_found' }, { status: 404 });
    if (!env.DOCS) return json({ error: 'document_storage_not_configured' }, { status: 503 });
    const object = await env.DOCS.get(row.storage_key); if (!object) return json({ error: 'document_blob_not_found' }, { status: 404 });
    return new Response(await object.arrayBuffer(), { headers: { 'content-type': row.content_type, 'content-length': String(row.size_bytes), 'content-disposition': `inline; filename="${row.file_name.replace(/["\\\r\n]/g, '_')}"`, 'etag': row.content_hash, 'cache-control': 'private, no-store' } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const form = await request.formData().catch(() => null); const boardId = text(form?.get('boardId')); const file = form?.get('file');
  if (!boardId || !(file instanceof File)) return json({ error: 'boardId_and_file_required' }, { status: 400 });
  if (!form) return json({ error: 'multipart_form_required' }, { status: 400 });
  const auth = await authorizeBoardWrite(request, env, boardId); if (!auth.allowed) return json({ error: 'write_not_authorized' }, { status: 401 });
  if (!env.DOCS) return json({ error: 'document_storage_not_configured' }, { status: 503 });
  if (!file.size || file.size > maxBytes) return json({ error: 'document_size_invalid', maxBytes }, { status: 400 });
  const contentType = text(file.type, 80).toLowerCase(); if (!allowed.has(contentType)) return json({ error: 'document_type_not_allowed', allowed: [...allowed] }, { status: 400 });
  try {
    const db = requireDb(env); const bytes = new Uint8Array(await file.arrayBuffer()); const contentHash = await sha256Bytes(bytes);
    const documentId = id('doc'); const storageKey = `${boardId}/${documentId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160)}`;
    const entityType = text(form.get('entityType'), 60) || null; const entityId = text(form.get('entityId'), 120) || null; const actor = auth.userId || 'api';
    if (entityId && entityType) {
      const entityTables: Record<string, string> = {
        voucher: 'vouchers',
        sales_invoice: 'sales_invoices',
        supplier_invoice: 'supplier_invoices',
        receipt: 'card_transactions',
      };
      const table = entityTables[entityType];
      if (table) {
        const entity = await db.prepare(`SELECT id FROM ${table} WHERE id=? AND board_id=?`).bind(entityId, boardId).first();
        if (!entity) return json({ error: 'document_entity_not_found', entityType }, { status: 404 });
      }
    }
    await env.DOCS.put(storageKey, bytes, { httpMetadata: { contentType }, customMetadata: { boardId, documentId, contentHash } });
    try { await db.prepare('INSERT INTO accounting_documents (id,board_id,storage_key,file_name,content_type,size_bytes,content_hash,entity_type,entity_id,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(documentId, boardId, storageKey, file.name.slice(0, 240), contentType, file.size, contentHash, entityType, entityId, actor).run(); }
    catch (error) { await env.DOCS.delete(storageKey); throw error; }
    await recordAudit(db, { boardId, action: 'document_uploaded', entityType: entityType || 'accounting_document', entityId: documentId, userId: auth.userId || undefined, details: { fileName: file.name.slice(0, 240), contentType, sizeBytes: file.size, contentHash, entityId: entityId || undefined, storage: 'r2' } });
    return json({ ok: true, action: 'upload_document', documentId, fileName: file.name, contentType, sizeBytes: file.size, contentHash, entityType, entityId, storage: 'r2' }, { status: 201 });
  } catch (error) { return json({ error: 'document_upload_failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
