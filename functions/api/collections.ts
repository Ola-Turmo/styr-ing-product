import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, sha256, type Env } from './_lib';

const views = new Set(['reminders']);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const money = (value: unknown) => new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0) / 100);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url), boardId = (url.searchParams.get('boardId') || '').trim(), view = url.searchParams.get('view') || 'reminders';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    const data = (await db.prepare(`SELECT d.*,c.reference,c.status case_status,a.company_name
      FROM collection_reminder_drafts d JOIN collection_cases c ON c.id=d.collection_case_id AND c.board_id=d.board_id
      LEFT JOIN crm_accounts a ON a.id=c.account_id WHERE d.board_id=? ORDER BY d.created_at DESC LIMIT 100`).bind(boardId).all()).results;
    return json({ boardId, view, data, externalDelivery: 'not_configured' });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request), boardId = String(value?.boardId || '').trim(), action = String(value?.action || '').trim();
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId);
    if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 });
    const db = requireDb(env), actor = authorization.userId || 'service';
    if (action === 'prepare_reminder') {
      const invoiceId = String(value?.invoiceId || '').trim();
      const invoice = await db.prepare(`SELECT i.id,i.account_id,i.invoice_number,i.issue_date,i.due_date,i.total_minor,i.paid_minor,i.status,
        COALESCE((SELECT SUM(cn.total_minor) FROM sales_credit_notes cn WHERE cn.sales_invoice_id=i.id AND cn.board_id=i.board_id AND cn.status='posted'),0) credited_minor,
        a.company_name,COALESCE(p.email,'') customer_email
        FROM sales_invoices i LEFT JOIN crm_accounts a ON a.id=i.account_id
        LEFT JOIN customer_invoice_profiles p ON p.board_id=i.board_id AND p.account_id=i.account_id
        WHERE i.id=? AND i.board_id=? AND i.status NOT IN ('draft','review','cancelled')`).bind(invoiceId, boardId).first<Record<string, unknown>>();
      if (!invoice) return json({ error: 'sales_invoice_not_found_or_not_issued' }, { status: 404 });
      const outstanding = Math.max(0, Number(invoice.total_minor || 0) - Number(invoice.paid_minor || 0) - Number(invoice.credited_minor || 0));
      const today = new Date().toISOString().slice(0, 10), dueDate = String(invoice.due_date || '');
      if (outstanding <= 0) return json({ error: 'sales_invoice_fully_settled' }, { status: 409 });
      if (!datePattern.test(dueDate) || dueDate >= today) return json({ error: 'sales_invoice_not_overdue' }, { status: 409 });
      const reference = `sales_invoice:${invoice.id}`;
      let collectionCase = await db.prepare("SELECT id,status FROM collection_cases WHERE board_id=? AND reference=? AND status NOT IN ('paid','closed') ORDER BY created_at DESC LIMIT 1").bind(boardId, reference).first<{ id: string; status: string }>();
      if (!collectionCase) {
        const caseId = id('collect');
        await db.prepare("INSERT INTO collection_cases (id,board_id,account_id,reference,amount_minor,due_date,status,next_action,human_approved) VALUES (?,?,?,?,?,?,'open',?,0)").bind(caseId, boardId, invoice.account_id || null, reference, outstanding, dueDate, 'Kontroller og godkjenn purringsutkast').run();
        collectionCase = { id: caseId, status: 'open' };
        await recordAudit(db, { boardId, action: 'collection_case_created', entityType: 'collection_case', entityId: caseId, userId: authorization.userId || undefined, details: { invoiceId, amountMinor: outstanding, requiresHumanApproval: true } });
      }
      const existing = await db.prepare("SELECT id,version,status,checksum FROM collection_reminder_drafts WHERE board_id=? AND collection_case_id=? AND status<>'void' ORDER BY version DESC LIMIT 1").bind(boardId, collectionCase.id).first<Record<string, unknown>>();
      if (existing) return json({ ok: true, action, caseId: collectionCase.id, draftId: existing.id, version: existing.version, status: existing.status, checksum: existing.checksum, idempotent: true, externalDelivery: 'not_configured' });
      const recipient = String(invoice.company_name || 'Kunde'), subject = `Påminnelse: faktura ${String(invoice.invoice_number || '')} har forfalt`;
      const bodyText = `Hei ${recipient},\n\nDette er en vennlig påminnelse om faktura ${String(invoice.invoice_number || '')} på ${money(outstanding)} kr med forfall ${dueDate}. Vi kan ikke se at innbetalingen er registrert. Ta kontakt dersom betalingen allerede er gjennomført, eller hvis dere ønsker å avklare fakturaen.\n\nMed vennlig hilsen\n${String((await db.prepare('SELECT name FROM boards WHERE id=?').bind(boardId).first<{ name: string }>())?.name || 'Styr.ing')}\n\nDette er et kontrollert utkast. Ingen purregebyr, renter eller utsending er aktivert.`;
      const payload = { recipient, email: String(invoice.customer_email || '') || null, invoiceNumber: invoice.invoice_number, issueDate: invoice.issue_date || null, dueDate, outstandingMinor: outstanding, subject, body: bodyText };
      const checksum = await sha256(JSON.stringify(payload));
      const draftId = id('reminder');
      await db.batch([
        db.prepare("INSERT INTO collection_reminder_drafts (id,board_id,collection_case_id,version,recipient_name,recipient_email,invoice_number,invoice_date,due_date,outstanding_minor,subject,body,status,checksum,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(draftId, boardId, collectionCase.id, 1, recipient, payload.email, payload.invoiceNumber, payload.issueDate, dueDate, outstanding, subject, bodyText, 'review', checksum, actor),
        db.prepare("UPDATE collection_cases SET status='reminder_prepared',next_action='Krever menneskelig gjennomgang før utsending',human_approved=0 WHERE id=? AND board_id=? AND status IN ('open','reminder_prepared')").bind(collectionCase.id, boardId),
      ]);
      await recordAudit(db, { boardId, action: 'collection_reminder_prepared', entityType: 'collection_reminder_draft', entityId: draftId, userId: authorization.userId || undefined, details: { caseId: collectionCase.id, invoiceId, version: 1, checksum, requiresHumanApproval: true, externalDelivery: 'not_configured' } });
      return json({ ok: true, action, caseId: collectionCase.id, draftId, version: 1, status: 'review', checksum, recipient, email: payload.email, invoiceNumber: payload.invoiceNumber, dueDate, outstandingMinor: outstanding, subject, body: bodyText, requiresHumanApproval: true, externalDelivery: 'not_configured' }, { status: 201 });
    }
    if (action === 'approve_reminder') {
      const draftId = String(value?.draftId || '').trim();
      const result = await db.prepare("UPDATE collection_reminder_drafts SET status='approved',approved_by=?,approved_at=datetime('now') WHERE id=? AND board_id=? AND status='review'").bind(actor, draftId, boardId).run();
      if (!result.meta?.changes) return json({ error: 'reminder_not_in_review_or_found' }, { status: 409 });
      await recordAudit(db, { boardId, action: 'collection_reminder_approved', entityType: 'collection_reminder_draft', entityId: draftId, userId: authorization.userId || undefined, details: { externalDelivery: 'not_configured', requiresHumanApproval: true } });
      return json({ ok: true, action, draftId, status: 'approved', externalDelivery: 'not_configured' });
    }
    return json({ error: 'unknown_action', allowed: ['prepare_reminder', 'approve_reminder'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
