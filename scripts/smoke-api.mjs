const baseUrl = (process.env.STYR_SMOKE_BASE_URL || 'https://styr.ing').replace(/\/$/, '');
const checks = [
  ['health', '/api/health', 200], ['auth session', '/api/auth', 200],
  ['legal status', '/api/legal?boardId=board-1', 200], ['billing status', '/api/billing?boardId=board-1', 200],
  ['privacy center', '/api/privacy?boardId=board-1', 200], ['membership guard', '/api/members?boardId=board-1', 401],
  ['invite activation page', '/activate/', 200], ['customer workspace shell', '/app/', 200], ['tenant workspace shell', '/app/arbeidsflate/', 200], ['boards', '/api/boards', 200],
  ['event mesh summary', '/api/events?boardId=board-1&view=summary', 200],
  ['compliance summary', '/api/compliance?boardId=board-1&view=summary', 200],
  ['controls summary', '/api/controls?boardId=board-1&view=summary', 200],
  ['HMS and ESG summary', '/api/sustainability?boardId=board-1&view=summary', 200],
  ['HMS and ESG items', '/api/sustainability?boardId=board-1&view=items', 200],
  ['HCM summary', '/api/hcm?boardId=board-1&view=summary', 200], ['HCM people', '/api/hcm?boardId=board-1&view=people', 200], ['HCM goals', '/api/hcm?boardId=board-1&view=goals', 200], ['HCM candidates', '/api/hcm?boardId=board-1&view=candidates', 200], ['HCM handbook', '/api/hcm?boardId=board-1&view=handbook', 200], ['HCM training', '/api/hcm?boardId=board-1&view=training', 200], ['HCM reviews', '/api/hcm?boardId=board-1&view=reviews', 200], ['HCM offboarding', '/api/hcm?boardId=board-1&view=offboarding', 200],
  ['board governance summary', '/api/board_governance?boardId=board-1&view=summary', 200],
  ['board governance attendance', '/api/board_governance?boardId=board-1&view=attendance', 200],
  ['operations cockpit', '/api/operations?boardId=board-1', 200],
  ['audit trail', '/api/audit?boardId=board-1', 200], ['SAF-T export', '/api/finance?boardId=board-1&view=saf-t', 200],
  ['accounting periods', '/api/finance?boardId=board-1&view=periods', 200], ['chart of accounts', '/api/finance?boardId=board-1&view=accounts', 200],
  ['treasury summary', '/api/treasury?boardId=board-1&view=summary', 200], ['treasury payroll', '/api/treasury?boardId=board-1&view=payroll', 200],
  ['treasury submissions', '/api/treasury?boardId=board-1&view=submissions', 200], ['treasury liquidity', '/api/treasury?boardId=board-1&view=liquidity', 200],
  ['treasury collections', '/api/treasury?boardId=board-1&view=collections', 200],
  ['field summary', '/api/field?boardId=board-1&view=summary', 200], ['field projects', '/api/field?boardId=board-1&view=projects', 200],
  ['field time', '/api/field?boardId=board-1&view=time', 200], ['field WIP', '/api/field?boardId=board-1&view=wip', 200],
  ['field invoice drafts', '/api/field?boardId=board-1&view=invoice_drafts', 200],
  ['commercial summary', '/api/commercial?boardId=board-1&view=summary', 200], ['commercial pipeline', '/api/commercial?boardId=board-1&view=pipeline', 200],
  ['commercial quotes', '/api/commercial?boardId=board-1&view=quotes', 200], ['commercial rooms', '/api/commercial?boardId=board-1&view=rooms', 200],
  ['commercial subscriptions', '/api/commercial?boardId=board-1&view=subscriptions', 200], ['commercial cases', '/api/commercial?boardId=board-1&view=cases', 200],
  ['IT summary', '/api/it?boardId=board-1&view=summary', 200], ['IT assets', '/api/it?boardId=board-1&view=assets', 200],
  ['IT tickets', '/api/it?boardId=board-1&view=tickets', 200], ['IT SaaS insights', '/api/it?boardId=board-1&view=saas_insights', 200],
  ['IT access', '/api/it?boardId=board-1&view=access', 200], ['IT lifecycle', '/api/it?boardId=board-1&view=lifecycle', 200],
  ['private board guard', '/api/events?boardId=board-2&view=summary', 403],
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
  ['event mesh write guard', '/api/events', { boardId: 'board-1' }], ['assistant write guard', '/api/assistant', {}],
  ['compliance write guard', '/api/compliance', { boardId: 'board-1', eventId: 'fixture-not-used', status: 'pending' }],
  ['controls write guard', '/api/controls', { boardId: 'board-1', controlId: 'fixture-not-used', status: 'green' }],
  ['HMS and ESG write guard', '/api/sustainability', { boardId: 'board-1', action: 'close_item', itemId: 'fixture-not-used' }],
  ['risk write guard', '/api/risk', { boardId: 'board-1', action: 'update_risk', riskId: 'fixture-not-used', status: 'monitoring' }],
  ['HCM write guard', '/api/hcm', { boardId: 'board-1', action: 'update_goal', goalId: 'fixture-not-used', progress: 50, status: 'on_track' }],
  ['board governance write guard', '/api/board_governance', { boardId: 'board-1', action: 'record_attendance', attendanceId: 'fixture-not-used', attendanceStatus: 'present' }],
  ['finance period write guard', '/api/finance', { boardId: 'board-1', action: 'lock_period', period: '2026-99' }],
  ['payroll write guard', '/api/payroll', { boardId: 'board-1', action: 'calculate_compliance', payrollRunId: 'fixture-not-used' }],
  ['treasury write guard', '/api/treasury', { boardId: 'board-1', action: 'create_liquidity_snapshot' }],
  ['field write guard', '/api/field', { boardId: 'board-1', action: 'approve_time', entryId: 'fixture-not-used' }],
  ['commercial write guard', '/api/commercial', { boardId: 'board-1', action: 'approve_quote', quoteId: 'fixture-not-used' }],
  ['IT write guard', '/api/it', { boardId: 'board-1', action: 'approve_lifecycle_task', taskId: 'fixture-not-used' }],
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
