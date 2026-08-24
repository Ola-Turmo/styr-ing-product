const baseUrl = (process.env.STYR_SMOKE_BASE_URL || 'https://styr.ing').replace(/\/$/, '');
const checks = [
  ['health', '/api/health', 200],
  ['auth session', '/api/auth', 200],
  ['boards', '/api/boards', 200],
  ['event mesh summary', '/api/events?boardId=board-1&view=summary', 200],
  ['compliance summary', '/api/compliance?boardId=board-1&view=summary', 200],
  ['controls summary', '/api/controls?boardId=board-1&view=summary', 200],
  ['audit trail', '/api/audit?boardId=board-1', 200],
  ['SAF-T export', '/api/finance?boardId=board-1&view=saf-t', 200],
  ['private board guard', '/api/events?boardId=board-2&view=summary', 403],
];
const failures = [];
for (const [label, path, expected] of checks) {
  const response = await fetch(`${baseUrl}${path}`);
  if (response.status !== expected) failures.push(`${label}: expected ${expected}, got ${response.status}`);
  if (label === 'SAF-T export' && !((response.headers.get('content-type') || '').includes('application/xml'))) {
    failures.push(`${label}: expected application/xml content type`);
  }
}
for (const [label, path] of [
  ['event mesh write guard', '/api/events'],
  ['assistant write guard', '/api/assistant'],
  ['compliance write guard', '/api/compliance'],
]) {
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ boardId: 'board-1' }) });
  if (response.status !== 401) failures.push(`${label}: expected 401, got ${response.status}`);
}
const invalidLogin = await fetch(`${baseUrl}/api/auth`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'login', email: 'nobody@example.invalid', password: 'not-a-real-password' }) });
if (invalidLogin.status !== 401) failures.push(`invalid login guard: expected 401, got ${invalidLogin.status}`);
if (failures.length) {
  console.error(`LIVE API SMOKE: FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`LIVE API SMOKE: PASS (${checks.length + 3} checks against ${baseUrl})`);
