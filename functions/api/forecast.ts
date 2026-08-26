import { authorizeBoardRead, json, requireDb, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get('boardId') || '').trim();
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    const latest = await db.prepare('SELECT cash_minor,receivables_minor,payables_minor,payroll_due_minor,runway_months,as_of_date FROM liquidity_snapshots WHERE board_id=? ORDER BY as_of_date DESC LIMIT 1').bind(boardId).first<Record<string, number|string>>();
    const outstanding = await db.prepare("SELECT COALESCE(SUM(CASE WHEN reference LIKE 'sales_invoice:%' THEN (SELECT MAX(0,i.total_minor-i.paid_minor-COALESCE((SELECT SUM(cn.total_minor) FROM sales_credit_notes cn WHERE cn.sales_invoice_id=i.id AND cn.board_id=i.board_id AND cn.status='posted'),0)) FROM sales_invoices i WHERE i.id=substr(collection_cases.reference,15)) ELSE amount_minor END),0) amount_minor FROM collection_cases WHERE board_id=? AND status NOT IN ('paid','closed')").bind(boardId).first<Record<string, number>>();
    const cash = Number(latest?.cash_minor || 0), receivables = Number(latest?.receivables_minor || 0), payables = Number(latest?.payables_minor || 0), payroll = Number(latest?.payroll_due_minor || 0);
    const monthlyBurn = Math.max(1, Math.round((payables + payroll) / 3));
    const make = (label: string, collectionRate: number, expenseRate: number) => {
      let balance = cash;
      return { label, collectionRate, expenseRate, months: Array.from({ length: 12 }, (_, i) => { balance = Math.round(balance + receivables * collectionRate / 12 - monthlyBurn * expenseRate); return { month: i + 1, balanceMinor: balance }; }) };
    };
    return json({ boardId, source: 'manual_liquidity_snapshot', asOf: latest?.as_of_date || null, current: { cashMinor: cash, receivablesMinor: receivables, payablesMinor: payables, payrollDueMinor: payroll, runwayMonths: latest?.runway_months ?? null }, assumptions: { monthlyBurnMinor: monthlyBurn, openCollectionsMinor: Number(outstanding?.amount_minor || 0), requiresHumanReview: true }, scenarios: [make('Forsiktig', .35, 1.15), make('Basis', .65, 1), make('Sterk', .9, .9)] });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
