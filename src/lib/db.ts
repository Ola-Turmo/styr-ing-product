// SurrealDB Cloud connection via REST API
// Credentials sourced from environment variables (never commit secrets)

function env(key: string, fallback: string): string {
  return (import.meta.env as Record<string, string | undefined>)[key] ?? fallback;
}

const SURREALDB_URL    = env('SURREALDB_URL',    'https://surreal-shadow-06ek4uedppsrt6cr5g20pkee5s.aws-euw1.surreal.cloud');
const SURREALDB_NS     = env('SURREALDB_NS',     'main');
const SURREALDB_DB     = env('SURREALDB_DB',     'main');
const SURREALDB_USER   = env('SURREALDB_USER',  'codex_ingest');
const SURREALDB_PASS   = env('SURREALDB_PASS',  ''); // MUST be set in env
const SURREALDB_AUTH_NS = env('SURREALDB_AUTH_NS', SURREALDB_NS);
const SURREALDB_AUTH_DB = env('SURREALDB_AUTH_DB', SURREALDB_DB);

let authToken: string | null = null;

export async function surrealSignin(): Promise<string | null> {
  if (!SURREALDB_PASS) return null;
  try {
    const res = await fetch(`${SURREALDB_URL}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        NS: SURREALDB_AUTH_NS,
        DB: SURREALDB_AUTH_DB,
        user: SURREALDB_USER,
        pass: SURREALDB_PASS,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token ?? null;
  } catch {
    return null;
  }
}

export async function surrealQuery<T = unknown>(sql: string): Promise<T[]> {
  if (!authToken) {
    authToken = await surrealSignin();
  }
  if (!authToken) return [];
  try {
    const res = await fetch(`${SURREALDB_URL}/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'NS': SURREALDB_NS,
        'DB': SURREALDB_DB,
      },
      body: JSON.stringify(sql),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data[0]?.result) return data[0].result as T[];
    return [];
  } catch {
    return [];
  }
}

// ─── Demo data (shown when DB is unavailable) ───────────────────────────────

export const demoBoards = [
  {
    id: 'board-1',
    name: 'Styret 2026',
    description: 'Hovedstyret for pilotkunde AS',
    memberCount: 5,
    nextMeeting: '2026-05-15',
    status: 'active',
  },
  {
    id: 'board-2',
    name: 'Audit Committee',
    description: 'Revisjonsutvalg',
    memberCount: 3,
    nextMeeting: '2026-06-01',
    status: 'active',
  },
];

export const demoMembers = [
  { id: 'm1', name: 'Erik Nilsen',  role: 'Styreleder',    email: 'erik@pilotselskap.no',    boardId: 'board-1' },
  { id: 'm2', name: 'Ingrid Bakken',role: 'Nestleder',     email: 'ingrid@pilotselskap.no',   boardId: 'board-1' },
  { id: 'm3', name: 'Lars Holm',    role: 'Styremedlem',   email: 'lars@pilotselskap.no',     boardId: 'board-1' },
  { id: 'm4', name: 'Sofia Andresen',role: 'Styremedlem',   email: 'sofia@pilotselskap.no',   boardId: 'board-1' },
  { id: 'm5', name: 'Mikkel Thorsen',role: 'Observatør',   email: 'mikkel@pilotselskap.no',   boardId: 'board-1' },
];

export const demoMeetings = [
  { id: 'mtg-1', title: 'Q1 Resultater',       date: '2026-05-15', boardId: 'board-1', status: 'upcoming',  documents: 4 },
  { id: 'mtg-2', title: 'Strategi 2027',        date: '2026-04-10', boardId: 'board-1', status: 'completed', documents: 7 },
  { id: 'mtg-3', title: 'Budgetgjennomgang',    date: '2026-03-05', boardId: 'board-1', status: 'completed', documents: 5 },
];

export const complianceEvents = [
  { id: 'ce-1', title: 'Årsberetning',                     deadline: '2026-02-28', authority: 'Brønnøysundregistrene',  type: 'annual',    status: 'done' },
  { id: 'ce-2', title: 'GDPR Personverngjennomgang',          deadline: '2026-03-31', authority: 'Datatilsynet',            type: 'privacy',   status: 'done' },
  { id: 'ce-3', title: 'Internkontrollrapportering',         deadline: '2026-06-30', authority: 'Finanstilsynet',          type: 'compliance',status: 'in_progress' },
  { id: 'ce-4', title: 'ESR-rapport (CSRD)',                 deadline: '2026-07-31', authority: 'EU/Brønnøysund',          type: 'esg',       status: 'pending' },
  { id: 'ce-5', title: 'Halvårsregnskap',                    deadline: '2026-08-31', authority: 'Brønnøysundregistrene',  type: 'financial', status: 'pending' },
];

export const controlItems = [
  { id: 'ctrl-1', title: 'Tilgangsstyring IT-systemer',      owner: 'IT-ansvarlig',      frequency: 'Kvartalsvis', status: 'green',  lastReview: '2026-01-15' },
  { id: 'ctrl-2', title: 'Økonomirutiner og attestasjon',     owner: 'CFO',                frequency: 'Månedlig',   status: 'green',  lastReview: '2026-02-01' },
  { id: 'ctrl-3', title: 'HMS-dokumentasjon',                 owner: 'HMS-ansvarlig',      frequency: 'Halvårlig',  status: 'yellow', lastReview: '2025-11-20' },
  { id: 'ctrl-4', title: 'Styreinstruks og vedtekter',        owner: 'Styresekretær',      frequency: 'Årlig',      status: 'green',  lastReview: '2026-01-10' },
  { id: 'ctrl-5', title: 'Databehandleravtaler',              owner: 'Juridisk',           frequency: 'Ved behov',   status: 'red',    lastReview: '2025-06-15' },
];
