import { authorizeBoardRead, authorizeBoardWrite, body, id, json, recordAudit, requireDb, type Env } from './_lib';

const views = new Set(['summary', 'assets', 'depreciation']);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const validIsoDate = (value: string) => {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};
const minor = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);

async function activeAccountsExist(db: D1Database, boardId: string, accountIds: string[]) {
  const unique = [...new Set(accountIds.filter(Boolean))];
  if (!unique.length) return false;
  const placeholders = unique.map(() => '?').join(',');
  const rows = (await db.prepare(`SELECT id FROM ledger_accounts WHERE board_id=? AND active=1 AND id IN (${placeholders})`).bind(boardId, ...unique).all()).results;
  return rows.length === unique.length;
}

async function postDepreciationVoucher(db: D1Database, input: { boardId: string; entryId: string; expenseAccountId: string; accumulatedAccountId: string; actor: string }) {
  const entry = await db.prepare(`SELECT d.*,a.asset_number,a.name FROM depreciation_entries d JOIN fixed_assets a ON a.id=d.asset_id
    WHERE d.id=? AND d.board_id=? AND d.ledger_type='financial' AND d.status='approved'`).bind(input.entryId, input.boardId).first<Record<string, unknown>>();
  if (!entry) return { error: 'financial_depreciation_not_approved_or_found' } as const;
  const amount = Number(entry.amount_minor || 0); const period = text(entry.period, 20); const voucherDate = `${period}-28`;
  if (!periodPattern.test(period) || !Number.isSafeInteger(amount) || amount <= 0) return { error: 'depreciation_entry_invalid' } as const;
  if (await db.prepare("SELECT 1 FROM accounting_periods WHERE board_id=? AND period=? AND status='locked'").bind(input.boardId, period).first()) return { error: 'period_locked', period } as const;
  if (!(await activeAccountsExist(db, input.boardId, [input.expenseAccountId, input.accumulatedAccountId])) || input.expenseAccountId === input.accumulatedAccountId) return { error: 'posting_accounts_invalid' } as const;
  const existing = await db.prepare("SELECT id,voucher_number FROM vouchers WHERE board_id=? AND external_reference=? AND status='posted'").bind(input.boardId, `depreciation:${input.entryId}`).first<Record<string, unknown>>();
  if (existing) return { error: 'depreciation_already_posted', voucherId: existing.id, voucherNumber: existing.voucher_number } as const;
  const voucherId = id('voucher'); const description = `Avskrivning ${text(entry.asset_number, 80)} · ${text(entry.name, 120)}`;
  await db.batch([
    db.prepare('INSERT INTO voucher_sequences (board_id,next_number) SELECT ?,COALESCE(MAX(voucher_number),0)+1 FROM vouchers WHERE board_id=? ON CONFLICT(board_id) DO NOTHING').bind(input.boardId, input.boardId),
    db.prepare("UPDATE voucher_sequences SET next_number=next_number+1,updated_at=datetime('now') WHERE board_id=?").bind(input.boardId),
    db.prepare('INSERT INTO vouchers (id,board_id,voucher_number,voucher_date,period,description,source,status,external_reference,created_by) SELECT ?,?,next_number-1,?,?,?,?,?,?,? FROM voucher_sequences WHERE board_id=?').bind(voucherId, input.boardId, voucherDate, period, description, 'fixed_asset_depreciation', 'posted', `depreciation:${input.entryId}`, input.actor, input.boardId),
    db.prepare('INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,NULL)').bind(id('line'), voucherId, input.expenseAccountId, description, amount, 0),
    db.prepare('INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,NULL)').bind(id('line'), voucherId, input.accumulatedAccountId, description, 0, amount),
    db.prepare("UPDATE depreciation_entries SET status='posted' WHERE id=? AND board_id=? AND status='approved'").bind(input.entryId, input.boardId),
  ]);
  const created = await db.prepare('SELECT voucher_number FROM vouchers WHERE id=? AND board_id=?').bind(voucherId, input.boardId).first<{ voucher_number: number }>();
  return created ? { voucherId, voucherNumber: Number(created.voucher_number), period, amountMinor: amount } : { error: 'voucher_created_without_number' } as const;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url); const boardId = text(url.searchParams.get('boardId'), 100); const view = url.searchParams.get('view') || 'summary';
  if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
  if (!views.has(view)) return json({ error: 'unknown_view', allowed: [...views] }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId))) return json({ error: 'board_access_denied' }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === 'assets') return json({ boardId, view, data: (await db.prepare(`SELECT a.*,
      COALESCE(SUM(CASE WHEN d.ledger_type='financial' AND d.status IN ('approved','posted') THEN d.amount_minor ELSE 0 END),0) financial_accumulated_minor,
      COALESCE(SUM(CASE WHEN d.ledger_type='tax' AND d.status IN ('approved','posted') THEN d.amount_minor ELSE 0 END),0) tax_accumulated_minor
      FROM fixed_assets a LEFT JOIN depreciation_entries d ON d.asset_id=a.id WHERE a.board_id=? GROUP BY a.id ORDER BY a.asset_number`).bind(boardId).all()).results });
    if (view === 'depreciation') return json({ boardId, view, data: (await db.prepare(`SELECT d.*,a.asset_number,a.name FROM depreciation_entries d JOIN fixed_assets a ON a.id=d.asset_id WHERE d.board_id=? ORDER BY d.period DESC,a.asset_number,d.ledger_type`).bind(boardId).all()).results });
    const [assets, cost, depreciation, review, approved] = await Promise.all([
      db.prepare("SELECT COUNT(*) count FROM fixed_assets WHERE board_id=? AND status='active'").bind(boardId).first(),
      db.prepare("SELECT COALESCE(SUM(acquisition_cost_minor),0) amount_minor FROM fixed_assets WHERE board_id=? AND status='active'").bind(boardId).first(),
      db.prepare("SELECT COALESCE(SUM(amount_minor),0) amount_minor FROM depreciation_entries WHERE board_id=? AND ledger_type='financial' AND status IN ('approved','posted')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM depreciation_entries WHERE board_id=? AND status IN ('calculated','review')").bind(boardId).first(),
      db.prepare("SELECT COUNT(*) count FROM depreciation_entries WHERE board_id=? AND ledger_type='financial' AND status='approved'").bind(boardId).first(),
    ]);
    return json({ boardId, view, data: { assets, cost, depreciation, review, approved } });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request); const boardId = text(value?.boardId, 100); const action = text(value?.action, 80); const db = requireDb(env);
    if (!boardId || !action) return json({ error: 'boardId_and_action_required' }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId); if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 }); const actor = authorization.userId || 'service';
    if (action === 'create_asset') {
      const assetNumber = text(value?.assetNumber, 80); const name = text(value?.name); const category = text(value?.category, 100); const acquisitionDate = text(value?.acquisitionDate, 20); const cost = minor(value?.acquisitionCostMinor); const residual = minor(value?.residualValueMinor ?? 0); const life = Number(value?.usefulLifeMonths); const method = ['linear', 'declining_balance', 'none'].includes(text(value?.financialMethod, 30)) ? text(value?.financialMethod, 30) : ''; const taxGroup = text(value?.taxGroup, 10); const taxRate = Number(value?.taxRatePercent ?? 0);
      if (!assetNumber || !name || !category || !validIsoDate(acquisitionDate) || cost === null || cost <= 0 || residual === null || residual > cost || !Number.isInteger(life) || life < 1 || life > 1200 || !method || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return json({ error: 'asset_fields_invalid' }, { status: 400 });
      if (await db.prepare('SELECT id FROM fixed_assets WHERE board_id=? AND asset_number=?').bind(boardId, assetNumber).first()) return json({ error: 'asset_number_exists' }, { status: 409 });
      const assetId = id('fixed'); await db.prepare('INSERT INTO fixed_assets (id,board_id,asset_number,name,category,acquisition_date,acquisition_cost_minor,residual_value_minor,currency,financial_method,useful_life_months,tax_group,tax_rate_percent,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(assetId, boardId, assetNumber, name, category, acquisitionDate, cost, residual, text(value?.currency, 3) || 'NOK', method, life, taxGroup || null, taxRate || null, 'active').run();
      await recordAudit(db, { boardId, action: 'fixed_asset_created', entityType: 'fixed_asset', entityId: assetId, userId: authorization.userId || undefined, details: { assetNumber, costMinor: cost, financialMethod: method, taxGroup: taxGroup || null } });
      return json({ ok: true, action, assetId, status: 'active', depreciation: 'not_calculated' }, { status: 201 });
    }
    if (action === 'calculate_depreciation') {
      const assetId = text(value?.assetId, 120); const period = text(value?.period, 20); if (!assetId || !periodPattern.test(period)) return json({ error: 'depreciation_fields_invalid' }, { status: 400 });
      if (await db.prepare("SELECT 1 FROM accounting_periods WHERE board_id=? AND period=? AND status='locked'").bind(boardId, period).first()) return json({ error: 'period_locked', period }, { status: 409 });
      const asset = await db.prepare("SELECT acquisition_date,acquisition_cost_minor,residual_value_minor,useful_life_months,financial_method,tax_rate_percent FROM fixed_assets WHERE id=? AND board_id=? AND status='active'").bind(assetId, boardId).first<Record<string, unknown>>(); if (!asset) return json({ error: 'asset_not_found' }, { status: 404 });
      if (period < text(asset.acquisition_date, 20).slice(0, 7)) return json({ error: 'period_before_acquisition' }, { status: 400 });
      const protectedEntries = Number((await db.prepare("SELECT COUNT(*) count FROM depreciation_entries WHERE asset_id=? AND board_id=? AND period=? AND status IN ('approved','posted')").bind(assetId, boardId, period).first<{ count: number }>())?.count || 0); if (protectedEntries) return json({ error: 'depreciation_period_already_approved_or_posted' }, { status: 409 });
      const pendingEarlier = Number((await db.prepare("SELECT COUNT(*) count FROM depreciation_entries WHERE asset_id=? AND board_id=? AND period<? AND status IN ('calculated','review')").bind(assetId, boardId, period).first<{ count: number }>())?.count || 0); if (pendingEarlier) return json({ error: 'depreciation_previous_period_pending' }, { status: 409 });
      const laterEntries = Number((await db.prepare('SELECT COUNT(*) count FROM depreciation_entries WHERE asset_id=? AND board_id=? AND period>?').bind(assetId, boardId, period).first<{ count: number }>())?.count || 0); if (laterEntries) return json({ error: 'depreciation_later_period_exists' }, { status: 409 });
      const previous = (await db.prepare("SELECT ledger_type,COALESCE(SUM(amount_minor),0) accumulated_minor FROM depreciation_entries WHERE asset_id=? AND board_id=? AND period<? AND status IN ('approved','posted') GROUP BY ledger_type").bind(assetId, boardId, period).all()).results as Record<string, unknown>[];
      const accumulated = Object.fromEntries(previous.map((row) => [String(row.ledger_type), Number(row.accumulated_minor || 0)])); const cost = Number(asset.acquisition_cost_minor || 0); const residual = Number(asset.residual_value_minor || 0); const life = Number(asset.useful_life_months || 0); const financialBase = Math.max(0, cost - residual - Number(accumulated.financial || 0)); const financial = asset.financial_method === 'linear' ? Math.min(Math.round((cost - residual) / life), financialBase) : asset.financial_method === 'declining_balance' ? Math.min(Math.round((cost - Number(accumulated.financial || 0)) * 2 / life), financialBase) : 0; const taxBase = Math.max(0, cost - Number(accumulated.tax || 0)); const tax = Math.min(Math.round(taxBase * Number(asset.tax_rate_percent || 0) / 100 / 12), taxBase);
      const entries = [{ ledger: 'financial', amount: financial, accumulated: Number(accumulated.financial || 0) + financial, value: cost - Number(accumulated.financial || 0) - financial }, { ledger: 'tax', amount: tax, accumulated: Number(accumulated.tax || 0) + tax, value: cost - Number(accumulated.tax || 0) - tax }];
      for (const entry of entries) await db.prepare("INSERT INTO depreciation_entries (id,board_id,asset_id,period,ledger_type,amount_minor,accumulated_minor,book_value_minor,status) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(asset_id,period,ledger_type) DO UPDATE SET amount_minor=excluded.amount_minor,accumulated_minor=excluded.accumulated_minor,book_value_minor=excluded.book_value_minor,status='calculated',approved_by=NULL,approved_at=NULL").bind(id('dep'), boardId, assetId, period, entry.ledger, entry.amount, entry.accumulated, entry.value, 'calculated').run();
      await recordAudit(db, { boardId, action: 'depreciation_calculated', entityType: 'fixed_asset', entityId: assetId, userId: authorization.userId || undefined, details: { period, financialMinor: financial, taxMinor: tax, financialAccumulatedMinor: entries[0].accumulated, taxAccumulatedMinor: entries[1].accumulated, requiresHumanReview: true } });
      return json({ ok: true, action, assetId, period, status: 'calculated', entries, requiresHumanReview: true }, { status: 201 });
    }
    if (action === 'approve_depreciation') {
      const entryId = text(value?.entryId, 120); if (!entryId) return json({ error: 'entryId_required' }, { status: 400 }); const result = await db.prepare("UPDATE depreciation_entries SET status='approved',approved_by=?,approved_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('calculated','review')").bind(actor, entryId, boardId).run(); if (!result.meta?.changes) return json({ error: 'entry_not_pending_or_found' }, { status: 409 });
      const entry = await db.prepare('SELECT ledger_type FROM depreciation_entries WHERE id=? AND board_id=?').bind(entryId, boardId).first<{ ledger_type: string }>(); await recordAudit(db, { boardId, action: 'depreciation_approved', entityType: 'depreciation_entry', entityId: entryId, userId: authorization.userId || undefined, details: { ledgerType: entry?.ledger_type, ledgerPosting: entry?.ledger_type === 'financial' ? 'ready_for_controlled_posting' : 'tax_ledger_only' } });
      return json({ ok: true, action, entryId, status: 'approved', ledgerType: entry?.ledger_type, ledgerPosting: entry?.ledger_type === 'financial' ? 'ready_for_controlled_posting' : 'tax_ledger_only' });
    }
    if (action === 'post_depreciation') {
      const entryId = text(value?.entryId, 120); const expenseAccountId = text(value?.expenseAccountId, 120); const accumulatedAccountId = text(value?.accumulatedAccountId, 120); if (!entryId || !expenseAccountId || !accumulatedAccountId) return json({ error: 'entry_and_posting_accounts_required' }, { status: 400 });
      const posted = await postDepreciationVoucher(db, { boardId, entryId, expenseAccountId, accumulatedAccountId, actor }); if ('error' in posted) return json(posted, { status: posted.error === 'period_locked' ? 409 : posted.error === 'depreciation_already_posted' ? 409 : 400 });
      await recordAudit(db, { boardId, action: 'depreciation_posted', entityType: 'depreciation_entry', entityId: entryId, userId: authorization.userId || undefined, details: posted }); return json({ ok: true, action, entryId, status: 'posted', ...posted }, { status: 201 });
    }
    return json({ error: 'unknown_action', allowed: ['create_asset', 'calculate_depreciation', 'approve_depreciation', 'post_depreciation'] }, { status: 400 });
  } catch (error) { return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 }); }
};
