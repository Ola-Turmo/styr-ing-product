const baseUrl = (process.env.STYR_SMOKE_BASE_URL || 'https://styr.ing').replace(/\/$/, '');
const checks = [
  ['health', '/api/health', 200], ['auth session', '/api/auth', 200],
  ['legal status', '/api/legal?boardId=board-1', 200], ['billing status', '/api/billing?boardId=board-1', 200],
  ['privacy center', '/api/privacy?boardId=board-1', 200], ['membership guard', '/api/members?boardId=board-1', 401],
 ['invite activation page', '/activate/', 200], ['public landing page', '/', 200], ['public capability map', '/capabilities/', 200], ['customer workspace shell', '/app/', 200], ['tenant workspace shell', '/app/arbeidsflate/', 200], ['tenant finance workspace shell', '/app/finance/', 200], ['tenant intelligence workspace shell', '/app/intelligence/', 200], ['boards', '/api/boards', 200],
 ['event mesh summary', '/api/events?boardId=board-1&view=summary', 200], ['event mesh destinations', '/api/events?boardId=board-1&view=destinations', 200], ['event mesh deliveries', '/api/events?boardId=board-1&view=deliveries', 200], ['event mesh events', '/api/events?boardId=board-1&view=events', 200],
  ['compliance summary', '/api/compliance?boardId=board-1&view=summary', 200],
  ['controls summary', '/api/controls?boardId=board-1&view=summary', 200],
  ['risk summary', '/api/risk?boardId=board-1&view=summary', 200],
  ['risk register', '/api/risk?boardId=board-1&view=risks', 200],
  ['risk actions', '/api/risk?boardId=board-1&view=actions', 200],
  ['HMS and ESG summary', '/api/sustainability?boardId=board-1&view=summary', 200],
  ['HMS and ESG items', '/api/sustainability?boardId=board-1&view=items', 200],
  ['HCM summary', '/api/hcm?boardId=board-1&view=summary', 200], ['HCM people', '/api/hcm?boardId=board-1&view=people', 200], ['HCM goals', '/api/hcm?boardId=board-1&view=goals', 200], ['HCM candidates', '/api/hcm?boardId=board-1&view=candidates', 200], ['HCM handbook', '/api/hcm?boardId=board-1&view=handbook', 200], ['HCM training', '/api/hcm?boardId=board-1&view=training', 200], ['HCM reviews', '/api/hcm?boardId=board-1&view=reviews', 200], ['HCM offboarding', '/api/hcm?boardId=board-1&view=offboarding', 200],
  ['governance summary', '/api/governance?boardId=board-1&view=summary', 200], ['governance contracts', '/api/governance?boardId=board-1&view=contracts', 200], ['governance redlines', '/api/governance?boardId=board-1&view=redlines', 200], ['governance mandates', '/api/governance?boardId=board-1&view=mandates', 200], ['governance equity', '/api/governance?boardId=board-1&view=equity', 200], ['governance grants', '/api/governance?boardId=board-1&view=grants', 200],
  ['board governance summary', '/api/board_governance?boardId=board-1&view=summary', 200],
  ['board governance attendance', '/api/board_governance?boardId=board-1&view=attendance', 200],
  ['board governance ballots', '/api/board_governance?boardId=board-1&view=ballots', 200],
  ['operations cockpit', '/api/operations?boardId=board-1', 200],
  ['audit trail', '/api/audit?boardId=board-1', 200], ['SAF-T export', '/api/finance?boardId=board-1&view=saf-t', 200],
  ['accounting periods', '/api/finance?boardId=board-1&view=periods', 200], ['chart of accounts', '/api/finance?boardId=board-1&view=accounts', 200],
  ['treasury summary', '/api/treasury?boardId=board-1&view=summary', 200], ['treasury payroll', '/api/treasury?boardId=board-1&view=payroll', 200],
  ['treasury submissions', '/api/treasury?boardId=board-1&view=submissions', 200], ['treasury liquidity', '/api/treasury?boardId=board-1&view=liquidity', 200],
  ['treasury collections', '/api/treasury?boardId=board-1&view=collections', 200],
  ['payroll summary', '/api/payroll?boardId=board-1&view=summary', 200],
  ['payroll runs', '/api/payroll?boardId=board-1&view=runs', 200],
  ['payroll checks', '/api/payroll?boardId=board-1&view=checks', 200],
  ['field summary', '/api/field?boardId=board-1&view=summary', 200], ['field projects', '/api/field?boardId=board-1&view=projects', 200],
  ['field time', '/api/field?boardId=board-1&view=time', 200], ['field WIP', '/api/field?boardId=board-1&view=wip', 200],
  ['field invoice drafts', '/api/field?boardId=board-1&view=invoice_drafts', 200],
  ['commercial summary', '/api/commercial?boardId=board-1&view=summary', 200], ['commercial pipeline', '/api/commercial?boardId=board-1&view=pipeline', 200],
  ['commercial quotes', '/api/commercial?boardId=board-1&view=quotes', 200], ['commercial rooms', '/api/commercial?boardId=board-1&view=rooms', 200],
  ['commercial subscriptions', '/api/commercial?boardId=board-1&view=subscriptions', 200], ['commercial cases', '/api/commercial?boardId=board-1&view=cases', 200],
  ['IT summary', '/api/it?boardId=board-1&view=summary', 200], ['IT assets', '/api/it?boardId=board-1&view=assets', 200],
  ['IT tickets', '/api/it?boardId=board-1&view=tickets', 200], ['IT SaaS insights', '/api/it?boardId=board-1&view=saas_insights', 200],
  ['IT access', '/api/it?boardId=board-1&view=access', 200], ['IT lifecycle', '/api/it?boardId=board-1&view=lifecycle', 200],
  ['fixed assets summary', '/api/assets?boardId=board-1&view=summary', 200], ['fixed assets rows', '/api/assets?boardId=board-1&view=assets', 200], ['depreciation rows', '/api/assets?boardId=board-1&view=depreciation', 200],
  ['cards summary', '/api/cards?boardId=board-1&view=summary', 200], ['cards rows', '/api/cards?boardId=board-1&view=cards', 200], ['card transactions', '/api/cards?boardId=board-1&view=transactions', 200],
  ['revenue summary', '/api/revenue?boardId=board-1&view=summary', 200], ['revenue contracts', '/api/revenue?boardId=board-1&view=contracts', 200], ['revenue obligations', '/api/revenue?boardId=board-1&view=obligations', 200], ['revenue schedule', '/api/revenue?boardId=board-1&view=schedule', 200],
  ['procurement summary', '/api/procurement?boardId=board-1&view=summary', 200], ['procurement orders', '/api/procurement?boardId=board-1&view=orders', 200], ['procurement receipts', '/api/procurement?boardId=board-1&view=receipts', 200], ['procurement invoices', '/api/procurement?boardId=board-1&view=invoices', 200],
  ['private board guard', '/api/events?boardId=board-2&view=summary', 403], ['private forecast guard', '/api/forecast?boardId=board-2', 403],
  ['private domain guard', '/api/domains/people?boardId=board-2', 403],
];
const failures = [];
for (const [label, path, expected] of checks) {
  const response = await fetch(`${baseUrl}${path}`);
  if (response.status !== expected) failures.push(`${label}: expected ${expected}, got ${response.status}`);
  if (label === 'SAF-T export' && !((response.headers.get('content-type') || '').includes('application/xml'))) failures.push(`${label}: expected application/xml content type`);
  if (label === 'boards') {
    const payload = await response.json();
    if (!Array.isArray(payload.data) || payload.data.some((board) => board.id !== 'board-1')) failures.push(`${label}: unauthenticated response must be limited to fictional board-1`);
  }
}
for (const [label, path, payload] of [
  ['event mesh write guard', '/api/events', { boardId: 'board-1' }], ['assistant write guard', '/api/assistant', { boardId: 'board-1', question: 'status' }],
  ['domain write guard', '/api/domains/people', { boardId: 'board-1', data: { name: 'Unauthorised' } }],
  ['meeting write guard', '/api/board_governance', { boardId: 'board-1', action: 'create_meeting', title: 'Unauthorised', date: '2026-08-25' }],
  ['resolution write guard', '/api/board_governance', { boardId: 'board-1', action: 'create_resolution', number: 'X-UNAUTH', title: 'Unauthorised' }],
  ['meeting status write guard', '/api/board_governance', { boardId: 'board-1', action: 'update_meeting_status', meetingId: 'fixture-not-used', status: 'completed' }],
  ['ballot write guard', '/api/board_governance', { boardId: 'board-1', action: 'cast_ballot', resolutionId: 'fixture-not-used', memberId: 'fixture-not-used', vote: 'for' }],
  ['compliance write guard', '/api/compliance', { boardId: 'board-1', eventId: 'fixture-not-used', status: 'pending' }],
  ['controls write guard', '/api/controls', { boardId: 'board-1', controlId: 'fixture-not-used', status: 'green' }],
  ['HMS and ESG write guard', '/api/sustainability', { boardId: 'board-1', action: 'close_item', itemId: 'fixture-not-used' }],
  ['risk write guard', '/api/risk', { boardId: 'board-1', action: 'update_risk', riskId: 'fixture-not-used', status: 'monitoring' }],
  ['risk create guard', '/api/risk', { boardId: 'board-1', action: 'create_risk', title: 'Unauthorised risk', level: 'high' }],
  ['risk action completion guard', '/api/risk', { boardId: 'board-1', action: 'complete_action', actionId: 'fixture-not-used' }],
  ['HCM write guard', '/api/hcm', { boardId: 'board-1', action: 'update_goal', goalId: 'fixture-not-used', progress: 50, status: 'on_track' }],
  ['HCM offboarding guard', '/api/hcm', { boardId: 'board-1', action: 'advance_offboarding', caseId: 'fixture-not-used', accessRevoked: true }],
  ['HCM candidate write guard', '/api/hcm', { boardId: 'board-1', action: 'update_candidate', candidateId: 'fixture-not-used', stage: 'screening' }],
  ['HCM scorecard write guard', '/api/hcm', { boardId: 'board-1', action: 'save_scorecard', candidateId: 'fixture-not-used', overallScore: 80, recommendation: 'yes' }],
  ['governance write guard', '/api/governance', { boardId: 'board-1', action: 'review_contract', reviewId: 'fixture-not-used', decision: 'approved' }],
  ['board governance write guard', '/api/board_governance', { boardId: 'board-1', action: 'record_attendance', attendanceId: 'fixture-not-used', attendanceStatus: 'present' }],
  ['finance period write guard', '/api/finance', { boardId: 'board-1', action: 'lock_period', period: '2026-99' }],
  ['payroll write guard', '/api/payroll', { boardId: 'board-1', action: 'calculate_compliance', payrollRunId: 'fixture-not-used' }],
  ['payroll approval guard', '/api/payroll', { boardId: 'board-1', action: 'approve_compliance', checkId: 'fixture-not-used' }],
  ['treasury write guard', '/api/treasury', { boardId: 'board-1', action: 'create_liquidity_snapshot' }],
  ['field write guard', '/api/field', { boardId: 'board-1', action: 'approve_time', entryId: 'fixture-not-used' }],
  ['field invoice preparation guard', '/api/field', { boardId: 'board-1', action: 'prepare_invoice', projectId: 'fixture-not-used', period: '2026-08' }],
  ['field invoice approval guard', '/api/field', { boardId: 'board-1', action: 'approve_invoice_draft', draftId: 'fixture-not-used' }],
  ['commercial write guard', '/api/commercial', { boardId: 'board-1', action: 'approve_quote', quoteId: 'fixture-not-used' }],
  ['IT ticket write guard', '/api/it', { boardId: 'board-1', action: 'create_ticket', title: 'Unauthorised' }],
  ['IT SaaS register write guard', '/api/it', { boardId: 'board-1', action: 'create_saas_subscription', name: 'Unauthorised', vendor: 'Unauthorised', seats: 1 }],
  ['IT write guard', '/api/it', { boardId: 'board-1', action: 'approve_lifecycle_task', taskId: 'fixture-not-used' }],
  ['fixed assets write guard', '/api/assets', { boardId: 'board-1', action: 'approve_depreciation', entryId: 'fixture-not-used' }],
  ['cards write guard', '/api/cards', { boardId: 'board-1', action: 'approve_transaction', transactionId: 'fixture-not-used' }],
  ['revenue write guard', '/api/revenue', { boardId: 'board-1', action: 'approve_schedule_entry', entryId: 'fixture-not-used' }],
  ['revenue schedule preparation guard', '/api/revenue', { boardId: 'board-1', action: 'prepare_schedule', contractId: 'fixture-not-used' }],
  ['procurement write guard', '/api/procurement', { boardId: 'board-1', action: 'approve_order', orderId: 'fixture-not-used' }],
  ['procurement order creation guard', '/api/procurement', { boardId: 'board-1', action: 'create_order', orderNumber: 'UNAUTH', supplierName: 'Unauthorised', totalMinor: 100, currency: 'NOK' }],
  ['procurement receipt creation guard', '/api/procurement', { boardId: 'board-1', action: 'create_receipt', purchaseOrderId: 'fixture-not-used', receivedDate: '2026-08-25', status: 'confirmed' }],
  ['procurement invoice creation guard', '/api/procurement', { boardId: 'board-1', action: 'create_invoice', invoiceNumber: 'UNAUTH', supplierName: 'Unauthorised', amountMinor: 100, currency: 'NOK', dueDate: '2026-08-25' }],
  ['procurement invoice match guard', '/api/procurement', { boardId: 'board-1', action: 'match_invoice', invoiceId: 'fixture-not-used' }],
  ['procurement invoice approval guard', '/api/procurement', { boardId: 'board-1', action: 'approve_invoice', invoiceId: 'fixture-not-used' }],
  ['payroll compliance calculation guard', '/api/payroll', { boardId: 'board-1', action: 'calculate_compliance', payrollRunId: 'fixture-not-used' }],
  ['payroll submission preparation guard', '/api/payroll', { boardId: 'board-1', action: 'prepare_submission', submissionType: 'a_melding', period: '2026-08' }],
  ['field trip classification guard', '/api/field', { boardId: 'board-1', action: 'classify_trip', tripId: 'fixture-not-used', tripType: 'business' }],
  ['field maintenance guard', '/api/field', { boardId: 'board-1', action: 'complete_maintenance', maintenanceId: 'fixture-not-used' }],
  ['field invoice preparation guard', '/api/field', { boardId: 'board-1', action: 'prepare_invoice', projectId: 'fixture-not-used', period: '2026-08' }],
  ['commercial case creation guard', '/api/commercial', { boardId: 'board-1', action: 'create_case', title: 'Unauthorised case', priority: 'low', channel: 'internal' }],
  ['commercial quote send guard', '/api/commercial', { boardId: 'board-1', action: 'send_quote', quoteId: 'fixture-not-used' }],
  ['commercial case response guard', '/api/commercial', { boardId: 'board-1', action: 'record_case_response', caseId: 'fixture-not-used' }],
  ['commercial case status guard', '/api/commercial', { boardId: 'board-1', action: 'update_case_status', caseId: 'fixture-not-used', status: 'in_progress' }],
  ['commercial case resolution guard', '/api/commercial', { boardId: 'board-1', action: 'resolve_case', caseId: 'fixture-not-used' }],
  ['governance review guard', '/api/governance', { boardId: 'board-1', action: 'review_contract', reviewId: 'fixture-not-used', decision: 'approved' }],
  ['governance redline guard', '/api/governance', { boardId: 'board-1', action: 'accept_redline', redlineId: 'fixture-not-used' }],
  ['governance mandate guard', '/api/governance', { boardId: 'board-1', action: 'activate_mandate', mandateId: 'fixture-not-used' }],
  ['billing checkout guard', '/api/billing-checkout', { boardId: 'board-1', plan: 'paid' }],
  ['privacy request guard', '/api/privacy', { boardId: 'board-1', requestType: 'access' }],
  ['invite guard', '/api/auth', { action: 'invite_user', boardId: 'board-1', email: 'invite@example.invalid', name: 'Invite User' }],
]) {
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (response.status !== 401) failures.push(`${label}: expected 401, got ${response.status}`);
}
const invalidLogin = await fetch(`${baseUrl}/api/auth`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'login', email: 'nobody@example.invalid', password: 'not-a-real-password' }) });
if (invalidLogin.status !== 401) failures.push(`invalid login guard: expected 401, got ${invalidLogin.status}`);
const webhookUnconfigured = await fetch(`${baseUrl}/api/billing-webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
if (![400, 503].includes(webhookUnconfigured.status)) failures.push(`billing webhook guard: expected 400 or 503, got ${webhookUnconfigured.status}`);
if (failures.length) { console.error(`LIVE API SMOKE: FAIL (${failures.length})`); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
console.log(`LIVE API SMOKE: PASS (${checks.length + 3} checks against ${baseUrl})`);
