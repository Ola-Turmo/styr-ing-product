import { authorizeBoardMember, authorizeBoardRead, body, getSession, id, json, requireDb, type Env } from './_lib';

const inventory = [
  { category: 'identity_and_access', examples: 'navn, e-post, rolle, medlemskap, sesjoner', purpose: 'innlogging, tilgang og sikkerhet', basis: 'avtale / berettiget interesse' },
  { category: 'governance', examples: 'møter, vedtak, fremmøte, avstemninger', purpose: 'levere styre- og beslutningsspor', basis: 'kundeinstruks / avtale' },
  { category: 'finance_and_tax', examples: 'bilag, faktura, bank, skatt, lønn', purpose: 'økonomi- og rapporteringsarbeidsflater', basis: 'kundeinstruks / rettslig plikt hos kunden' },
  { category: 'people_and_payroll', examples: 'ansatte, mål, opplæring, offboarding', purpose: 'HCM- og arbeidsflyter', basis: 'kundeinstruks / arbeidsrettslig grunnlag hos kunden' },
  { category: 'ai_explanations', examples: 'utkast, kilder, forklaringer, godkjenninger', purpose: 'beslutningsstøtte med menneskelig kontroll', basis: 'kundeinstruks / avtale' },
  { category: 'audit_and_security', examples: 'kontrollspor, IP, user-agent, hendelser', purpose: 'sikkerhet, feilsøking og etterprøvbarhet', basis: 'berettiget interesse / rettslig plikt' },
];

const defaults = [
  ['account_and_membership', 'Avtaleperioden + 30 dager', 'sletting eller anonymisering etter avslutning', 'avtale'],
  ['customer_operational_data', 'Etter kundens instruks', 'eksport og sikker sletting etter avslutning', 'kundeinstruks'],
  ['audit_and_security_logs', '12 måneder etter siste aktivitet', 'automatisk sletting med lovpålagte unntak', 'sikkerhet / plikt'],
  ['billing_and_contract', 'Lovpålagt regnskapsperiode', 'begrenset tilgang og deretter sletting', 'rettslig plikt'],
];

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url); const boardId = (url.searchParams.get('boardId') || '').trim(); const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env); const session = await getSession(request, env);
    if (view === 'inventory') return json({ boardId, inventory });
    if (view === 'export') {
      if (!session) return json({ error: 'authenticated_session_required' }, { status: 401 });
      const authorization = await authorizeBoardMember(request, env, boardId);
      if (!authorization.allowed || !authorization.userId) return json({ error: 'authenticated_board_member_required' }, { status: 403 });
      const [user, membership, requests, audit] = await Promise.all([
        db.prepare('SELECT id,email,name,role,created_at,last_login FROM users WHERE id=?').bind(session.userId).first(),
        db.prepare('SELECT board_id,role FROM user_boards WHERE user_id=? AND board_id=?').bind(session.userId, boardId).all(),
        db.prepare('SELECT id,request_type,status,created_at,fulfilled_at FROM privacy_requests WHERE user_id=? AND board_id=? ORDER BY created_at DESC').bind(session.userId, boardId).all(),
        db.prepare('SELECT id,action,entity_type,entity_id,created_at FROM audit_log WHERE board_id=? AND user_id=? ORDER BY created_at DESC LIMIT 200').bind(boardId, session.userId).all(),
      ]);
      return json({ boardId, exportedAt: new Date().toISOString(), format: 'application/json', data: { user, membership: membership.results, privacyRequests: requests.results, auditEvents: audit.results } });
    }
    const policies = (await db.prepare('SELECT data_category,retention_period,deletion_method,legal_basis,status FROM retention_policies WHERE board_id=? OR board_id IS NULL ORDER BY data_category').bind(boardId).all()).results;
    const requests = session ? (await db.prepare('SELECT id,request_type,status,notes,created_at,updated_at,fulfilled_at FROM privacy_requests WHERE board_id=? AND user_id=? ORDER BY created_at DESC').bind(boardId, session.userId).all()).results : [];
    return json({ boardId, inventory, retention: policies.length ? policies : defaults.map(([data_category, retention_period, deletion_method, legal_basis]) => ({ data_category, retention_period, deletion_method, legal_basis, status: 'draft' })), requests });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const value = await body(request); const boardId = String(value?.boardId || '').trim(); const requestType = String(value?.requestType || '').trim();
  if (!boardId || !['access', 'export', 'deletion'].includes(requestType)) return json({ error: 'boardId_and_valid_requestType_required' }, { status: 400 });
  const authorization = await authorizeBoardMember(request, env, boardId);
  if (!authorization.allowed || !authorization.userId) return json({ error: 'authenticated_board_write_required' }, { status: 401 });
  try {
    const requestId = id('privacy');
    await requireDb(env).prepare('INSERT INTO privacy_requests (id,board_id,user_id,request_type,notes) VALUES (?,?,?,?,?)').bind(requestId, boardId, authorization.userId, requestType, String(value?.notes || '').slice(0, 1000) || null).run();
    return json({ ok: true, requestId, requestType, status: 'received', next: requestType === 'export' ? 'Use GET /api/privacy?view=export after review.' : 'Privacy administrator review required.' }, { status: 201 });
  } catch (error) { return json({ error: 'privacy_request_failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
