import { authorizeBoardRead, authorizeBoardWrite, body, getSession, id, json, requireDb, type Env } from './_lib';

const requiredTypes = ['privacy', 'terms', 'subscription', 'refund', 'sla', 'dpa'] as const;

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    const documents = (await db.prepare("SELECT id,document_type,version,title,status,effective_at,content_hash FROM legal_documents WHERE status='published' ORDER BY document_type,version DESC").all()).results;
    const session = await getSession(request, env);
    const acceptances = session ? (await db.prepare('SELECT document_type,document_version,accepted_at FROM legal_acceptances WHERE board_id=? AND user_id=? ORDER BY accepted_at DESC').bind(boardId, session.userId).all()).results : [];
    const billing = await db.prepare('SELECT provider,customer_id,subscription_id,status,plan,current_period_end,cancel_at_period_end,last_event_at FROM billing_accounts WHERE board_id=?').bind(boardId).first();
    return json({ boardId, documents, acceptances, billing: billing || { provider: 'stripe', status: 'not_configured', plan: 'pilot' }, requiredTypes });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const value = await body(request);
  const boardId = String(value?.boardId || '').trim();
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  const authorization = await authorizeBoardWrite(request, env, boardId);
  if (!authorization.allowed || !authorization.userId) return json({ error: 'authenticated_board_write_required' }, { status: 401 });
  const documentType = String(value?.documentType || '').trim();
  const documentVersion = String(value?.documentVersion || '').trim();
  if (!requiredTypes.includes(documentType as typeof requiredTypes[number]) || !/^v?\d+\.\d+(\.\d+)?$/.test(documentVersion)) return json({ error: 'valid_documentType_and_documentVersion_required' }, { status: 400 });
  try {
    const db = requireDb(env);
    const document = await db.prepare("SELECT id FROM legal_documents WHERE document_type=? AND version=? AND status='published'").bind(documentType, documentVersion).first();
    if (!document) return json({ error: 'document_not_published' }, { status: 409 });
    await db.prepare('INSERT OR IGNORE INTO legal_acceptances (id,user_id,board_id,document_type,document_version,ip_address,user_agent) VALUES (?,?,?,?,?,?,?)').bind(id('accept'), authorization.userId, boardId, documentType, documentVersion, request.headers.get('cf-connecting-ip') || null, request.headers.get('user-agent')?.slice(0, 300) || null).run();
    return json({ ok: true, boardId, documentType, documentVersion, acceptedBy: authorization.userId });
  } catch (error) { return json({ error: 'acceptance_failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
