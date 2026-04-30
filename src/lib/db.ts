// ─── Cloudflare D1 Database Client ──────────────────────────────────────────
//
// Architecture: Cloudflare Pages (SSR) + Cloudflare D1 (SQLite)
// D1 is accessed via the `cloudflare:workers` runtime API.
// On Cloudflare Pages SSR, bind `DB` is available on env.DB.
//
// Runtime: pages/[...path].astro receives env.DB from Astro.locals.runtime.env
//
// D1 Setup (run once in CI or via `wrangler` CLI):
//   wrangler d1 create styr-ing-db --remote
//   wrangler d1 execute styr-ing-db --file=d1/schema.sql --remote
//
// Cloudflare credentials required:
//   - CLOUDFLARE_API_TOKEN     (GitHub Actions secret)
//   - CLOUDFLARE_ACCOUNT_ID    (GitHub Actions secret)

export interface Env {
  DB: D1Database;
}

// ─── D1 Query Helpers ───────────────────────────────────────────────────────

/**
 * Execute a SELECT query against D1. Returns typed rows or empty array on error.
 */
export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  env: Env,
  bindings?: unknown[]
): Promise<T[]> {
  try {
    const stmt = env.DB.prepare(sql);
    const result = bindings ? stmt.bind(...bindings).all() : stmt.all();
    return result.results as T[];
  } catch (err) {
    console.warn('[D1] Query failed:', err);
    return [];
  }
}

/**
 * Execute a write (INSERT/UPDATE/DELETE). Returns true on success.
 */
export async function d1Run(
  sql: string,
  env: Env,
  bindings?: unknown[]
): Promise<boolean> {
  try {
    const stmt = env.DB.prepare(sql);
    const result = bindings ? stmt.bind(...bindings).run() : stmt.run();
    return result.success;
  } catch (err) {
    console.warn('[D1] Write failed:', err);
    return false;
  }
}

/**
 * Get all active boards.
 */
export async function getBoards(env: Env): Promise<Board[]> {
  return d1Query<Board>(
    'SELECT * FROM boards WHERE status = ? ORDER BY created_at DESC',
    env,
    ['active']
  );
}

/**
 * Get a single board by ID.
 */
export async function getBoard(env: Env, boardId: string): Promise<Board | null> {
  const results = await d1Query<Board>('SELECT * FROM boards WHERE id = ?', env, [boardId]);
  return results[0] ?? null;
}

/**
 * Get members of a board.
 */
export async function getBoardMembers(env: Env, boardId: string): Promise<BoardMember[]> {
  return d1Query<BoardMember>(
    'SELECT * FROM board_members WHERE board_id = ? ORDER BY created_at ASC',
    env,
    [boardId]
  );
}

/**
 * Get meetings for a board.
 */
export async function getMeetings(env: Env, boardId: string): Promise<Meeting[]> {
  return d1Query<Meeting>(
    'SELECT * FROM meetings WHERE board_id = ? ORDER BY date DESC',
    env,
    [boardId]
  );
}

/**
 * Get a single meeting by ID.
 */
export async function getMeeting(env: Env, meetingId: string): Promise<Meeting | null> {
  const results = await d1Query<Meeting>('SELECT * FROM meetings WHERE id = ?', env, [meetingId]);
  return results[0] ?? null;
}

/**
 * Create a demo request (lead capture). Returns true on success.
 */
