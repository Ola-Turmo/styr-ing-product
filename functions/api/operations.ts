import { authorizeBoardRead, json, requireDb, type Env } from './_lib';

type CountRow = { count?: number };
const count = (row: CountRow | null) => Number(row?.count || 0);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    const rows = await Promise.all([
      db.prepare("SELECT COUNT(*) count FROM people WHERE board_id=? AND employment_status='active'").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM candidates WHERE board_id=? AND stage NOT IN ('hired','rejected')").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM training_enrollments WHERE board_id=? AND status IN ('assigned','in_progress')").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM service_tickets WHERE board_id=? AND status NOT IN ('resolved','closed')").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM it_assets WHERE board_id=? AND status='active'").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM access_reviews WHERE board_id=? AND decision='pending'").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM vouchers v WHERE v.board_id=? AND v.status IN ('posted','approved') AND (SELECT COALESCE(SUM(debit_minor),0) FROM voucher_lines l WHERE l.voucher_id=v.id)=(SELECT COALESCE(SUM(credit_minor),0) FROM voucher_lines l WHERE l.voucher_id=v.id)").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM accounting_periods WHERE board_id=? AND status='locked'").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM ledger_accounts WHERE board_id=? AND active=1").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM crm_accounts WHERE board_id=? AND stage NOT IN ('won','lost')").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM quotes WHERE board_id=? AND status IN ('draft','review','pending_approval')").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM customer_cases WHERE board_id=? AND status NOT IN ('resolved','closed')").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM trip_logs WHERE board_id=? AND status='draft'").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM fleet_maintenance WHERE board_id=? AND status NOT IN ('complete','overdue')").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM time_entries WHERE board_id=? AND status IN ('submitted','approved')").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM api_events WHERE board_id=?").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM ai_drafts WHERE board_id=? AND status IN ('draft','review')").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM integration_registry WHERE board_id=? AND status='connected'").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM goals WHERE board_id=? AND status='at_risk'").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM service_tickets WHERE board_id=? AND priority IN ('critical','high') AND status NOT IN ('resolved','closed')").bind(boardId).first<CountRow>(),
      db.prepare("SELECT COUNT(*) count FROM customer_cases WHERE board_id=? AND priority IN ('critical','high') AND status NOT IN ('resolved','closed')").bind(boardId).first<CountRow>(),
    ]);
    const values = rows.map(count);
    const metrics = {
      people: [[values[0], 'aktive i demo-organisasjonen'], [values[1], 'aktive kandidatløp'], [values[2], 'tildelt eller påbegynt']],
      it: [[values[3], 'ikke løst eller lukket'], [values[4], 'registrert som aktive'], [values[5], 'krever vurdering']],
      finance: [[values[6], 'godkjent og balansert'], [values[7], 'med låsespor'], [values[8], 'aktive kontoer']],
      commercial: [[values[9], 'aktive kundeløp'], [values[10], 'utkast eller til godkjenning'], [values[11], 'ikke løst eller lukket']],
      field: [[values[12], 'må klassifiseres'], [values[13], 'vedlikeholdsoppgaver åpne'], [values[14], 'innsendte eller godkjente føringer']],
      platform: [[values[15], 'hendelser lagret'], [values[17], 'integrasjoner koblet'], [values[16], 'utkast krever gjennomgang']],
    };
    return json({ boardId, source: 'd1', generatedAt: new Date().toISOString(), attentionCount: values[18] + values[19] + values[20] + values[5] + values[12] + values[13], metrics });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
