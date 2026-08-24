const baseUrl = (process.env.STYR_SMOKE_BASE_URL || 'https://styr.ing').replace(/\/$/, '');
const checks = [
  ['health', '/api/health', 200], ['auth session', '/api/auth', 200],
  ['legal status', '/api/legal?boardId=board-1', 200], ['billing status', '/api/billing?boardId=board-1', 200],
  ['privacy center', '/api/privacy?boardId=board-1', 200], ['membership guard', '/api/members?boardId=board-1', 401],
  ['invite activation page', '/activate/', 200], ['customer workspace shell', '/app/', 200], ['tenant workspace shell', '/app/arbeidsflate/', 200], ['boards', '/api/boards', 200],
  ['event mesh summary', '/api/events?boardId=board-1&view=summary', 200],
  ['compliance summary', '/api/compliance?boardId=board-1&view=summary', 200],
  ['controls summary', '/api/controls?boardId=board-1&view=summary', 200],
  ['audit trail', '/api/audit?boardId=board-1', 200], ['SAF-T export', '/api/finance?boardId=board-1&view=saf-t', 200],
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
  ['risk write guard', '/api/risk', { boardId: 'board-1', action: 'update_risk', riskId: 'fixture-not-used', status: 'monitoring' }],
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