export async function createDemoRequest(
  env: Env,
  data: { name: string; email: string; company: string; board?: string; source?: string }
): Promise<boolean> {
  return d1Run(
    `INSERT INTO demo_requests (id, name, email, company, board, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
    env,
    [
      crypto.randomUUID(),
      data.name,
      data.email,
      data.company,
      data.board ?? null,
      data.source ?? 'board-portal-demo',
    ]
  );
}

// ─── Schema Types (mirror d1/schema.sql) ────────────────────────────────────

export interface Board {
  id: string;
  name: string;
  description: string | null;
  company_id: string | null;
  status: 'active' | 'inactive' | 'archived';
  settings: string;
  created_at: string;
  updated_at: string | null;
}

export interface BoardMember {
  id: string;
  board_id: string;
  name: string;
  email: string;
  role: 'leader' | 'deputy' | 'member' | 'observer' | 'secretary';
  since: string | null;
  until: string | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  board_id: string;
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  status: 'planned' | 'cancelled' | 'completed';
  document_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

// ─── Demo Data (shown when D1 binding is unavailable) ───────────────────────
// Pages render correctly without a live D1 database — demo data fills the UI.
// This enables the site to be deployed and demonstrated before the first pilot.

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
  { id: 'm1', name: 'Erik Nilsen',    role: 'Styreleder',   email: 'erik@pilotselskap.no',     boardId: 'board-1' },
  { id: 'm2', name: 'Ingrid Bakken',  role: 'Nestleder',    email: 'ingrid@pilotselskap.no',   boardId: 'board-1' },
  { id: 'm3', name: 'Lars Holm',      role: 'Styremedlem',  email: 'lars@pilotselskap.no',     boardId: 'board-1' },
  { id: 'm4', name: 'Sofia Andresen', role: 'Styremedlem',  email: 'sofia@pilotselskap.no',   boardId: 'board-1' },
  { id: 'm5', name: 'Mikkel Thorsen', role: 'Observatør',  email: 'mikkel@pilotselskap.no',   boardId: 'board-1' },
];

export const demoMeetings = [
  { id: 'mtg-1', title: 'Q1 Resultater',     date: '2026-05-15', boardId: 'board-1', status: 'upcoming',  documents: 4 },
  { id: 'mtg-2', title: 'Strategi 2027',       date: '2026-04-10', boardId: 'board-1', status: 'completed', documents: 7 },
  { id: 'mtg-3', title: 'Budgetgjennomgang',   date: '2026-03-05', boardId: 'board-1', status: 'completed', documents: 5 },
];

export const complianceEvents = [
  { id: 'ce-1', title: 'Årsberetning',                  deadline: '2026-02-28', authority: 'Brønnøysundregistrene',  type: 'annual',     status: 'done' },
  { id: 'ce-2', title: 'GDPR Personverngjennomgang',       deadline: '2026-03-31', authority: 'Datatilsynet',            type: 'privacy',    status: 'done' },
  { id: 'ce-3', title: 'Internkontrollrapportering',      deadline: '2026-06-30', authority: 'Finanstilsynet',          type: 'compliance', status: 'in_progress' },
  { id: 'ce-4', title: 'ESR-rapport (CSRD)',              deadline: '2026-07-31', authority: 'EU/Brønnøysund',          type: 'esg',        status: 'pending' },
  { id: 'ce-5', title: 'Halvårsregnskap',                 deadline: '2026-08-31', authority: 'Brønnøysundregistrene',  type: 'financial',  status: 'pending' },
];

export const controlItems = [
  { id: 'ctrl-1', title: 'Tilgangsstyring IT-systemer',    owner: 'IT-ansvarlig',   frequency: 'Kvartalsvis', status: 'green',  lastReview: '2026-01-15' },
  { id: 'ctrl-2', title: 'Økonomirutiner og attestasjon',  owner: 'CFO',            frequency: 'Månedlig',   status: 'green',  lastReview: '2026-02-01' },
  { id: 'ctrl-3', title: 'HMS-dokumentasjon',              owner: 'HMS-ansvarlig',  frequency: 'Halvårlig',  status: 'yellow', lastReview: '2025-11-20' },
  { id: 'ctrl-4', title: 'Styreinstruks og vedtekter',     owner: 'Styresekretær',  frequency: 'Årlig',      status: 'green',  lastReview: '2026-01-10' },
  { id: 'ctrl-5', title: 'Databehandleravtaler',           owner: 'Juridisk',       frequency: 'Ved behov',  status: 'red',    lastReview: '2025-06-15' },
];
