import {
  authorizeBoardRead,
  authorizeBoardWrite,
  body,
  id,
  json,
  recordAudit,
  requireDb,
  sha256,
  type Env,
} from "./_lib";

const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validIsoDate = (value: string) => {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};
const asMinor = (value: unknown) =>
  Number.isSafeInteger(Number(value)) && Number(value) >= 0
    ? Number(value)
    : null;

const validNorwegianMod11 = (value: string, weights: number[]) => {
  if (!/^\d+$/.test(value) || value.length !== weights.length + 1) return false;
  const sum = weights.reduce(
    (total, weight, index) => total + Number(value[index]) * weight,
    0,
  );
  const remainder = 11 - (sum % 11);
  if (remainder === 10) return false;
  const checkDigit = remainder === 11 ? 0 : remainder;
  return checkDigit === Number(value.at(-1));
};

const validOrgNumber = (value: string) =>
  validNorwegianMod11(value, [3, 2, 7, 6, 5, 4, 3, 2]);

const validBankAccount = (value: string) =>
  validNorwegianMod11(value, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);

function nextRecurringDate(value: string, interval: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (interval === "month") date.setUTCMonth(date.getUTCMonth() + 1);
  else if (interval === "quarter") date.setUTCMonth(date.getUTCMonth() + 3);
  else if (interval === "year") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else return null;
  return date.toISOString().slice(0, 10);
}

async function buildSafT(
  db: D1Database,
  boardId: string,
  from: string,
  to: string,
) {
  const accounts = (
    await db
      .prepare(
        "SELECT code,name,account_type,vat_code FROM ledger_accounts WHERE board_id = ? ORDER BY code",
      )
      .bind(boardId)
      .all()
  ).results as Record<string, unknown>[];
  const lines = (
    await db
      .prepare(
        `SELECT v.id AS voucher_id,v.voucher_number,v.voucher_date,v.period,v.description,l.id AS line_id,l.debit_minor,l.credit_minor,l.vat_code,a.code,a.name
    FROM vouchers v JOIN voucher_lines l ON l.voucher_id=v.id JOIN ledger_accounts a ON a.id=l.account_id
    WHERE v.board_id=? AND v.status='posted' AND v.period BETWEEN ? AND ? ORDER BY v.voucher_number,l.id`,
      )
      .bind(boardId, from, to)
      .all()
  ).results as Record<string, unknown>[];
  const esc = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  const amount = (value: unknown) => (Number(value || 0) / 100).toFixed(2);
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const line of lines) {
    const key = String(line.voucher_id);
    const existing = grouped.get(key) || [];
    existing.push(line);
    grouped.set(key, existing);
  }
  const transactions = [...grouped.values()]
    .map((voucherLines) => {
      const first = voucherLines[0];
      return `<Transaction><TransactionID>${esc(first.voucher_number)}</TransactionID><TransactionDate>${esc(first.voucher_date)}</TransactionDate><Description>${esc(first.description)}</Description>${voucherLines.map((line) => `<Line><RecordID>${esc(line.line_id)}</RecordID><AccountID>${esc(line.code)}</AccountID><AccountDescription>${esc(line.name)}</AccountDescription><DebitAmount>${amount(line.debit_minor)}</DebitAmount><CreditAmount>${amount(line.credit_minor)}</CreditAmount>${line.vat_code ? `<TaxCode>${esc(line.vat_code)}</TaxCode>` : ""}</Line>`).join("")}</Transaction>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:NO"><Header><FileVersion>1.3</FileVersion><AuditFileVersion>1.0</AuditFileVersion><PeriodStart>${esc(from)}</PeriodStart><PeriodEnd>${esc(to)}</PeriodEnd><CurrencyCode>NOK</CurrencyCode><SelectionCriteria>${esc(`${from}:${to}`)}</SelectionCriteria></Header><MasterFiles><GeneralLedgerAccounts>${accounts.map((a) => `<Account><AccountID>${esc(a.code)}</AccountID><AccountDescription>${esc(a.name)}</AccountDescription><AccountType>${esc(a.account_type)}</AccountType>${a.vat_code ? `<TaxCode>${esc(a.vat_code)}</TaxCode>` : ""}</Account>`).join("")}</GeneralLedgerAccounts></MasterFiles><GeneralLedgerEntries><Journal><JournalID>GENERAL</JournalID>${transactions}</Journal></GeneralLedgerEntries></AuditFile>`;
  return { xml, checksum: await sha256(xml), rowCount: lines.length };
}

async function buildAccountingReport(
  db: D1Database,
  boardId: string,
  view: string,
  from: string,
  to: string,
) {
  type AccountingReportRow = Record<string, unknown> & {
    account_type?: string;
    openingBalanceMinor: number;
    debitMinor: number;
    creditMinor: number;
    periodBalanceMinor: number;
    closingBalanceMinor: number;
    cumulative_debit_minor?: number;
    cumulative_credit_minor?: number;
  };
  const rows = (
    await db
      .prepare(
        `SELECT a.id,a.code,a.name,a.account_type,
    COALESCE(SUM(CASE WHEN v.period<? THEN l.debit_minor ELSE 0 END),0) AS opening_debit_minor,
    COALESCE(SUM(CASE WHEN v.period<? THEN l.credit_minor ELSE 0 END),0) AS opening_credit_minor,
    COALESCE(SUM(CASE WHEN v.period BETWEEN ? AND ? THEN l.debit_minor ELSE 0 END),0) AS debit_minor,
    COALESCE(SUM(CASE WHEN v.period BETWEEN ? AND ? THEN l.credit_minor ELSE 0 END),0) AS credit_minor,
    COALESCE(SUM(CASE WHEN v.period<=? THEN l.debit_minor ELSE 0 END),0) AS cumulative_debit_minor,
    COALESCE(SUM(CASE WHEN v.period<=? THEN l.credit_minor ELSE 0 END),0) AS cumulative_credit_minor
    FROM ledger_accounts a LEFT JOIN voucher_lines l ON l.account_id=a.id LEFT JOIN vouchers v ON v.id=l.voucher_id AND v.board_id=a.board_id AND v.status='posted'
    WHERE a.board_id=? AND a.active=1 GROUP BY a.id ORDER BY a.code`,
      )
      .bind(from, from, from, to, from, to, to, to, boardId)
      .all()
  ).results as Record<string, unknown>[];
  const normalized: AccountingReportRow[] = rows.map((row) => {
    const debit = Number(row.debit_minor || 0);
    const credit = Number(row.credit_minor || 0);
    const cumulativeDebit = Number(row.cumulative_debit_minor || 0);
    const cumulativeCredit = Number(row.cumulative_credit_minor || 0);
    const naturalCredit = ["liability", "equity", "revenue"].includes(
      String(row.account_type),
    );
    return {
      ...row,
      account_type: String(row.account_type || ""),
      openingBalanceMinor:
        Number(row.opening_debit_minor || 0) -
        Number(row.opening_credit_minor || 0),
      debitMinor: debit,
      creditMinor: credit,
      periodBalanceMinor: naturalCredit ? credit - debit : debit - credit,
      closingBalanceMinor: naturalCredit
        ? cumulativeCredit - cumulativeDebit
        : cumulativeDebit - cumulativeCredit,
    };
  });
  if (view === "trial-balance") {
    const data = normalized.filter(
      (row) =>
        row.openingBalanceMinor ||
        row.debitMinor ||
        row.creditMinor ||
        row.closingBalanceMinor,
    );
    const totals = data.reduce(
      (sum, row) => ({
        debitMinor: sum.debitMinor + row.debitMinor,
        creditMinor: sum.creditMinor + row.creditMinor,
        rawClosingMinor:
          sum.rawClosingMinor +
          Number(row.cumulative_debit_minor || 0) -
          Number(row.cumulative_credit_minor || 0),
      }),
      { debitMinor: 0, creditMinor: 0, rawClosingMinor: 0 },
    );
    return {
      rows: data,
      totals: {
        ...totals,
        balanced:
          totals.debitMinor === totals.creditMinor &&
          totals.rawClosingMinor === 0,
      },
    };
  }
  if (view === "profit-loss") {
    const data = normalized.filter(
      (row) =>
        ["revenue", "expense"].includes(String(row.account_type)) &&
        (row.debitMinor || row.creditMinor),
    );
    const revenueMinor = data
      .filter((row) => row.account_type === "revenue")
      .reduce((sum, row) => sum + row.periodBalanceMinor, 0);
    const expenseMinor = data
      .filter((row) => row.account_type === "expense")
      .reduce((sum, row) => sum + row.periodBalanceMinor, 0);
    return {
      rows: data,
      totals: {
        revenueMinor,
        expenseMinor,
        resultMinor: revenueMinor - expenseMinor,
      },
    };
  }
  if (view === "balance-sheet") {
    const data = normalized.filter(
      (row) =>
        ["asset", "liability", "equity"].includes(String(row.account_type)) &&
        row.closingBalanceMinor,
    );
    const assetMinor = data
      .filter((row) => row.account_type === "asset")
      .reduce((sum, row) => sum + row.closingBalanceMinor, 0);
    const liabilityMinor = data
      .filter((row) => row.account_type === "liability")
      .reduce((sum, row) => sum + row.closingBalanceMinor, 0);
    const equityMinor = data
      .filter((row) => row.account_type === "equity")
      .reduce((sum, row) => sum + row.closingBalanceMinor, 0);
    const revenueMinor = normalized
      .filter((row) => row.account_type === "revenue")
      .reduce((sum, row) => sum + row.closingBalanceMinor, 0);
    const expenseMinor = normalized
      .filter((row) => row.account_type === "expense")
      .reduce((sum, row) => sum + row.closingBalanceMinor, 0);
    const currentResultMinor = revenueMinor - expenseMinor;
    return {
      rows: data,
      totals: {
        assetMinor,
        liabilityMinor,
        equityMinor,
        currentResultMinor,
        liabilitiesAndEquityMinor:
          liabilityMinor + equityMinor + currentResultMinor,
        differenceMinor:
          assetMinor - liabilityMinor - equityMinor - currentResultMinor,
      },
    };
  }
  const ledgerRows = (
    await db
      .prepare(
        `SELECT v.voucher_number,v.voucher_date,v.period,v.description AS voucher_description,v.source,v.external_reference,a.code,a.name,a.account_type,l.description,l.debit_minor,l.credit_minor,l.vat_code
    FROM vouchers v JOIN voucher_lines l ON l.voucher_id=v.id JOIN ledger_accounts a ON a.id=l.account_id WHERE v.board_id=? AND v.status='posted' AND v.period BETWEEN ? AND ? ORDER BY a.code,v.voucher_date,v.voucher_number,l.id`,
      )
      .bind(boardId, from, to)
      .all()
  ).results;
  return { rows: ledgerRows, totals: { rowCount: ledgerRows.length } };
}

async function boardData(
  env: Env,
  boardId: string,
  view: string,
  invoiceId = "",
) {
  const db = requireDb(env);
  if (view === "accounts")
    return (
      await db
        .prepare(
          "SELECT id,code,name,account_type,vat_code,active FROM ledger_accounts WHERE board_id = ? ORDER BY code",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "customers")
    return (
      await db
        .prepare(
          "SELECT id,company_name,org_number,stage,currency FROM crm_accounts WHERE board_id=? AND stage NOT IN ('lost') ORDER BY company_name",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "invoice-setup") {
    const [seller, customers] = await Promise.all([
      db
        .prepare(
          "SELECT p.*,b.name board_name,b.org_number board_org_number FROM boards b LEFT JOIN accounting_profiles p ON p.board_id=b.id WHERE b.id=?",
        )
        .bind(boardId)
        .first(),
      db
        .prepare(
          "SELECT a.id,a.company_name,COALESCE(p.org_number,a.org_number) org_number,COALESCE(p.customer_type,'business') customer_type,p.address_line1,p.postal_code,p.city,p.country_code,p.email FROM crm_accounts a LEFT JOIN customer_invoice_profiles p ON p.board_id=a.board_id AND p.account_id=a.id WHERE a.board_id=? AND a.stage NOT IN ('lost') ORDER BY a.company_name",
        )
        .bind(boardId)
        .all(),
    ]);
    return { seller, customers: customers.results };
  }
  if (view === "periods")
    return (
      await db
        .prepare(
          "SELECT id,period,status,locked_by,locked_at,seal_checksum FROM accounting_periods WHERE board_id = ? ORDER BY period DESC",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "period-closures")
    return (
      await db
        .prepare(
          "SELECT * FROM accounting_period_closures WHERE board_id=? ORDER BY period DESC",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "saf-t-exports")
    return (
      await db
        .prepare(
          "SELECT id,period_from,period_to,status,row_count,checksum,created_by,created_at FROM saf_t_exports WHERE board_id=? ORDER BY created_at DESC LIMIT 50",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "intercompany")
    return (
      await db
        .prepare(
          "SELECT * FROM intercompany_postings WHERE board_id=? ORDER BY period DESC,created_at DESC",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "invoices")
    return (
      await db
        .prepare(
          "SELECT i.*,a.company_name,(SELECT COUNT(*) FROM sales_invoice_lines il WHERE il.sales_invoice_id=i.id AND il.board_id=i.board_id) line_count,COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=i.id AND c.board_id=i.board_id AND c.status='posted'),0) credited_minor,COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=i.id AND c.board_id=i.board_id AND c.status NOT IN ('cancelled')),0) reserved_credit_minor FROM sales_invoices i LEFT JOIN crm_accounts a ON a.id=i.account_id WHERE i.board_id=? ORDER BY CASE i.status WHEN 'overdue' THEN 1 WHEN 'review' THEN 2 WHEN 'approved' THEN 3 ELSE 4 END,i.due_date,i.created_at DESC",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "recurring-templates")
    return (await db.prepare(`SELECT t.*,a.company_name,(SELECT COUNT(*) FROM recurring_invoice_generations g WHERE g.template_id=t.id AND g.board_id=t.board_id) AS generated_count,(SELECT MAX(g.issue_date) FROM recurring_invoice_generations g WHERE g.template_id=t.id AND g.board_id=t.board_id) AS last_generated_date FROM recurring_invoice_templates t JOIN crm_accounts a ON a.id=t.account_id AND a.board_id=t.board_id WHERE t.board_id=? ORDER BY CASE t.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,t.next_issue_date`).bind(boardId).all()).results;
  if (view === "recurring-generations")
    return (await db.prepare(`SELECT g.*,t.name template_name,t.interval,a.company_name,i.invoice_number,i.status invoice_status,i.total_minor FROM recurring_invoice_generations g JOIN recurring_invoice_templates t ON t.id=g.template_id AND t.board_id=g.board_id JOIN sales_invoices i ON i.id=g.sales_invoice_id AND i.board_id=g.board_id JOIN crm_accounts a ON a.id=i.account_id AND a.board_id=i.board_id WHERE g.board_id=? ORDER BY g.issue_date DESC,g.created_at DESC LIMIT 100`).bind(boardId).all()).results;
  if (view === "invoice-lines")
    return (
      await db
        .prepare(
          "SELECT l.*,a.code account_code,a.name account_name FROM sales_invoice_lines l LEFT JOIN ledger_accounts a ON a.id=l.account_id WHERE l.board_id=? AND l.sales_invoice_id=? ORDER BY l.line_number",
        )
        .bind(boardId, invoiceId)
        .all()
    ).results;
  if (view === "invoice-document") {
    const approved = await db
      .prepare(
        "SELECT payload,checksum,version,created_at FROM sales_invoice_documents WHERE board_id=? AND sales_invoice_id=? AND status='approved' ORDER BY version DESC LIMIT 1",
      )
      .bind(boardId, invoiceId)
      .first<Record<string, unknown>>();
    if (approved)
      return {
        source: "approved_snapshot",
        checksum: approved.checksum,
        version: approved.version,
        createdAt: approved.created_at,
        document: JSON.parse(String(approved.payload)),
      };
    const invoice = await db
      .prepare(
        "SELECT i.*,a.company_name,COALESCE(p.org_number,a.org_number) customer_org_number,COALESCE(p.customer_type,'business') customer_type,p.address_line1 customer_address_line1,p.postal_code customer_postal_code,p.city customer_city,p.country_code customer_country_code,p.email customer_email FROM sales_invoices i LEFT JOIN crm_accounts a ON a.id=i.account_id LEFT JOIN customer_invoice_profiles p ON p.board_id=i.board_id AND p.account_id=i.account_id WHERE i.board_id=? AND i.id=?",
      )
      .bind(boardId, invoiceId)
      .first<Record<string, unknown>>();
    if (!invoice) return null;
    const seller = await db
      .prepare(
        "SELECT p.*,b.name board_name,b.org_number board_org_number FROM boards b LEFT JOIN accounting_profiles p ON p.board_id=b.id WHERE b.id=?",
      )
      .bind(boardId)
      .first<Record<string, unknown>>();
    const lines = (
      await db
        .prepare(
          "SELECT line_number,description,quantity,unit_price_minor,vat_rate,vat_code,net_minor,vat_minor,total_minor FROM sales_invoice_lines WHERE board_id=? AND sales_invoice_id=? ORDER BY line_number",
        )
        .bind(boardId, invoiceId)
        .all()
    ).results;
    return {
      source: "live_draft",
      checksum: null,
      version: null,
      createdAt: null,
      document: {
        invoice: {
          id: invoice.id,
          number: invoice.invoice_number,
          issueDate: invoice.issue_date,
          dueDate: invoice.due_date,
          description: invoice.description,
          currency: invoice.currency,
          status: invoice.status,
          netMinor: invoice.amount_minor,
          vatMinor: invoice.vat_minor,
          totalMinor: invoice.total_minor,
        },
        seller: {
          legalName: seller?.legal_name || seller?.board_name,
          orgNumber: seller?.org_number || seller?.board_org_number,
          addressLine1: seller?.address_line1,
          postalCode: seller?.postal_code,
          city: seller?.city,
          countryCode: seller?.country_code || "NO",
          email: seller?.email,
          bankAccount: seller?.bank_account,
          vatRegistered: Boolean(seller?.vat_registered),
        },
        customer: {
          name: invoice.company_name,
          type: invoice.customer_type || "business",
          orgNumber: invoice.customer_org_number,
          addressLine1: invoice.customer_address_line1,
          postalCode: invoice.customer_postal_code,
          city: invoice.customer_city,
          countryCode: invoice.customer_country_code || "NO",
          email: invoice.customer_email,
        },
        lines,
      },
    };
  }
  if (view === "credit-notes")
    return (
      await db
        .prepare(
          "SELECT c.*,i.invoice_number FROM sales_credit_notes c JOIN sales_invoices i ON i.id=c.sales_invoice_id WHERE c.board_id=? ORDER BY c.created_at DESC",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "receivables")
    return (
      await db
        .prepare(
          "SELECT i.id,i.invoice_number,i.issue_date,i.due_date,i.description,i.total_minor,i.status,i.paid_at,i.payment_reference,i.paid_minor,COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=i.id AND c.board_id=i.board_id AND c.status='posted'),0) credited_minor,MAX(0,i.total_minor-i.paid_minor-COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=i.id AND c.board_id=i.board_id AND c.status='posted'),0)) outstanding_minor,(SELECT pl.id FROM payment_links pl WHERE pl.entity_type='sales_invoice' AND pl.entity_id=i.id AND pl.board_id=i.board_id ORDER BY pl.linked_at DESC LIMIT 1) payment_link_id,(SELECT pl.bank_transaction_id FROM payment_links pl WHERE pl.entity_type='sales_invoice' AND pl.entity_id=i.id AND pl.board_id=i.board_id ORDER BY pl.linked_at DESC LIMIT 1) bank_transaction_id,(SELECT pl.status FROM payment_links pl WHERE pl.entity_type='sales_invoice' AND pl.entity_id=i.id AND pl.board_id=i.board_id ORDER BY pl.linked_at DESC LIMIT 1) payment_link_status,a.company_name,CASE WHEN MAX(0,i.total_minor-i.paid_minor-COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=i.id AND c.board_id=i.board_id AND c.status='posted'),0))=0 THEN 'paid' WHEN i.status IN ('draft','review') THEN 'needs_review' WHEN i.due_date IS NOT NULL AND i.due_date < date('now') THEN 'overdue' ELSE i.status END AS collection_status FROM sales_invoices i LEFT JOIN crm_accounts a ON a.id=i.account_id WHERE i.board_id=? AND i.status NOT IN ('cancelled') ORDER BY CASE WHEN MAX(0,i.total_minor-i.paid_minor-COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=i.id AND c.board_id=i.board_id AND c.status='posted'),0))=0 THEN 3 WHEN i.due_date < date('now') THEN 0 ELSE 1 END,i.due_date",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "payables")
    return (
      await db
        .prepare(
          "SELECT i.id,i.invoice_number,i.supplier_name,i.due_date,i.amount_minor,i.currency,i.status,i.match_status,i.attested_at,i.assigned_at,i.paid_at,i.payment_reference,(SELECT pl.id FROM payment_links pl WHERE pl.entity_type='supplier_invoice' AND pl.entity_id=i.id AND pl.board_id=i.board_id ORDER BY pl.linked_at DESC LIMIT 1) payment_link_id,(SELECT pl.bank_transaction_id FROM payment_links pl WHERE pl.entity_type='supplier_invoice' AND pl.entity_id=i.id AND pl.board_id=i.board_id ORDER BY pl.linked_at DESC LIMIT 1) bank_transaction_id,(SELECT pl.status FROM payment_links pl WHERE pl.entity_type='supplier_invoice' AND pl.entity_id=i.id AND pl.board_id=i.board_id ORDER BY pl.linked_at DESC LIMIT 1) payment_link_status,CASE WHEN i.status='paid' THEN 'paid' WHEN i.due_date < date('now') THEN 'overdue' WHEN i.status IN ('received','exception') THEN 'needs_review' WHEN i.status IN ('matched','approved') THEN 'ready_to_pay' ELSE i.status END AS payment_status FROM supplier_invoices i WHERE i.board_id=? ORDER BY CASE WHEN i.status='paid' THEN 3 WHEN i.due_date < date('now') THEN 0 ELSE 1 END,i.due_date",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "fx")
    return (
      await db
        .prepare(
          "SELECT * FROM fx_revaluations WHERE board_id=? ORDER BY period DESC,created_at DESC",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "notes")
    return (
      await db
        .prepare(
          "SELECT * FROM statutory_notes WHERE board_id=? ORDER BY period DESC,created_at DESC",
        )
        .bind(boardId)
        .all()
    ).results;
  if (view === "vouchers")
    return (
      await db
        .prepare(
          `SELECT v.id,v.voucher_number,v.voucher_date,v.period,v.description,v.source,v.status,v.external_reference,
    COALESCE(SUM(l.debit_minor),0) AS debit_minor, COALESCE(SUM(l.credit_minor),0) AS credit_minor
    FROM vouchers v LEFT JOIN voucher_lines l ON l.voucher_id = v.id WHERE v.board_id = ? GROUP BY v.id ORDER BY v.voucher_date DESC,v.voucher_number DESC LIMIT 500`,
        )
        .bind(boardId)
        .all()
    ).results;
  const [accounts, periods, vouchers, intercompany, notes, invoices] =
    await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM ledger_accounts WHERE board_id = ? AND active = 1",
        )
        .bind(boardId)
        .first(),
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM accounting_periods WHERE board_id = ? AND status = 'locked'",
        )
        .bind(boardId)
        .first(),
      db
        .prepare(
          "SELECT COUNT(*) AS count, COALESCE(SUM(debit_minor),0) AS debit_minor, COALESCE(SUM(credit_minor),0) AS credit_minor FROM vouchers v LEFT JOIN voucher_lines l ON l.voucher_id = v.id WHERE v.board_id = ?",
        )
        .bind(boardId)
        .first(),
      db
        .prepare(
          "SELECT COUNT(*) AS count,SUM(CASE WHEN status IN ('prepared','review') THEN 1 ELSE 0 END) AS open_count FROM intercompany_postings WHERE board_id=?",
        )
        .bind(boardId)
        .first(),
      db
        .prepare(
          "SELECT COUNT(*) AS count,SUM(CASE WHEN status IN ('draft','review') THEN 1 ELSE 0 END) AS open_count FROM statutory_notes WHERE board_id=?",
        )
        .bind(boardId)
        .first(),
      db
        .prepare(
          "SELECT COUNT(*) AS count,COALESCE(SUM(MAX(0,total_minor-paid_minor-COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=sales_invoices.id AND c.board_id=sales_invoices.board_id AND c.status='posted'),0))),0) AS outstanding_minor,COALESCE(SUM(CASE WHEN due_date IS NOT NULL AND due_date < date('now') THEN MAX(0,total_minor-paid_minor-COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=sales_invoices.id AND c.board_id=sales_invoices.board_id AND c.status='posted'),0)) ELSE 0 END),0) AS overdue_minor FROM sales_invoices WHERE board_id=? AND status NOT IN ('cancelled')",
        )
        .bind(boardId)
        .first(),
    ]);
  return { accounts, periods, vouchers, intercompany, notes, invoices };
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const boardId = (url.searchParams.get("boardId") || "").trim();
  const view = url.searchParams.get("view") || "summary";
  if (!boardId) return json({ error: "boardId_required" }, { status: 400 });
  if (!(await authorizeBoardRead(request, env, boardId)))
    return json({ error: "board_access_denied" }, { status: 403 });
  try {
    const db = requireDb(env);
    if (view === "saf-t") {
      const from = url.searchParams.get("from") || "1900-01";
      const to = url.searchParams.get("to") || "2999-12";
      if (!periodPattern.test(from) || !periodPattern.test(to))
        return json({ error: "period_range_invalid" }, { status: 400 });
      if (from > to)
        return json(
          {
            error: "period_range_invalid",
            detail: "from_must_not_be_after_to",
          },
          { status: 400 },
        );
      const result = await buildSafT(db, boardId, from, to);
      return new Response(result.xml, {
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control": "no-store",
          "x-styr-export": "SAF-T Financial 1.3 contract",
          "x-styr-export-checksum": result.checksum,
          "x-styr-export-row-count": String(result.rowCount),
        },
      });
    }
    if (
      [
        "trial-balance",
        "profit-loss",
        "balance-sheet",
        "general-ledger",
      ].includes(view)
    ) {
      const from =
        url.searchParams.get("from") || `${new Date().getUTCFullYear()}-01`;
      const to =
        url.searchParams.get("to") || `${new Date().getUTCFullYear()}-12`;
      if (!periodPattern.test(from) || !periodPattern.test(to) || from > to)
        return json({ error: "period_range_invalid" }, { status: 400 });
      const report = await buildAccountingReport(db, boardId, view, from, to);
      if (url.searchParams.get("format") === "csv") {
        const columns =
          view === "general-ledger"
            ? [
                "voucher_number",
                "voucher_date",
                "period",
                "code",
                "name",
                "voucher_description",
                "description",
                "debit_minor",
                "credit_minor",
                "vat_code",
                "source",
                "external_reference",
              ]
            : [
                "code",
                "name",
                "account_type",
                "openingBalanceMinor",
                "debitMinor",
                "creditMinor",
                "periodBalanceMinor",
                "closingBalanceMinor",
              ];
        const csvValue = (value: unknown) =>
          `"${String(value ?? "").replace(/"/g, '""')}"`;
        const csv = `\uFEFF${columns.join(";")}\n${(report.rows as Record<string, unknown>[]).map((row) => columns.map((column) => csvValue(row[column])).join(";")).join("\n")}`;
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="styr-ing-${view}-${from}-${to}.csv"`,
            "cache-control": "no-store",
          },
        });
      }
      return json({
        boardId,
        view,
        from,
        to,
        data: report,
        source: "posted_voucher_lines",
      });
    }
    return json({
      boardId,
      view,
      data: await boardData(
        env,
        boardId,
        view,
        url.searchParams.get("invoiceId") || "",
      ),
    });
  } catch (error) {
    return json(
      {
        error: "database_unavailable",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request);
    const boardId = String(value?.boardId || "").trim();
    const action = String(value?.action || "create_voucher");
    if (!boardId) return json({ error: "boardId_required" }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId);
    if (!authorization.allowed)
      return json({ error: "write_not_authorized" }, { status: 401 });
    const db = requireDb(env);
    if (action === "create_account") {
      const code = String(value?.code || "").trim();
      const name = String(value?.name || "").trim();
      const accountType = String(value?.accountType || "").trim();
      const vatCode = String(value?.vatCode || "").trim() || null;
      if (
        !/^\d{4}$/.test(code) ||
        !name ||
        name.length > 160 ||
        !["asset", "liability", "equity", "revenue", "expense"].includes(
          accountType,
        )
      )
        return json({ error: "account_fields_invalid" }, { status: 400 });
      try {
        await db
          .prepare(
            "INSERT INTO ledger_accounts (id,board_id,code,name,account_type,vat_code,active) VALUES (?,?,?,?,?,?,1)",
          )
          .bind(id("acct"), boardId, code, name, accountType, vatCode)
          .run();
      } catch (error) {
        return json(
          { error: "account_code_exists_or_invalid" },
          { status: 409 },
        );
      }
      await recordAudit(db, {
        boardId,
        action,
        entityType: "ledger_account",
        entityId: code,
        userId: authorization.userId || undefined,
        details: { code, accountType },
      });
      return json(
        { ok: true, action, code, name, accountType },
        { status: 201 },
      );
    }
    if (action === "seed_smb_chart") {
      // A deliberately small, Norwegian SMB-friendly starter chart. It is
      // idempotent and never overwrites an account the customer has already
      // created; the accountant can extend or rename accounts afterwards.
      const starterAccounts = [
        ["1500", "Kundefordringer", "asset", null],
        ["1920", "Bankinnskudd", "asset", null],
        ["2050", "Annen egenkapital", "equity", null],
        ["2400", "Leverandørgjeld", "liability", null],
        ["2600", "Forskuddstrekk", "liability", null],
        ["2700", "Skyldig utgående merverdiavgift", "liability", "3"],
        ["2710", "Inngående merverdiavgift", "asset", "1"],
        ["2770", "Skyldig arbeidsgiveravgift", "liability", null],
        ["2900", "Annen kortsiktig gjeld", "liability", null],
        ["3000", "Salgsinntekt", "revenue", "3"],
        ["4000", "Varekjøp", "expense", "1"],
        ["5000", "Lønn", "expense", null],
        ["5400", "Arbeidsgiveravgift", "expense", null],
        ["6300", "Leiekostnad", "expense", "1"],
        ["6800", "Kontorrekvisita", "expense", "1"],
        ["2930", "Skyldig lønn", "liability", null],
        ["8050", "Renteinntekt", "revenue", null],
      ] as const;
      const existing = (
        await db
          .prepare("SELECT code FROM ledger_accounts WHERE board_id=?")
          .bind(boardId)
          .all()
      ).results as Array<{ code?: unknown }>;
      const existingCodes = new Set(
        existing.map((row) => String(row.code || "")),
      );
      const missing = starterAccounts.filter(
        ([code]) => !existingCodes.has(code),
      );
      if (missing.length) {
        await db.batch(
          missing.map(([code, name, accountType, vatCode]) =>
            db
              .prepare(
                "INSERT INTO ledger_accounts (id,board_id,code,name,account_type,vat_code,active) VALUES (?,?,?,?,?,?,1)",
              )
              .bind(id("acct"), boardId, code, name, accountType, vatCode),
          ),
        );
      }
      await recordAudit(db, {
        boardId,
        action,
        entityType: "ledger_account",
        entityId: "smb-starter-chart",
        userId: authorization.userId || undefined,
        details: { inserted: missing.length, total: starterAccounts.length },
      });
      return json(
        {
          ok: true,
          action,
          inserted: missing.length,
          existing: starterAccounts.length - missing.length,
          total: starterAccounts.length,
          note: "Starter chart only; have an accountant validate your complete chart and VAT mapping before production use.",
        },
        { status: 201 },
      );
    }
    if (action === "create_period") {
      const period = String(value?.period || "").trim();
      if (!periodPattern.test(period))
        return json({ error: "period_invalid" }, { status: 400 });
      try {
        await db
          .prepare(
            "INSERT INTO accounting_periods (id,board_id,period,status) VALUES (?,?,?,'open')",
          )
          .bind(id("period"), boardId, period)
          .run();
      } catch (error) {
        return json({ error: "period_exists_or_invalid" }, { status: 409 });
      }
      await recordAudit(db, {
        boardId,
        action,
        entityType: "accounting_period",
        entityId: period,
        userId: authorization.userId || undefined,
        details: { period },
      });
      return json(
        { ok: true, action, period, status: "open" },
        { status: 201 },
      );
    }
    if (action === "create_fiscal_year") {
      const year = Number(value?.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100)
        return json({ error: "fiscal_year_invalid" }, { status: 400 });
      const periods = Array.from(
        { length: 12 },
        (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
      );
      const existing = (
        await db
          .prepare(
            "SELECT period,status FROM accounting_periods WHERE board_id=? AND period BETWEEN ? AND ? ORDER BY period",
          )
          .bind(boardId, `${year}-01`, `${year}-12`)
          .all()
      ).results as Record<string, unknown>[];
      const existingPeriods = new Set(existing.map((row) => String(row.period)));
      const missing = periods.filter((period) => !existingPeriods.has(period));
      if (missing.length) {
        await db.batch(
          missing.map((period) =>
            db
              .prepare(
                "INSERT INTO accounting_periods (id,board_id,period,status) VALUES (?,?,?,'open')",
              )
              .bind(id("period"), boardId, period),
          ),
        );
      }
      await recordAudit(db, {
        boardId,
        action,
        entityType: "accounting_fiscal_year",
        entityId: String(year),
        userId: authorization.userId || undefined,
        details: {
          year,
          createdPeriods: missing.length,
          existingPeriods: existing.length,
          periods,
        },
      });
      return json(
        {
          ok: true,
          action,
          year,
          periods,
          created: missing.length,
          existing: existing.length,
          idempotent: missing.length === 0,
          status: "open",
        },
        { status: missing.length ? 201 : 200 },
      );
    }
    if (action === "save_accounting_profile") {
      const legalName = String(value?.legalName || "").trim(),
        orgNumber = String(value?.orgNumber || "").replace(/\s/g, ""),
        addressLine1 = String(value?.addressLine1 || "").trim(),
        postalCode = String(value?.postalCode || "").trim(),
        city = String(value?.city || "").trim(),
        bankAccount = String(value?.bankAccount || "").replace(/\s/g, ""),
        email = String(value?.email || "").trim() || null;
      if (
        !legalName ||
        legalName.length > 200 ||
        !validOrgNumber(orgNumber) ||
        !addressLine1 ||
        addressLine1.length > 200 ||
        !/^[0-9]{4}$/.test(postalCode) ||
        !city ||
        city.length > 100 ||
        !validBankAccount(bankAccount) ||
        (email && (!email.includes("@") || email.length > 200))
      )
        return json(
          {
            error: "accounting_profile_fields_invalid",
            required: [
              "legalName",
              "orgNumber",
              "addressLine1",
              "postalCode",
              "city",
              "bankAccount",
            ],
          },
          { status: 400 },
        );
      await db
        .prepare(
          "INSERT INTO accounting_profiles (board_id,legal_name,org_number,address_line1,postal_code,city,country_code,email,bank_account,vat_registered,updated_by,updated_at) VALUES (?,?,?,?,? ,?,'NO',?,?,?,?,datetime('now')) ON CONFLICT(board_id) DO UPDATE SET legal_name=excluded.legal_name,org_number=excluded.org_number,address_line1=excluded.address_line1,postal_code=excluded.postal_code,city=excluded.city,country_code=excluded.country_code,email=excluded.email,bank_account=excluded.bank_account,vat_registered=excluded.vat_registered,updated_by=excluded.updated_by,updated_at=datetime('now')",
        )
        .bind(
          boardId,
          legalName,
          orgNumber,
          addressLine1,
          postalCode,
          city,
          email,
          bankAccount,
          value?.vatRegistered ? 1 : 0,
          authorization.userId || "service",
        )
        .run();
      await recordAudit(db, {
        boardId,
        action,
        entityType: "accounting_profile",
        entityId: boardId,
        userId: authorization.userId || undefined,
        details: { orgNumber, vatRegistered: Boolean(value?.vatRegistered) },
      });
      return json({ ok: true, action, status: "saved", orgNumber });
    }
    if (action === "save_customer_invoice_profile") {
      const accountId = String(value?.accountId || "").trim(),
        customerType = ["business", "private"].includes(
          String(value?.customerType || ""),
        )
          ? String(value?.customerType)
          : "business",
        orgNumber = String(value?.orgNumber || "").replace(/\s/g, ""),
        addressLine1 = String(value?.addressLine1 || "").trim(),
        postalCode = String(value?.postalCode || "").trim(),
        city = String(value?.city || "").trim(),
        email = String(value?.email || "").trim() || null;
      if (
        !accountId ||
        (customerType === "business" && !validOrgNumber(orgNumber)) ||
        (customerType === "private" &&
          orgNumber &&
          !validOrgNumber(orgNumber)) ||
        !addressLine1 ||
        addressLine1.length > 200 ||
        !/^[0-9]{4}$/.test(postalCode) ||
        !city ||
        city.length > 100 ||
        (email && (!email.includes("@") || email.length > 200))
      )
        return json(
          {
            error: "customer_invoice_profile_fields_invalid",
            required: [
              "accountId",
              "customerType",
              "addressLine1",
              "postalCode",
              "city",
            ],
          },
          { status: 400 },
        );
      if (
        !(await db
          .prepare(
            "SELECT id FROM crm_accounts WHERE id=? AND board_id=? AND stage NOT IN ('lost')",
          )
          .bind(accountId, boardId)
          .first())
      )
        return json({ error: "customer_not_found" }, { status: 400 });
      await db
        .prepare(
          "INSERT INTO customer_invoice_profiles (board_id,account_id,org_number,customer_type,address_line1,postal_code,city,country_code,email,updated_by,updated_at) VALUES (?,?,?, ?,? ,? ,?,'NO',?,?,datetime('now')) ON CONFLICT(board_id,account_id) DO UPDATE SET org_number=excluded.org_number,customer_type=excluded.customer_type,address_line1=excluded.address_line1,postal_code=excluded.postal_code,city=excluded.city,country_code=excluded.country_code,email=excluded.email,updated_by=excluded.updated_by,updated_at=datetime('now')",
        )
        .bind(
          boardId,
          accountId,
          orgNumber || null,
          customerType,
          addressLine1,
          postalCode,
          city,
          email,
          authorization.userId || "service",
        )
        .run();
      await recordAudit(db, {
        boardId,
        action,
        entityType: "customer_invoice_profile",
        entityId: accountId,
        userId: authorization.userId || undefined,
        details: { countryCode: "NO", customerType },
      });
      return json({
        ok: true,
        action,
        status: "saved",
        accountId,
        customerType,
      });
    }
    if (action === "import_vouchers") {
      const rows = Array.isArray(value?.vouchers)
        ? (value.vouchers as Record<string, unknown>[])
        : [];
      if (!rows.length || rows.length > 100)
        return json({ error: "vouchers_required_max_100" }, { status: 400 });
      const refs = new Set<string>();
      const normalizedRows: Array<{
        voucherDate: string;
        period: string;
        description: string;
        externalReference: string | null;
        lines: Array<{
          accountId: string;
          description: string;
          debit: number;
          credit: number;
          vatCode: string | null;
        }>;
      }> = [];
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const voucherDate = String(
          row.voucherDate || row.voucher_date || "",
        ).trim();
        const period = String(row.period || voucherDate.slice(0, 7)).trim();
        const description = String(row.description || "").trim();
        const externalReference =
          String(
            row.externalReference || row.external_reference || "",
          ).trim() || null;
        const rawLines = Array.isArray(row.lines)
          ? (row.lines as Record<string, unknown>[])
          : [];
        if (
          !validIsoDate(voucherDate) ||
          !periodPattern.test(period) ||
          !description ||
          description.length > 200 ||
          (externalReference &&
            (externalReference.length > 120 || refs.has(externalReference))) ||
          rawLines.length < 2 ||
          rawLines.length > 100
        )
          return json(
            { error: "voucher_import_row_invalid", row: rowIndex + 1 },
            { status: 400 },
          );
        if (externalReference) refs.add(externalReference);
        if (
          await db
            .prepare(
              "SELECT 1 FROM accounting_periods WHERE board_id=? AND period=? AND status='locked'",
            )
            .bind(boardId, period)
            .first()
        )
          return json(
            { error: "period_locked", period, row: rowIndex + 1 },
            { status: 409 },
          );
        let debit = 0;
        let credit = 0;
        const lines: Array<{
          accountId: string;
          description: string;
          debit: number;
          credit: number;
          vatCode: string | null;
        }> = [];
        for (const line of rawLines) {
          const accountId = String(line.accountId || "").trim();
          const lineDescription = String(
            line.description || description,
          ).trim();
          const d = asMinor(line.debitMinor ?? line.debit_minor ?? 0);
          const c = asMinor(line.creditMinor ?? line.credit_minor ?? 0);
          const vatCode =
            line.vatCode === undefined ||
            line.vatCode === null ||
            line.vatCode === ""
              ? null
              : String(line.vatCode).trim();
          if (
            !accountId ||
            !lineDescription ||
            lineDescription.length > 200 ||
            d === null ||
            c === null ||
            (d === 0 && c === 0) ||
            (d > 0 && c > 0) ||
            (vatCode !== null &&
              !["0", "1", "1_12", "1_15", "3", "3_12", "3_15", "3C"].includes(vatCode))
          )
            return json(
              { error: "voucher_import_line_invalid", row: rowIndex + 1 },
              { status: 400 },
            );
          debit += d;
          credit += c;
          lines.push({
            accountId,
            description: lineDescription,
            debit: d,
            credit: c,
            vatCode,
          });
        }
        if (debit !== credit || debit <= 0)
          return json(
            {
              error: "voucher_import_row_not_balanced",
              row: rowIndex + 1,
              debitMinor: debit,
              creditMinor: credit,
            },
            { status: 422 },
          );
        normalizedRows.push({
          voucherDate,
          period,
          description,
          externalReference,
          lines,
        });
      }
      if (refs.size) {
        const placeholders = [...refs].map(() => "?").join(",");
        const existingRefs = (
          await db
            .prepare(
              `SELECT external_reference FROM vouchers WHERE board_id=? AND external_reference IN (${placeholders})`,
            )
            .bind(boardId, ...refs)
            .all()
        ).results;
        if (existingRefs.length)
          return json(
            {
              error: "voucher_external_reference_exists",
              references: existingRefs.map((item) =>
                String(
                  (item as Record<string, unknown>).external_reference || "",
                ),
              ),
            },
            { status: 409 },
          );
      }
      const accountIds = [
        ...new Set(
          normalizedRows.flatMap((row) =>
            row.lines.map((line) => line.accountId),
          ),
        ),
      ];
      const accountPlaceholders = accountIds.map(() => "?").join(",");
      const accountRows = (
        await db
          .prepare(
            `SELECT id FROM ledger_accounts WHERE board_id=? AND active=1 AND id IN (${accountPlaceholders})`,
          )
          .bind(boardId, ...accountIds)
          .all()
      ).results;
      if (accountRows.length !== accountIds.length)
        return json(
          { error: "voucher_import_account_not_found" },
          { status: 400 },
        );
      const statements: D1PreparedStatement[] = [];
      const created: Array<{
        voucherId: string;
        period: string;
        externalReference: string | null;
      }> = [];
      for (const row of normalizedRows) {
        const voucherId = id("voucher");
        created.push({
          voucherId,
          period: row.period,
          externalReference: row.externalReference,
        });
        statements.push(
          db
            .prepare(
              "INSERT INTO voucher_sequences (board_id,next_number) SELECT ?,COALESCE(MAX(voucher_number),0)+1 FROM vouchers WHERE board_id=? ON CONFLICT(board_id) DO NOTHING",
            )
            .bind(boardId, boardId),
          db
            .prepare(
              "UPDATE voucher_sequences SET next_number=next_number+1,updated_at=datetime('now') WHERE board_id=?",
            )
            .bind(boardId),
          db
            .prepare(
              "INSERT INTO vouchers (id,board_id,voucher_number,voucher_date,period,description,source,status,external_reference,created_by) SELECT ?,?,next_number-1,?,?,?,?,?,?,? FROM voucher_sequences WHERE board_id=?",
            )
            .bind(
              voucherId,
              boardId,
              row.voucherDate,
              row.period,
              row.description,
              "csv_import",
              "posted",
              row.externalReference,
              authorization.userId || "api",
              boardId,
            ),
        );
        for (const line of row.lines)
          statements.push(
            db
              .prepare(
                "INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,?)",
              )
              .bind(
                id("line"),
                voucherId,
                line.accountId,
                line.description,
                line.debit,
                line.credit,
                line.vatCode,
              ),
          );
      }
      await db.batch(statements);
      for (const item of created)
        await recordAudit(db, {
          boardId,
          action: "voucher_imported",
          entityType: "voucher",
          entityId: item.voucherId,
          userId: authorization.userId || undefined,
          details: {
            period: item.period,
            externalReference: item.externalReference,
            source: "csv_import",
          },
        });
      return json(
        {
          ok: true,
          action,
          imported: created.length,
          voucherIds: created.map((item) => item.voucherId),
          source: "csv_import",
        },
        { status: 201 },
      );
    }
    if (action === "reseal_period") {
      const period = String(value?.period || "");
      if (!periodPattern.test(period))
        return json({ error: "period_invalid" }, { status: 400 });
      const existing = await db
        .prepare(
          "SELECT status FROM accounting_periods WHERE board_id=? AND period=?",
        )
        .bind(boardId, period)
        .first<Record<string, unknown>>();
      if (existing?.status !== "locked")
        return json({ error: "period_must_be_locked" }, { status: 409 });
      const rows = (
        await db
          .prepare(
            `SELECT v.voucher_number,v.voucher_date,v.description,l.id AS line_id,l.account_id,l.debit_minor,l.credit_minor,l.vat_code FROM vouchers v JOIN voucher_lines l ON l.voucher_id=v.id WHERE v.board_id=? AND v.period=? ORDER BY v.voucher_number,l.id`,
          )
          .bind(boardId, period)
          .all()
      ).results;
      const sealChecksum = await sha256(JSON.stringify(rows));
      await db
        .prepare(
          "UPDATE accounting_periods SET seal_checksum=?,locked_at=COALESCE(locked_at,datetime('now')) WHERE board_id=? AND period=? AND status='locked'",
        )
        .bind(sealChecksum, boardId, period)
        .run();
      await recordAudit(db, {
        boardId,
        action: "accounting_period_resealed",
        entityType: "accounting_period",
        entityId: period,
        userId: authorization.userId || undefined,
        details: { period, sealChecksum, voucherLineCount: rows.length },
      });
      return json({
        ok: true,
        action,
        boardId,
        period,
        status: "locked",
        sealChecksum,
        voucherLineCount: rows.length,
        requiresHumanReview: true,
      });
    }
    if (action === "prepare_period_close") {
      const period = String(value?.period || "").trim();
      if (!periodPattern.test(period))
        return json({ error: "period_invalid" }, { status: 400 });
      const existingPeriod = await db
        .prepare(
          "SELECT status,seal_checksum FROM accounting_periods WHERE board_id=? AND period=?",
        )
        .bind(boardId, period)
        .first<Record<string, unknown>>();
      if (existingPeriod?.status === "locked")
        return json(
          { error: "period_already_locked", period },
          { status: 409 },
        );
      const [
        vouchers,
        balance,
        bank,
        sales,
        purchases,
        vat,
        payroll,
        proposals,
        depreciation,
        saft,
      ] = await Promise.all([
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM vouchers WHERE board_id=? AND period=?",
          )
          .bind(boardId, period)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT COALESCE(SUM(l.debit_minor),0) AS debit_minor,COALESCE(SUM(l.credit_minor),0) AS credit_minor FROM vouchers v JOIN voucher_lines l ON l.voucher_id=v.id WHERE v.board_id=? AND v.period=?",
          )
          .bind(boardId, period)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM bank_transactions WHERE board_id=? AND substr(transaction_date,1,7)=? AND status IN ('imported','suggested','approved')",
          )
          .bind(boardId, period)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM sales_invoices WHERE board_id=? AND substr(issue_date,1,7)=? AND status IN ('draft','review','approved','sent','overdue')",
          )
          .bind(boardId, period)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM supplier_invoices WHERE board_id=? AND substr(due_date,1,7)=? AND status IN ('received','matched','exception','approved')",
          )
          .bind(boardId, period)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT status,source_count,unmapped_count,submission_id,source_hash FROM vat_periods WHERE board_id=? AND period=?",
          )
          .bind(boardId, period)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM payroll_runs WHERE board_id=? AND period=? AND status NOT IN ('approved','submitted','closed')",
          )
          .bind(boardId, period)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM (SELECT id FROM posting_proposals WHERE board_id=? AND period=? AND status IN ('review','approved') UNION ALL SELECT id FROM payroll_posting_proposals WHERE board_id=? AND period=? AND status IN ('review','approved'))",
          )
          .bind(boardId, period, boardId, period)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM depreciation_entries WHERE board_id=? AND period=? AND ledger_type='financial' AND status IN ('calculated','review','approved')",
          )
          .bind(boardId, period)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT id,row_count,checksum FROM saf_t_exports WHERE board_id=? AND period_from<=? AND period_to>=? ORDER BY created_at DESC LIMIT 1",
          )
          .bind(boardId, period, period)
          .first<Record<string, unknown>>(),
      ]);
      const debit = Number(balance?.debit_minor || 0);
      const credit = Number(balance?.credit_minor || 0);
      const vatStatus = String(vat?.status || "missing");
      const vatBlocking =
        vatStatus !== "missing" &&
        (!["approved", "prepared"].includes(vatStatus) ||
          Number(vat?.unmapped_count || 0) > 0);
      const checks = {
        vouchers: {
          count: Number(vouchers?.count || 0),
          balanced: debit === credit,
          blocking: debit !== credit,
        },
        balance: {
          debitMinor: debit,
          creditMinor: credit,
          balanced: debit === credit,
          blocking: debit !== credit,
        },
        bank: {
          openCount: Number(bank?.count || 0),
          clear: Number(bank?.count || 0) === 0,
          blocking: Number(bank?.count || 0) > 0,
        },
        sales: {
          openCount: Number(sales?.count || 0),
          warning: Number(sales?.count || 0) > 0,
          blocking: false,
        },
        purchases: {
          openCount: Number(purchases?.count || 0),
          warning: Number(purchases?.count || 0) > 0,
          blocking: false,
        },
        vat: {
          status: vatStatus,
          unmappedCount: Number(vat?.unmapped_count || 0),
          ready:
            vatStatus === "missing" ||
            (["approved", "prepared"].includes(vatStatus) &&
              Number(vat?.unmapped_count || 0) === 0),
          blocking: vatBlocking,
        },
        payroll: {
          openCount: Number(payroll?.count || 0),
          clear: Number(payroll?.count || 0) === 0,
          blocking: Number(payroll?.count || 0) > 0,
        },
        proposals: {
          openCount: Number(proposals?.count || 0),
          clear: Number(proposals?.count || 0) === 0,
          blocking: Number(proposals?.count || 0) > 0,
        },
        depreciation: {
          openCount: Number(depreciation?.count || 0),
          clear: Number(depreciation?.count || 0) === 0,
          blocking: Number(depreciation?.count || 0) > 0,
        },
        safT: {
          present: Boolean(saft?.checksum),
          checksum: saft?.checksum || null,
          warning: !saft?.checksum,
          blocking: false,
        },
      };
      const blocking = Object.entries(checks)
        .filter(([, check]) =>
          Boolean((check as Record<string, unknown>)?.blocking),
        )
        .map(([name]) => name);
      const warnings = Object.entries(checks)
        .filter(([, check]) =>
          Boolean((check as Record<string, unknown>)?.warning),
        )
        .map(([name]) => name);
      const payload = JSON.stringify({ period, checks, blocking, warnings });
      const sourceHash = await sha256(payload);
      const closureId = id("close");
      await db
        .prepare(
          "INSERT INTO accounting_period_closures (id,board_id,period,status,checks_json,source_hash,prepared_by,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(board_id,period) DO UPDATE SET status='review',checks_json=excluded.checks_json,source_hash=excluded.source_hash,prepared_by=excluded.prepared_by,approved_by=NULL,approved_at=NULL,updated_at=datetime('now')",
        )
        .bind(
          closureId,
          boardId,
          period,
          "review",
          payload,
          sourceHash,
          authorization.userId || "service",
        )
        .run();
      await recordAudit(db, {
        boardId,
        action: "accounting_period_close_prepared",
        entityType: "accounting_period_closure",
        entityId: closureId,
        userId: authorization.userId || undefined,
        details: { period, blocking, warnings, sourceHash },
      });
      return json(
        {
          ok: true,
          action,
          closureId,
          period,
          status: "review",
          checks,
          blocking,
          warnings,
          ready: blocking.length === 0,
          sourceHash,
        },
        { status: 201 },
      );
    }
    if (action === "approve_period_close") {
      const period = String(value?.period || "").trim();
      if (!periodPattern.test(period))
        return json({ error: "period_invalid" }, { status: 400 });
      const closure = await db
        .prepare(
          "SELECT * FROM accounting_period_closures WHERE board_id=? AND period=? AND status='review'",
        )
        .bind(boardId, period)
        .first<Record<string, unknown>>();
      if (!closure)
        return json({ error: "period_close_not_in_review" }, { status: 409 });
      const checks = JSON.parse(String(closure.checks_json || "{}"));
      const blocking = Object.entries(checks)
        .filter(([, check]) =>
          Boolean((check as Record<string, unknown>)?.blocking),
        )
        .map(([name]) => name);
      if (blocking.length)
        return json(
          { error: "period_close_checks_blocking", blocking },
          { status: 409 },
        );
      await db
        .prepare(
          "UPDATE accounting_period_closures SET status='approved',approved_by=?,approved_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND board_id=? AND status='review'",
        )
        .bind(authorization.userId || "service", closure.id, boardId)
        .run();
      await recordAudit(db, {
        boardId,
        action: "accounting_period_close_approved",
        entityType: "accounting_period_closure",
        entityId: String(closure.id),
        userId: authorization.userId || undefined,
        details: { period },
      });
      return json({ ok: true, action, period, status: "approved" });
    }
    if (action === "lock_period") {
      const period = String(value?.period || "");
      if (!periodPattern.test(period))
        return json({ error: "period_invalid" }, { status: 400 });
      const closure = await db
        .prepare(
          "SELECT status FROM accounting_period_closures WHERE board_id=? AND period=?",
        )
        .bind(boardId, period)
        .first<{ status: string }>();
      if (!closure || closure.status !== "approved")
        return json(
          { error: "period_close_not_approved", period },
          { status: 409 },
        );
      const existing = await db
        .prepare(
          "SELECT status,seal_checksum FROM accounting_periods WHERE board_id=? AND period=?",
        )
        .bind(boardId, period)
        .first<Record<string, unknown>>();
      if (existing?.status === "locked")
        return json(
          {
            error: "period_already_locked",
            period,
            sealChecksum: existing.seal_checksum || null,
          },
          { status: 409 },
        );
      const rows = (
        await db
          .prepare(
            `SELECT v.voucher_number,v.voucher_date,v.description,l.id AS line_id,l.account_id,l.debit_minor,l.credit_minor,l.vat_code
        FROM vouchers v JOIN voucher_lines l ON l.voucher_id=v.id WHERE v.board_id=? AND v.period=? ORDER BY v.voucher_number,l.id`,
          )
          .bind(boardId, period)
          .all()
      ).results;
      const sealChecksum = await sha256(JSON.stringify(rows));
      const lockedBy =
        authorization.userId || String(value?.lockedBy || "service");
      await db
        .prepare(
          "INSERT INTO accounting_periods (id,board_id,period,status,locked_by,locked_at,seal_checksum) VALUES (?,?,?,?,?,datetime('now'),?) ON CONFLICT(board_id,period) DO UPDATE SET status='locked',locked_by=excluded.locked_by,locked_at=datetime('now'),seal_checksum=excluded.seal_checksum",
        )
        .bind(id("period"), boardId, period, "locked", lockedBy, sealChecksum)
        .run();
      await db
        .prepare(
          "UPDATE accounting_period_closures SET status='locked',locked_by=?,locked_at=datetime('now'),updated_at=datetime('now') WHERE board_id=? AND period=? AND status='approved'",
        )
        .bind(lockedBy, boardId, period)
        .run();
      await recordAudit(db, {
        boardId,
        action: "accounting_period_locked",
        entityType: "accounting_period",
        entityId: period,
        userId: authorization.userId || undefined,
        details: { period, sealChecksum, voucherLineCount: rows.length },
      });
      return json({
        ok: true,
        action,
        boardId,
        period,
        status: "locked",
        sealChecksum,
        voucherLineCount: rows.length,
        requiresHumanReview: true,
      });
    }
    if (action === "record_saf_t_export") {
      const from = String(value?.from || "");
      const to = String(value?.to || "");
      if (!periodPattern.test(from) || !periodPattern.test(to) || from > to)
        return json({ error: "period_range_invalid" }, { status: 400 });
      const result = await buildSafT(db, boardId, from, to);
      const exportId = id("saft");
      await db
        .prepare(
          "INSERT INTO saf_t_exports (id,board_id,period_from,period_to,status,row_count,checksum,created_by) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          exportId,
          boardId,
          from,
          to,
          "prepared",
          result.rowCount,
          result.checksum,
          authorization.userId || "authorized-user",
        )
        .run();
      await recordAudit(db, {
        boardId,
        action: "saf_t_export_prepared",
        entityType: "saf_t_export",
        entityId: exportId,
        userId: authorization.userId || undefined,
        details: {
          from,
          to,
          rowCount: result.rowCount,
          checksum: result.checksum,
        },
      });
      return json(
        {
          ok: true,
          action,
          exportId,
          from,
          to,
          rowCount: result.rowCount,
          checksum: result.checksum,
          status: "prepared",
          downloadUrl: `/api/finance?boardId=${encodeURIComponent(boardId)}&view=saf-t&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        },
        { status: 201 },
      );
    }
    if (action === "prepare_fx") {
      const reference = String(value?.reference || "").trim();
      const currency = String(value?.currency || "")
        .trim()
        .toUpperCase();
      const period = String(value?.period || "").trim();
      const foreignAmountMinor = asMinor(value?.foreignAmountMinor);
      const bookedRate = Number(value?.bookedRate);
      const closingRate = Number(value?.closingRate);
      if (
        !reference ||
        reference.length > 120 ||
        !/^[A-Z]{3}$/.test(currency) ||
        !periodPattern.test(period) ||
        foreignAmountMinor === null ||
        foreignAmountMinor <= 0 ||
        !Number.isFinite(bookedRate) ||
        bookedRate <= 0 ||
        !Number.isFinite(closingRate) ||
        closingRate <= 0
      )
        return json({ error: "fx_fields_invalid" }, { status: 400 });
      const bookedNokMinor = Math.round(foreignAmountMinor * bookedRate);
      const closingNokMinor = Math.round(foreignAmountMinor * closingRate);
      const gainLossMinor = closingNokMinor - bookedNokMinor;
      const fxId = id("fx");
      await db
        .prepare(
          "INSERT INTO fx_revaluations (id,board_id,reference,currency,period,foreign_amount_minor,booked_rate,closing_rate,booked_nok_minor,closing_nok_minor,gain_loss_minor,source,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'review')",
        )
        .bind(
          fxId,
          boardId,
          reference,
          currency,
          period,
          foreignAmountMinor,
          bookedRate,
          closingRate,
          bookedNokMinor,
          closingNokMinor,
          gainLossMinor,
          String(value?.source || "manual") === "norges_bank"
            ? "norges_bank"
            : "manual",
        )
        .run();
      await recordAudit(db, {
        boardId,
        action: "fx_revaluation_prepared",
        entityType: "fx_revaluation",
        entityId: fxId,
        userId: authorization.userId || undefined,
        details: {
          reference,
          currency,
          period,
          bookedRate,
          closingRate,
          gainLossMinor,
          source:
            String(value?.source || "manual") === "norges_bank"
              ? "norges_bank"
              : "manual",
          glPosting: "not_configured",
        },
      });
      return json(
        {
          ok: true,
          action,
          fxId,
          status: "review",
          reference,
          currency,
          period,
          bookedNokMinor,
          closingNokMinor,
          gainLossMinor,
          source:
            String(value?.source || "manual") === "norges_bank"
              ? "norges_bank"
              : "manual",
          glPosting: "not_configured",
        },
        { status: 201 },
      );
    }
    if (action === "approve_fx") {
      const fxId = String(value?.fxId || "").trim();
      if (!fxId) return json({ error: "fxId_required" }, { status: 400 });
      const result = await db
        .prepare(
          "UPDATE fx_revaluations SET status='approved',approved_by=?,approved_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('draft','review')",
        )
        .bind(authorization.userId || "service", fxId, boardId)
        .run();
      if (!result.meta?.changes)
        return json({ error: "fx_not_open_or_found" }, { status: 409 });
      await recordAudit(db, {
        boardId,
        action: "fx_revaluation_approved",
        entityType: "fx_revaluation",
        entityId: fxId,
        userId: authorization.userId || undefined,
        details: { glPosting: "not_configured" },
      });
      return json({
        ok: true,
        action,
        fxId,
        status: "approved",
        glPosting: "not_configured",
      });
    }
    if (action === "post_fx") {
      const fxId = String(value?.fxId || "").trim();
      const fx = await db
        .prepare(
          "SELECT * FROM fx_revaluations WHERE id=? AND board_id=? AND status='approved' AND posted_voucher_id IS NULL",
        )
        .bind(fxId, boardId)
        .first<Record<string, unknown>>();
      if (!fx)
        return json({ error: "fx_not_approved_or_found" }, { status: 409 });
      const debitAccountId = String(value?.debitAccountId || "").trim(),
        creditAccountId = String(value?.creditAccountId || "").trim();
      if (
        !debitAccountId ||
        !creditAccountId ||
        debitAccountId === creditAccountId
      )
        return json({ error: "fx_accounts_required" }, { status: 400 });
      const amount = Math.abs(Number(fx.gain_loss_minor || 0));
      if (!Number.isSafeInteger(amount) || amount <= 0)
        return json({ error: "fx_gain_loss_zero" }, { status: 409 });
      if (
        await db
          .prepare(
            "SELECT 1 FROM accounting_periods WHERE board_id=? AND period=? AND status='locked'",
          )
          .bind(boardId, fx.period)
          .first()
      )
        return json(
          { error: "period_locked", period: fx.period },
          { status: 409 },
        );
      const accounts = (
        await db
          .prepare(
            "SELECT id FROM ledger_accounts WHERE board_id=? AND active=1 AND id IN (?,?)",
          )
          .bind(boardId, debitAccountId, creditAccountId)
          .all()
      ).results;
      if (accounts.length !== 2)
        return json({ error: "fx_account_not_found" }, { status: 400 });
      const existing = await db
        .prepare(
          "SELECT id,voucher_number,period FROM vouchers WHERE board_id=? AND external_reference=?",
        )
        .bind(boardId, `fx:${fx.reference}`)
        .first<{ id: string; voucher_number: number; period: string }>();
      if (existing) {
        await db
          .prepare(
            "UPDATE fx_revaluations SET posted_voucher_id=? WHERE id=? AND board_id=? AND status='approved' AND posted_voucher_id IS NULL",
          )
          .bind(existing.id, fxId, boardId)
          .run();
        return json({
          ok: true,
          action,
          fxId,
          status: "posted",
          voucherId: existing.id,
          voucherNumber: Number(existing.voucher_number),
          period: existing.period,
          idempotent: true,
        });
      }
      const voucherId = id("voucher");
      const gain = Number(fx.gain_loss_minor || 0) > 0;
      const date = `${String(fx.period)}-01`;
      const statements = [
        db
          .prepare(
            "INSERT INTO voucher_sequences (board_id,next_number) SELECT ?,COALESCE(MAX(voucher_number),0)+1 FROM vouchers WHERE board_id=? ON CONFLICT(board_id) DO NOTHING",
          )
          .bind(boardId, boardId),
        db
          .prepare(
            "UPDATE voucher_sequences SET next_number=next_number+1,updated_at=datetime('now') WHERE board_id=?",
          )
          .bind(boardId),
        db
          .prepare(
            "INSERT INTO vouchers (id,board_id,voucher_number,voucher_date,period,description,source,status,external_reference,created_by) SELECT ?,?,next_number-1,?,?,?,?,?,?,? FROM voucher_sequences WHERE board_id=?",
          )
          .bind(
            voucherId,
            boardId,
            date,
            fx.period,
            `Valutarevaluering ${String(fx.reference).slice(0, 160)}`,
            "fx_revaluation",
            "posted",
            `fx:${fx.reference}`,
            authorization.userId || "authorized-user",
            boardId,
          ),
        db
          .prepare(
            "INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            id("line"),
            voucherId,
            gain ? creditAccountId : debitAccountId,
            `Valutagevinst/-tap ${String(fx.currency)}`,
            amount,
            0,
            null,
          ),
        db
          .prepare(
            "INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            id("line"),
            voucherId,
            gain ? debitAccountId : creditAccountId,
            `Motkonto ${String(fx.reference)}`,
            0,
            amount,
            null,
          ),
      ];
      await db.batch(statements);
      const created = await db
        .prepare(
          "SELECT voucher_number FROM vouchers WHERE id=? AND board_id=?",
        )
        .bind(voucherId, boardId)
        .first<{ voucher_number: number }>();
      if (!created)
        return json({ error: "fx_voucher_not_created" }, { status: 503 });
      await db
        .prepare(
          "UPDATE fx_revaluations SET posted_voucher_id=? WHERE id=? AND board_id=? AND status='approved' AND posted_voucher_id IS NULL",
        )
        .bind(voucherId, fxId, boardId)
        .run();
      await recordAudit(db, {
        boardId,
        action: "fx_revaluation_posted",
        entityType: "fx_revaluation",
        entityId: fxId,
        userId: authorization.userId || undefined,
        details: {
          voucherId,
          voucherNumber: created.voucher_number,
          period: fx.period,
          amountMinor: amount,
          gain,
        },
      });
      return json(
        {
          ok: true,
          action,
          fxId,
          status: "posted",
          voucherId,
          voucherNumber: Number(created.voucher_number),
          period: fx.period,
        },
        { status: 201 },
      );
    }
    if (action === "prepare_intercompany") {
      const sourceEntity = String(value?.sourceEntity || "").trim(),
        targetEntity = String(value?.targetEntity || "").trim(),
        reference = String(value?.reference || "").trim(),
        period = String(value?.period || "");
      const amount = asMinor(value?.amountMinor);
      const sourceVoucherId =
        String(value?.sourceVoucherId || "").trim() || null;
      if (
        !sourceEntity ||
        !targetEntity ||
        !reference ||
        amount === null ||
        amount <= 0 ||
        !periodPattern.test(period) ||
        sourceEntity === targetEntity
      )
        return json({ error: "intercompany_fields_invalid" }, { status: 400 });
      if (
        sourceVoucherId &&
        !(await db
          .prepare("SELECT id FROM vouchers WHERE id=? AND board_id=?")
          .bind(sourceVoucherId, boardId)
          .first())
      )
        return json({ error: "source_voucher_not_found" }, { status: 400 });
      const postingId = id("ic");
      await db
        .prepare(
          "INSERT INTO intercompany_postings (id,board_id,source_entity,target_entity,reference,amount_minor,currency,period,status,elimination_required,source_voucher_id) VALUES (?,?,?,?,?,?,?,?,?,1,?)",
        )
        .bind(
          postingId,
          boardId,
          sourceEntity,
          targetEntity,
          reference,
          amount,
          String(value?.currency || "NOK").toUpperCase(),
          period,
          "prepared",
          sourceVoucherId,
        )
        .run();
      return json(
        {
          ok: true,
          action,
          postingId,
          status: "prepared",
          sourceVoucherId,
          requiresHumanApproval: true,
        },
        { status: 201 },
      );
    }
    if (action === "approve_intercompany") {
      const postingId = String(value?.postingId || "").trim();
      const posting = await db
        .prepare(
          "SELECT * FROM intercompany_postings WHERE id=? AND board_id=? AND status IN ('prepared','review')",
        )
        .bind(postingId, boardId)
        .first<Record<string, unknown>>();
      if (!posting)
        return json(
          { error: "intercompany_not_open_or_found" },
          { status: 409 },
        );
      const debitAccountId = String(value?.debitAccountId || "").trim(),
        creditAccountId = String(value?.creditAccountId || "").trim();
      if (
        !debitAccountId ||
        !creditAccountId ||
        debitAccountId === creditAccountId
      )
        return json(
          { error: "intercompany_accounts_required" },
          { status: 400 },
        );
      const accountRows = (
        await db
          .prepare(
            "SELECT id FROM ledger_accounts WHERE board_id=? AND active=1 AND id IN (?,?)",
          )
          .bind(boardId, debitAccountId, creditAccountId)
          .all()
      ).results;
      if (accountRows.length !== 2)
        return json(
          { error: "intercompany_account_not_found" },
          { status: 400 },
        );
      if (
        await db
          .prepare(
            "SELECT 1 FROM accounting_periods WHERE board_id=? AND period=? AND status='locked'",
          )
          .bind(boardId, posting.period)
          .first()
      )
        return json(
          { error: "period_locked", period: posting.period },
          { status: 409 },
        );
      const externalReference = `intercompany:${postingId}:target`;
      const existingVoucher = await db
        .prepare(
          "SELECT id,voucher_number FROM vouchers WHERE board_id=? AND external_reference=?",
        )
        .bind(boardId, externalReference)
        .first<{ id: string; voucher_number: number }>();
      if (existingVoucher) {
        await db
          .prepare(
            "UPDATE intercompany_postings SET status='mirrored',target_voucher_id=? WHERE id=? AND board_id=? AND status IN ('prepared','review')",
          )
          .bind(existingVoucher.id, postingId, boardId)
          .run();
        return json({
          ok: true,
          action,
          postingId,
          status: "mirrored",
          targetVoucherId: existingVoucher.id,
          targetVoucherNumber: Number(existingVoucher.voucher_number),
          idempotent: true,
          requiresHumanApproval: true,
        });
      }
      const voucherId = id("voucher");
      const amount = Number(posting.amount_minor || 0);
      if (!Number.isSafeInteger(amount) || amount <= 0)
        return json({ error: "intercompany_amount_invalid" }, { status: 409 });
      const statements = [
        db
          .prepare(
            "INSERT INTO voucher_sequences (board_id,next_number) SELECT ?,COALESCE(MAX(voucher_number),0)+1 FROM vouchers WHERE board_id=? ON CONFLICT(board_id) DO NOTHING",
          )
          .bind(boardId, boardId),
        db
          .prepare(
            "UPDATE voucher_sequences SET next_number=next_number+1,updated_at=datetime('now') WHERE board_id=?",
          )
          .bind(boardId),
        db
          .prepare(
            "INSERT INTO vouchers (id,board_id,voucher_number,voucher_date,period,description,source,status,external_reference,created_by) SELECT ?,?,next_number-1,?,?,?,?,?,?,? FROM voucher_sequences WHERE board_id=?",
          )
          .bind(
            voucherId,
            boardId,
            `${posting.period}-01`,
            posting.period,
            `Speilpostering ${String(posting.reference).slice(0, 160)}`,
            "intercompany_mirror",
            "posted",
            externalReference,
            authorization.userId || "authorized-user",
            boardId,
          ),
        db
          .prepare(
            "INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            id("line"),
            voucherId,
            debitAccountId,
            `Speilpostering ${String(posting.source_entity)} → ${String(posting.target_entity)}`,
            amount,
            0,
            null,
          ),
        db
          .prepare(
            "INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            id("line"),
            voucherId,
            creditAccountId,
            `Speilpostering ${String(posting.target_entity)} → ${String(posting.source_entity)}`,
            0,
            amount,
            null,
          ),
      ];
      await db.batch(statements);
      const created = await db
        .prepare(
          "SELECT voucher_number FROM vouchers WHERE id=? AND board_id=?",
        )
        .bind(voucherId, boardId)
        .first<{ voucher_number: number }>();
      if (!created)
        return json(
          { error: "intercompany_voucher_not_created" },
          { status: 503 },
        );
      await db
        .prepare(
          "UPDATE intercompany_postings SET status='mirrored',target_voucher_id=? WHERE id=? AND board_id=? AND status IN ('prepared','review')",
        )
        .bind(voucherId, postingId, boardId)
        .run();
      await recordAudit(db, {
        boardId,
        action: "intercompany_mirrored",
        entityType: "intercompany_posting",
        entityId: postingId,
        userId: authorization.userId || undefined,
        details: {
          targetVoucherId: voucherId,
          targetVoucherNumber: created.voucher_number,
          debitAccountId,
          creditAccountId,
          amountMinor: amount,
          requiresHumanApproval: true,
        },
      });
      return json(
        {
          ok: true,
          action,
          postingId,
          status: "mirrored",
          targetVoucherId: voucherId,
          targetVoucherNumber: Number(created.voucher_number),
          requiresHumanApproval: true,
        },
        { status: 201 },
      );
    }
    if (action === "create_invoice") {
      let invoiceNumber = String(value?.invoiceNumber || "").trim();
      const issueDate = String(value?.issueDate || "").trim(),
        dueDate = String(value?.dueDate || "").trim() || null,
        description = String(value?.description || "").trim(),
        amountMinor = Number(value?.amountMinor || 0),
        vatMinor = Number(value?.vatMinor || 0);
      const accountId = String(value?.accountId || "").trim();
      if (
        !accountId ||
        !validIsoDate(issueDate) ||
        (dueDate && (!validIsoDate(dueDate) || dueDate < issueDate))
      )
        return json({ error: "invoice_fields_invalid" }, { status: 400 });
      if (invoiceNumber && (invoiceNumber.length > 60 || /[\r\n]/.test(invoiceNumber)))
        return json(
          { error: "invoice_number_invalid", detail: "Fakturanummeret kan ikke inneholde linjeskift og kan være opptil 60 tegn." },
          { status: 400 },
        );
      if (invoiceNumber) {
        const duplicate = await db
          .prepare(
            "SELECT id,status FROM sales_invoices WHERE board_id=? AND invoice_number=? LIMIT 1",
          )
          .bind(boardId, invoiceNumber)
          .first<{ id: string; status: string }>();
        if (duplicate)
          return json(
            {
              error: "invoice_number_exists",
              detail: `Fakturanummeret er allerede brukt (${invoiceNumber}). Velg et annet nummer eller la feltet stå tomt for automatisk nummerering.`,
              invoiceId: duplicate.id,
              status: duplicate.status,
            },
            { status: 409 },
          );
      }
      if (
        !(await db
          .prepare(
            "SELECT id FROM crm_accounts WHERE id=? AND board_id=? AND stage NOT IN ('lost')",
          )
          .bind(accountId, boardId)
          .first())
      )
        return json({ error: "customer_not_found" }, { status: 400 });
      const suppliedLines = Array.isArray(value?.lines)
        ? (value.lines as Record<string, unknown>[])
        : [];
      const rawLines = suppliedLines.length
        ? suppliedLines
        : [
            {
              description,
              quantity: 1,
              unitPriceMinor: amountMinor,
              vatRate: amountMinor > 0 ? (vatMinor / amountMinor) * 100 : 0,
              vatCode: vatMinor ? "3" : null,
              accountId: null,
            },
          ];
      if (!rawLines.length || rawLines.length > 100)
        return json({ error: "invoice_lines_invalid" }, { status: 400 });
      const lines: {
        lineNumber: number;
        description: string;
        quantity: number;
        unitPriceMinor: number;
        vatRate: number;
        vatCode: string | null;
        netMinor: number;
        vatMinor: number;
        totalMinor: number;
        accountId: string | null;
      }[] = [];
      for (let index = 0; index < rawLines.length; index += 1) {
        const line = rawLines[index];
        const lineDescription = String(line.description || "").trim();
        const quantity = Number(line.quantity ?? 1);
        const unitPriceMinor = Number(
          line.unitPriceMinor ?? line.unit_price_minor ?? 0,
        );
        const vatRate = Number(line.vatRate ?? line.vat_rate ?? 0);
        const vatCode = line.vatCode
          ? String(line.vatCode).trim()
          : vatRate === 12
            ? "3_12"
            : vatRate === 15
              ? "3_15"
              : vatRate === 25
                ? "3"
                : null;
        const lineAccountId =
          String(line.accountId ?? line.account_id ?? "").trim() || null;
        if (
          !lineDescription ||
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          quantity > 100000 ||
          !Number.isSafeInteger(unitPriceMinor) ||
          unitPriceMinor < 0 ||
          ![0, 12, 15, 25].includes(vatRate)
        )
          return json(
            { error: "invoice_line_invalid", lineNumber: index + 1 },
            { status: 400 },
          );
        if (
          lineAccountId &&
          !(await db
            .prepare(
              "SELECT id FROM ledger_accounts WHERE id=? AND board_id=? AND active=1",
            )
            .bind(lineAccountId, boardId)
            .first())
        )
          return json(
            { error: "invoice_line_account_not_found", lineNumber: index + 1 },
            { status: 400 },
          );
        const netMinor = Math.round(quantity * unitPriceMinor);
        const lineVatMinor = Math.round((netMinor * vatRate) / 100);
        if (netMinor <= 0)
          return json(
            { error: "invoice_line_amount_invalid", lineNumber: index + 1 },
            { status: 400 },
          );
        lines.push({
          lineNumber: index + 1,
          description: lineDescription,
          quantity,
          unitPriceMinor,
          vatRate,
          vatCode,
          netMinor,
          vatMinor: lineVatMinor,
          totalMinor: netMinor + lineVatMinor,
          accountId: lineAccountId,
        });
      }
      const invoiceDescription =
        description ||
        lines
          .map((line) => line.description)
          .join(", ")
          .slice(0, 200);
      const invoiceAmountMinor = lines.reduce(
        (sum, line) => sum + line.netMinor,
        0,
      );
      const invoiceVatMinor = lines.reduce(
        (sum, line) => sum + line.vatMinor,
        0,
      );
      const totalMinor = invoiceAmountMinor + invoiceVatMinor;
      const invoiceId = id("sinv");
      const statements = [] as D1PreparedStatement[];
      if (!invoiceNumber) {
        const invoiceYear = Number(issueDate.slice(0, 4));
        statements.push(
          db.prepare("INSERT INTO sales_invoice_sequences (board_id,invoice_year,next_number) SELECT ?,?,COALESCE(MAX(CAST(substr(invoice_number,6) AS INTEGER)),0)+1 FROM sales_invoices WHERE board_id=? AND invoice_number GLOB ? ON CONFLICT(board_id,invoice_year) DO NOTHING").bind(boardId, invoiceYear, boardId, `${invoiceYear}-[0-9]*`),
          db.prepare("UPDATE sales_invoice_sequences SET next_number=MAX(next_number,COALESCE((SELECT MAX(CAST(substr(invoice_number,6) AS INTEGER)) FROM sales_invoices WHERE board_id=? AND invoice_number GLOB ?),0)+1),updated_at=datetime('now') WHERE board_id=? AND invoice_year=?").bind(boardId, `${invoiceYear}-[0-9]*`, boardId, invoiceYear),
          db.prepare("UPDATE sales_invoice_sequences SET next_number=next_number+1,updated_at=datetime('now') WHERE board_id=? AND invoice_year=?").bind(boardId, invoiceYear),
          db.prepare("INSERT INTO sales_invoices (id,board_id,account_id,invoice_number,issue_date,due_date,description,amount_minor,vat_minor,total_minor,currency,status,source,external_status) SELECT ?,?,?,printf('%04d-%05d',invoice_year,next_number-1),?,?,?,?,?,?, 'NOK','draft','manual','not_configured' FROM sales_invoice_sequences WHERE board_id=? AND invoice_year=?").bind(invoiceId, boardId, accountId, issueDate, dueDate, invoiceDescription, invoiceAmountMinor, invoiceVatMinor, totalMinor, boardId, invoiceYear),
        );
      } else {
        statements.push(
          db.prepare("INSERT INTO sales_invoices (id,board_id,account_id,invoice_number,issue_date,due_date,description,amount_minor,vat_minor,total_minor,currency,status,source,external_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'NOK','draft','manual','not_configured')").bind(invoiceId, boardId, accountId, invoiceNumber, issueDate, dueDate, invoiceDescription, invoiceAmountMinor, invoiceVatMinor, totalMinor),
        );
      }
      lines.forEach((line) =>
        statements.push(
          db
            .prepare(
              "INSERT INTO sales_invoice_lines (id,board_id,sales_invoice_id,line_number,description,quantity,unit_price_minor,vat_rate,vat_code,net_minor,vat_minor,total_minor,account_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              id("sinvline"),
              boardId,
              invoiceId,
              line.lineNumber,
              line.description,
              line.quantity,
              line.unitPriceMinor,
              line.vatRate,
              line.vatCode,
              line.netMinor,
              line.vatMinor,
              line.totalMinor,
              line.accountId,
            ),
        ),
      );
      await db.batch(statements);
      const createdInvoice = await db.prepare("SELECT invoice_number FROM sales_invoices WHERE id=? AND board_id=?").bind(invoiceId, boardId).first<{ invoice_number: string }>();
      if (!createdInvoice) return json({ error: "invoice_created_without_number" }, { status: 503 });
      invoiceNumber = createdInvoice.invoice_number;
      await recordAudit(db, {
        boardId,
        action: "sales_invoice_created",
        entityType: "sales_invoice",
        entityId: invoiceId,
        userId: authorization.userId || undefined,
        details: {
          status: "draft",
          lineCount: lines.length,
          amountMinor: invoiceAmountMinor,
          vatMinor: invoiceVatMinor,
          externalDelivery: "not_configured",
          invoiceNumber,
          numbering: value?.invoiceNumber ? "provided" : "atomic_year_sequence",
        },
      });
      return json(
        {
          ok: true,
          action,
          invoiceId,
          invoiceNumber,
          status: "draft",
          amountMinor: invoiceAmountMinor,
          vatMinor: invoiceVatMinor,
          totalMinor,
          lineCount: lines.length,
          externalDelivery: "not_configured",
        },
        { status: 201 },
      );
    }
    if (action === "create_recurring_template") {
      const accountId = String(value?.accountId || "").trim();
      const name = String(value?.name || "").trim();
      const description = String(value?.description || "").trim();
      const prefix = (String(value?.invoiceNumberPrefix || "RE").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20) || "RE");
      const interval = String(value?.interval || "month");
      const nextIssueDate = String(value?.nextIssueDate || "").trim();
      const quantity = Number(value?.quantity ?? 1);
      const unitPriceMinor = asMinor(value?.unitPriceMinor);
      const vatRate = Number(value?.vatRate ?? 25);
      const dueDays = Number(value?.dueDays ?? 14);
      if (!accountId || !name || !description || !validIsoDate(nextIssueDate) || !["month", "quarter", "year"].includes(interval) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || unitPriceMinor === null || unitPriceMinor <= 0 || ![0, 12, 15, 25].includes(vatRate) || !Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365)
        return json({ error: "recurring_template_fields_invalid", detail: "Fyll ut kunde, navn, dato, beløp og gyldig intervall." }, { status: 400 });
      if (!(await db.prepare("SELECT id FROM crm_accounts WHERE id=? AND board_id=? AND stage NOT IN ('lost')").bind(accountId, boardId).first())) return json({ error: "customer_not_found" }, { status: 400 });
      const templateId = id("rit");
      await db.prepare("INSERT INTO recurring_invoice_templates (id,board_id,account_id,name,invoice_number_prefix,description,quantity,unit_price_minor,vat_rate,vat_code,interval,next_issue_date,due_days,status,currency,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?, 'active','NOK',?)").bind(templateId, boardId, accountId, name, prefix, description, quantity, unitPriceMinor, vatRate, vatRate === 12 ? "3_12" : vatRate === 15 ? "3_15" : vatRate === 25 ? "3" : null, interval, nextIssueDate, dueDays, authorization.userId || "api").run();
      await recordAudit(db, { boardId, action: "recurring_invoice_template_created", entityType: "recurring_invoice_template", entityId: templateId, userId: authorization.userId || undefined, details: { interval, nextIssueDate, externalDelivery: "not_configured" } });
      return json({ ok: true, action, templateId, status: "active", nextIssueDate, externalDelivery: "not_configured" }, { status: 201 });
    }
    if (action === "update_recurring_template_status") {
      const templateId = String(value?.templateId || "").trim();
      const status = String(value?.status || "");
      if (!templateId || !["active", "paused", "cancelled"].includes(status)) return json({ error: "recurring_template_status_invalid" }, { status: 400 });
      const result = await db.prepare("UPDATE recurring_invoice_templates SET status=?,updated_at=datetime('now') WHERE id=? AND board_id=? AND status<>?").bind(status, templateId, boardId, status).run();
      if (!result.meta?.changes) return json({ error: "recurring_template_not_found_or_unchanged" }, { status: 409 });
      await recordAudit(db, { boardId, action: "recurring_invoice_template_status_changed", entityType: "recurring_invoice_template", entityId: templateId, userId: authorization.userId || undefined, details: { status } });
      return json({ ok: true, action, templateId, status });
    }
    if (action === "generate_recurring_invoice") {
      const templateId = String(value?.templateId || "").trim();
      const template = await db.prepare("SELECT * FROM recurring_invoice_templates WHERE id=? AND board_id=? AND status='active'").bind(templateId, boardId).first<Record<string, unknown>>();
      if (!template) return json({ error: "recurring_template_not_active_or_found" }, { status: 409 });
      const issueDate = String(value?.issueDate || template.next_issue_date || "").trim();
      if (!validIsoDate(issueDate)) return json({ error: "recurring_issue_date_invalid" }, { status: 400 });
      const existingGeneration = await db.prepare("SELECT g.id,g.sales_invoice_id,i.invoice_number FROM recurring_invoice_generations g JOIN sales_invoices i ON i.id=g.sales_invoice_id WHERE g.template_id=? AND g.board_id=? AND g.issue_date=?").bind(templateId, boardId, issueDate).first<Record<string, unknown>>();
      if (existingGeneration) return json({ ok: true, action, templateId, generationId: existingGeneration.id, invoiceId: existingGeneration.sales_invoice_id, invoiceNumber: existingGeneration.invoice_number, idempotent: true, status: "draft" });
      const quantity = Number(template.quantity || 1), unitPriceMinor = Number(template.unit_price_minor || 0), vatRate = Number(template.vat_rate || 0), netMinor = Math.round(quantity * unitPriceMinor), vatMinor = Math.round(netMinor * vatRate / 100), totalMinor = netMinor + vatMinor;
      if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor <= 0 || !Number.isFinite(quantity) || quantity <= 0 || ![0, 12, 15, 25].includes(vatRate)) return json({ error: "recurring_template_values_invalid" }, { status: 409 });
      const invoiceNumber = `${String(template.invoice_number_prefix || "RE")}-${issueDate.replace(/-/g, "")}`;
      if (await db.prepare("SELECT id FROM sales_invoices WHERE board_id=? AND invoice_number=?").bind(boardId, invoiceNumber).first()) return json({ error: "recurring_invoice_number_exists", detail: "Endre fakturanummerprefiks eller bruk en annen kjøredato." }, { status: 409 });
      const invoiceId = id("sinv"), lineId = id("sinvline"), generationId = id("rig");
      const dueDate = new Date(`${issueDate}T00:00:00Z`); dueDate.setUTCDate(dueDate.getUTCDate() + Number(template.due_days || 14));
      const dueDateText = dueDate.toISOString().slice(0, 10);
      const nextDate = nextRecurringDate(issueDate, String(template.interval));
      if (!nextDate) return json({ error: "recurring_interval_invalid" }, { status: 409 });
      await db.batch([
        db.prepare("INSERT INTO sales_invoices (id,board_id,account_id,invoice_number,issue_date,due_date,description,amount_minor,vat_minor,total_minor,currency,status,source,external_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'NOK','draft','subscription','not_configured')").bind(invoiceId, boardId, template.account_id, invoiceNumber, issueDate, dueDateText, template.description, netMinor, vatMinor, totalMinor),
        db.prepare("INSERT INTO sales_invoice_lines (id,board_id,sales_invoice_id,line_number,description,quantity,unit_price_minor,vat_rate,vat_code,net_minor,vat_minor,total_minor,account_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(lineId, boardId, invoiceId, 1, template.description, quantity, unitPriceMinor, vatRate, template.vat_code || null, netMinor, vatMinor, totalMinor, null),
        db.prepare("INSERT INTO recurring_invoice_generations (id,board_id,template_id,issue_date,sales_invoice_id,created_by) VALUES (?,?,?,?,?,?)").bind(generationId, boardId, templateId, issueDate, invoiceId, authorization.userId || "api"),
        db.prepare("UPDATE recurring_invoice_templates SET next_issue_date=?,updated_at=datetime('now') WHERE id=? AND board_id=? AND status='active'").bind(nextDate, templateId, boardId),
      ]);
      await recordAudit(db, { boardId, action: "recurring_invoice_generated", entityType: "sales_invoice", entityId: invoiceId, userId: authorization.userId || undefined, details: { templateId, generationId, issueDate, nextIssueDate: nextDate, externalDelivery: "not_configured" } });
      return json({ ok: true, action, templateId, generationId, invoiceId, invoiceNumber, status: "draft", issueDate, dueDate: dueDateText, nextIssueDate: nextDate, totalMinor, externalDelivery: "not_configured" }, { status: 201 });
    }
    if (action === "review_invoice") {
      const invoiceId = String(value?.invoiceId || "").trim();
      const result = await db
        .prepare(
          "UPDATE sales_invoices SET status='review',updated_at=datetime('now') WHERE id=? AND board_id=? AND status='draft'",
        )
        .bind(invoiceId, boardId)
        .run();
      if (!result.meta?.changes)
        return json({ error: "invoice_not_draft_or_found" }, { status: 409 });
      await recordAudit(db, {
        boardId,
        action: "sales_invoice_reviewed",
        entityType: "sales_invoice",
        entityId: invoiceId,
        userId: authorization.userId || undefined,
        details: { status: "review" },
      });
      return json({
        ok: true,
        action,
        invoiceId,
        status: "review",
        requiresHumanApproval: true,
      });
    }
    if (action === "approve_invoice") {
      const invoiceId = String(value?.invoiceId || "").trim(),
        approver = authorization.userId || String(value?.approvedBy || "api");
      const invoice = await db
        .prepare(
          "SELECT i.*,a.company_name,a.org_number customer_org_number,COALESCE(p.customer_type,'business') customer_type,p.address_line1 customer_address_line1,p.postal_code customer_postal_code,p.city customer_city,p.country_code customer_country_code,p.email customer_email FROM sales_invoices i LEFT JOIN crm_accounts a ON a.id=i.account_id LEFT JOIN customer_invoice_profiles p ON p.board_id=i.board_id AND p.account_id=i.account_id WHERE i.id=? AND i.board_id=? AND i.status='review'",
        )
        .bind(invoiceId, boardId)
        .first<Record<string, unknown>>();
      const seller = await db
        .prepare(
          "SELECT p.*,b.name board_name,b.org_number board_org_number FROM boards b LEFT JOIN accounting_profiles p ON p.board_id=b.id WHERE b.id=?",
        )
        .bind(boardId)
        .first<Record<string, unknown>>();
      const invoiceLines = (
        await db
          .prepare(
            "SELECT line_number,description,quantity,unit_price_minor,vat_rate,vat_code,net_minor,vat_minor,total_minor FROM sales_invoice_lines WHERE board_id=? AND sales_invoice_id=? ORDER BY line_number",
          )
          .bind(boardId, invoiceId)
          .all()
      ).results as Record<string, unknown>[];
      if (!invoice)
        return json(
          { error: "invoice_not_in_review_or_found" },
          { status: 409 },
        );
      const requiredSeller = [
        seller?.legal_name || seller?.board_name,
        seller?.org_number || seller?.board_org_number,
        seller?.address_line1,
        seller?.postal_code,
        seller?.city,
        seller?.bank_account,
      ];
      const requiresOrg =
        String(invoice.customer_type || "business") !== "private";
      const requiredCustomer = [
        invoice.company_name,
        requiresOrg ? invoice.customer_org_number : "ok",
        invoice.customer_address_line1,
        invoice.customer_postal_code,
        invoice.customer_city,
      ];
      if (
        requiredSeller.some((item) => !String(item || "").trim()) ||
        requiredCustomer.some((item) => !String(item || "").trim()) ||
        !invoiceLines.length
      )
        return json(
          {
            error: "invoice_profile_incomplete",
            detail:
              "Fyll ut virksomhets- og kundeadresse før fakturaen godkjennes.",
            setupView: "invoice-setup",
          },
          { status: 409 },
        );
      const document = {
        schemaVersion: "styr.sales-invoice.v1",
        invoice: {
          id: invoice.id,
          number: invoice.invoice_number,
          issueDate: invoice.issue_date,
          dueDate: invoice.due_date,
          description: invoice.description,
          currency: invoice.currency,
          status: "approved",
          netMinor: invoice.amount_minor,
          vatMinor: invoice.vat_minor,
          totalMinor: invoice.total_minor,
        },
        seller: {
          legalName: seller?.legal_name || seller?.board_name,
          orgNumber: seller?.org_number || seller?.board_org_number,
          addressLine1: seller?.address_line1,
          postalCode: seller?.postal_code,
          city: seller?.city,
          countryCode: seller?.country_code || "NO",
          email: seller?.email,
          bankAccount: seller?.bank_account,
          vatRegistered: Boolean(seller?.vat_registered),
        },
        customer: {
          name: invoice.company_name,
          type: invoice.customer_type || "business",
          orgNumber: invoice.customer_org_number,
          addressLine1: invoice.customer_address_line1,
          postalCode: invoice.customer_postal_code,
          city: invoice.customer_city,
          countryCode: invoice.customer_country_code || "NO",
          email: invoice.customer_email,
        },
        lines: invoiceLines,
      };
      const payload = JSON.stringify(document);
      const checksum = await sha256(payload);
      const existing = await db
        .prepare(
          "SELECT id,checksum,version FROM sales_invoice_documents WHERE board_id=? AND sales_invoice_id=? AND status='approved' ORDER BY version DESC LIMIT 1",
        )
        .bind(boardId, invoiceId)
        .first<Record<string, unknown>>();
      const version = Number(existing?.version || 0) + 1;
      const documentId = id("invdoc");
      const result = (await db.batch([
        db
          .prepare(
            "UPDATE sales_invoices SET status='approved',approved_by=?,approved_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND board_id=? AND status='review'",
          )
          .bind(approver, invoiceId, boardId),
        db
          .prepare(
            "INSERT INTO sales_invoice_documents (id,board_id,sales_invoice_id,version,status,payload,checksum,created_by) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            documentId,
            boardId,
            invoiceId,
            version,
            "approved",
            payload,
            checksum,
            approver,
          ),
      ])) as Array<{ meta?: { changes?: number } }>;
      if (!result?.[0]?.meta?.changes)
        return json(
          { error: "invoice_not_in_review_or_found" },
          { status: 409 },
        );
      await recordAudit(db, {
        boardId,
        action: "sales_invoice_approved",
        entityType: "sales_invoice",
        entityId: invoiceId,
        userId: authorization.userId || undefined,
        details: {
          status: "approved",
          externalDelivery: "not_configured",
          documentId,
          documentVersion: version,
          documentChecksum: checksum,
          customerType: invoice.customer_type || "business",
        },
      });
      return json({
        ok: true,
        action,
        invoiceId,
        status: "approved",
        documentId,
        documentVersion: version,
        documentChecksum: checksum,
        externalDelivery: "not_configured",
      });
    }
    if (action === "create_credit_note") {
      const invoiceId = String(value?.invoiceId || "").trim(),
        number = String(value?.creditNoteNumber || "").trim(),
        issueDate = String(value?.issueDate || "").trim(),
        description = String(value?.description || "").trim();
      const amountMinor = asMinor(value?.amountMinor),
        vatMinor = asMinor(value?.vatMinor || 0);
      if (
        !invoiceId ||
        !number ||
        !validIsoDate(issueDate) ||
        !description ||
        amountMinor === null ||
        amountMinor <= 0 ||
        vatMinor === null ||
        vatMinor < 0
      )
        return json({ error: "credit_note_fields_invalid" }, { status: 400 });
      const invoice = await db
        .prepare(
          "SELECT i.total_minor,i.issue_date,i.status,COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=i.id AND c.board_id=i.board_id AND c.status NOT IN ('cancelled')),0) reserved_credit_minor FROM sales_invoices i WHERE i.id=? AND i.board_id=? AND i.status NOT IN ('draft','cancelled')",
        )
        .bind(invoiceId, boardId)
        .first<Record<string, unknown>>();
      if (!invoice)
        return json(
          { error: "invoice_not_found_or_not_issued" },
          { status: 409 },
        );
      if (String(invoice.issue_date || "") && issueDate < String(invoice.issue_date))
        return json(
          { error: "credit_note_before_invoice", detail: "Kreditnotadato kan ikke være før fakturadato." },
          { status: 400 },
        );
      const totalMinor = amountMinor + vatMinor;
      const creditableMinor = Math.max(
        0,
        Number(invoice.total_minor || 0) -
          Number(invoice.reserved_credit_minor || 0),
      );
      if (totalMinor > creditableMinor)
        return json(
          {
            error: "credit_note_exceeds_remaining",
            invoiceTotalMinor: Number(invoice.total_minor || 0),
            creditableMinor,
          },
          { status: 409 },
        );
      const creditId = id("credit");
      const inserted = await db
        .prepare(
          "INSERT INTO sales_credit_notes (id,board_id,sales_invoice_id,credit_note_number,issue_date,description,amount_minor,vat_minor,total_minor,status,created_by) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ? <= (SELECT i.total_minor-COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=i.id AND c.board_id=i.board_id AND c.status NOT IN ('cancelled')),0) FROM sales_invoices i WHERE i.id=? AND i.board_id=? AND i.status NOT IN ('draft','cancelled'))",
        )
        .bind(
          creditId,
          boardId,
          invoiceId,
          number,
          issueDate,
          description,
          amountMinor,
          vatMinor,
          totalMinor,
          "draft",
          authorization.userId || "service",
          totalMinor,
          invoiceId,
          boardId,
        )
        .run();
      if (!inserted.meta?.changes) {
        const latest = await db
          .prepare(
            "SELECT MAX(0,i.total_minor-COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=i.id AND c.board_id=i.board_id AND c.status NOT IN ('cancelled')),0)) creditable_minor FROM sales_invoices i WHERE i.id=? AND i.board_id=?",
          )
          .bind(invoiceId, boardId)
          .first<Record<string, unknown>>();
        return json(
          {
            error: "credit_note_exceeds_remaining",
            creditableMinor: Number(latest?.creditable_minor || 0),
          },
          { status: 409 },
        );
      }
      await recordAudit(db, {
        boardId,
        action: "sales_credit_note_created",
        entityType: "sales_credit_note",
        entityId: creditId,
        userId: authorization.userId || undefined,
        details: {
          invoiceId,
          totalMinor,
          status: "draft",
          creditableMinorAfter: creditableMinor - totalMinor,
        },
      });
      return json(
        {
          ok: true,
          action,
          creditNoteId: creditId,
          status: "draft",
          totalMinor,
          creditableMinorAfter: creditableMinor - totalMinor,
        },
        { status: 201 },
      );
    }
    if (action === "review_credit_note") {
      const creditNoteId = String(value?.creditNoteId || "").trim();
      const result = await db
        .prepare(
          "UPDATE sales_credit_notes SET status='review' WHERE id=? AND board_id=? AND status='draft'",
        )
        .bind(creditNoteId, boardId)
        .run();
      if (!result.meta?.changes)
        return json(
          { error: "credit_note_not_draft_or_found" },
          { status: 409 },
        );
      return json({
        ok: true,
        action,
        creditNoteId,
        status: "review",
        requiresHumanApproval: true,
      });
    }
    if (action === "approve_credit_note") {
      const creditNoteId = String(value?.creditNoteId || "").trim();
      const result = await db
        .prepare(
          "UPDATE sales_credit_notes SET status='approved',approved_by=?,approved_at=datetime('now') WHERE id=? AND board_id=? AND status='review'",
        )
        .bind(authorization.userId || "service", creditNoteId, boardId)
        .run();
      if (!result.meta?.changes)
        return json(
          { error: "credit_note_not_in_review_or_found" },
          { status: 409 },
        );
      return json({
        ok: true,
        action,
        creditNoteId,
        status: "approved",
        requiresControlledPosting: true,
      });
    }
    if (action === "record_invoice_payment") {
      const invoiceId = String(value?.invoiceId || "").trim(),
        paymentReference = String(value?.paymentReference || "").trim();
      const requestedAmount =
        value?.amountMinor === undefined || value?.amountMinor === ""
          ? null
          : asMinor(value?.amountMinor);
      if (!paymentReference)
        return json({ error: "payment_reference_required" }, { status: 400 });
      if (
        requestedAmount !== null &&
        (requestedAmount === null || requestedAmount <= 0)
      )
        return json({ error: "payment_amount_invalid" }, { status: 400 });
      const invoice = await db
        .prepare(
          "SELECT i.total_minor,i.paid_minor,i.status,COALESCE((SELECT SUM(c.total_minor) FROM sales_credit_notes c WHERE c.sales_invoice_id=i.id AND c.board_id=i.board_id AND c.status='posted'),0) credited_minor FROM sales_invoices i WHERE i.id=? AND i.board_id=?",
        )
        .bind(invoiceId, boardId)
        .first<Record<string, unknown>>();
      if (!invoice)
        return json({ error: "invoice_not_payable_or_found" }, { status: 409 });
      const total = Number(invoice.total_minor || 0),
        alreadyPaid = Number(invoice.paid_minor || 0),
        credited = Number(invoice.credited_minor || 0),
        remaining = Math.max(0, total - alreadyPaid - credited);
      const existingPayment = await db
        .prepare(
          "SELECT id,amount_minor,status FROM invoice_payments WHERE board_id=? AND entity_type='sales_invoice' AND entity_id=? AND bank_transaction_id IS NULL AND payment_reference=? AND status<>'reversed' LIMIT 1",
        )
        .bind(boardId, invoiceId, paymentReference)
        .first<Record<string, unknown>>();
      if (existingPayment) {
        const existingAmount = Number(existingPayment.amount_minor || 0);
        if (requestedAmount !== null && existingAmount !== requestedAmount)
          return json(
            {
              error: "payment_reference_conflict",
              detail:
                "Betalingsreferansen er allerede brukt med et annet beløp.",
              existingPaymentId: String(existingPayment.id),
              existingAmountMinor: existingAmount,
            },
            { status: 409 },
          );
        return json({
          ok: true,
          action,
          invoiceId,
          status: String(invoice.status),
          paymentSource: "manual",
          paymentId: String(existingPayment.id),
          amountMinor: existingAmount,
          paidMinor: alreadyPaid,
          remainingMinor: remaining,
          idempotent: true,
        });
      }
      if (!["approved", "sent", "overdue"].includes(String(invoice.status)))
        return json({ error: "invoice_not_payable_or_found" }, { status: 409 });
      const paymentAmount = requestedAmount ?? remaining;
      if (paymentAmount <= 0 || paymentAmount > remaining)
        return json(
          {
            error: "payment_exceeds_remaining",
            remainingMinor: remaining,
            creditedMinor: credited,
          },
          { status: 409 },
        );
      const nextPaid = alreadyPaid + paymentAmount,
        nextStatus = nextPaid + credited >= total ? "paid" : invoice.status;
      const paymentId = id("ipmt");
      await db.batch([
        db
          .prepare(
            "INSERT INTO invoice_payments (id,board_id,entity_type,entity_id,amount_minor,payment_reference,status,recorded_by) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            paymentId,
            boardId,
            "sales_invoice",
            invoiceId,
            paymentAmount,
            paymentReference,
            "recorded",
            authorization.userId || "service",
          ),
        db
          .prepare(
            "UPDATE sales_invoices SET paid_minor=?,status=?,paid_at=CASE WHEN ?=? THEN datetime('now') ELSE paid_at END,payment_reference=?,updated_at=datetime('now') WHERE id=? AND board_id=?",
          )
          .bind(
            nextPaid,
            nextStatus,
            nextPaid,
            total,
            paymentReference,
            invoiceId,
            boardId,
          ),
      ]);
      await recordAudit(db, {
        boardId,
        action: "sales_invoice_payment_recorded",
        entityType: "sales_invoice",
        entityId: invoiceId,
        userId: authorization.userId || undefined,
        details: {
          status: nextStatus,
          paymentSource: "manual",
          paymentId,
          amountMinor: paymentAmount,
          remainingMinor: total - nextPaid,
        },
      });
      return json({
        ok: true,
        action,
        invoiceId,
        status: nextStatus,
        paymentSource: "manual",
        paymentId,
        amountMinor: paymentAmount,
        paidMinor: nextPaid,
        remainingMinor: total - nextPaid,
      });
    }
    if (action === "approve_note") {
      const noteId = String(value?.noteId || "");
      const result = await db
        .prepare(
          "UPDATE statutory_notes SET status='approved',approved_by=?,approved_at=datetime('now') WHERE id=? AND board_id=? AND status IN ('draft','review')",
        )
        .bind(value?.approvedBy || "api", noteId, boardId)
        .run();
      if (!result.meta?.changes)
        return json({ error: "note_not_open_or_found" }, { status: 409 });
      return json({
        ok: true,
        action,
        noteId,
        status: "approved",
        externalFiling: "not_configured",
      });
    }
    if (action === "prepare_note") {
      const period = String(value?.period || "").trim();
      const noteType = String(value?.noteType || "remuneration").trim();
      if (
        !/^\d{4}(?:-(0[1-9]|1[0-2]))?$/.test(period) ||
        !["remuneration", "fte", "related_party_loans"].includes(noteType)
      )
        return json({ error: "note_fields_invalid" }, { status: 400 });
      const payrollPeriod = period.length === 7 ? period : `${period}%`;
      const [people, payroll, equity, grants] = await Promise.all([
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM people WHERE board_id=? AND employment_status='active'",
          )
          .bind(boardId)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT COUNT(*) AS count,COALESCE(SUM(gross_minor),0) AS gross_minor,COALESCE(SUM(employer_cost_minor),0) AS employer_cost_minor FROM payroll_runs WHERE board_id=? AND period LIKE ?",
          )
          .bind(boardId, payrollPeriod)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT COUNT(*) AS holders,COALESCE(SUM(shares),0) AS shares FROM equity_holders WHERE board_id=?",
          )
          .bind(boardId)
          .first<Record<string, unknown>>(),
        db
          .prepare(
            "SELECT COUNT(*) AS count,COALESCE(SUM(granted_shares),0) AS granted_shares FROM equity_grants WHERE board_id=? AND (grant_date IS NULL OR substr(grant_date,1,4)<=?)",
          )
          .bind(boardId, period.slice(0, 4))
          .first<Record<string, unknown>>(),
      ]);
      const payload = {
        noteType,
        period,
        fte: Number(people?.count || 0),
        payrollGrossMinor: Number(payroll?.gross_minor || 0),
        employerCostMinor: Number(payroll?.employer_cost_minor || 0),
        equityShares: Number(equity?.shares || 0),
        equityHolderCount: Number(equity?.holders || 0),
        grantedSharesToDate: Number(grants?.granted_shares || 0),
        relatedPartyLoansMinor: 0,
        relatedPartyLoansSource: "not_configured",
        generatedBy: "styr.ing-rules",
        externalFiling: "not_configured",
      };
      const evidence = [
        { source: "people", period, rows: Number(people?.count || 0) },
        {
          source: "payroll_runs",
          period: period.length === 4 ? `through-${period}` : period,
          rows: Number(payroll?.count || 0),
        },
        {
          source: "equity_holders",
          period: "all_current",
          rows: Number(equity?.holders || 0),
        },
        {
          source: "equity_grants",
          period: `through-${period.slice(0, 4)}`,
          rows: Number(grants?.count || 0),
        },
        ...(noteType === "related_party_loans"
          ? [
              {
                source: "related_party_loans",
                period,
                rows: 0,
                status: "not_configured",
              },
            ]
          : []),
      ];
      const existing = await db
        .prepare(
          "SELECT id FROM statutory_notes WHERE board_id=? AND note_type=? AND period=? AND status IN ('draft','review') ORDER BY created_at DESC LIMIT 1",
        )
        .bind(boardId, noteType, period)
        .first<{ id: string }>();
      const noteId = existing?.id || id("note");
      if (existing)
        await db
          .prepare(
            "UPDATE statutory_notes SET status='review',payload=?,evidence_refs=?,approved_by=NULL,approved_at=NULL WHERE id=? AND board_id=?",
          )
          .bind(
            JSON.stringify(payload),
            JSON.stringify(evidence),
            noteId,
            boardId,
          )
          .run();
      else
        await db
          .prepare(
            "INSERT INTO statutory_notes (id,board_id,note_type,period,status,payload,evidence_refs) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            noteId,
            boardId,
            noteType,
            period,
            "review",
            JSON.stringify(payload),
            JSON.stringify(evidence),
          )
          .run();
      await recordAudit(db, {
        boardId,
        action: existing
          ? "statutory_note_refreshed"
          : "statutory_note_prepared",
        entityType: "statutory_note",
        entityId: noteId,
        userId: authorization.userId || undefined,
        details: {
          noteType,
          period,
          evidenceSources: evidence.map((item) => item.source),
          externalFiling: "not_configured",
        },
      });
      return json(
        {
          ok: true,
          action,
          noteId,
          noteType,
          period,
          status: "review",
          payload,
          evidence,
          externalFiling: "not_configured",
        },
        { status: existing ? 200 : 201 },
      );
    }
    const voucher =
      value?.voucher && typeof value.voucher === "object"
        ? (value.voucher as Record<string, unknown>)
        : value || {};
    const voucherDate = String(
      voucher.voucherDate || voucher.voucher_date || "",
    );
    const period = String(voucher.period || voucherDate.slice(0, 7));
    const description = String(voucher.description || "").trim();
    const externalReference = String(
      voucher.externalReference || voucher.external_reference || "",
    ).trim();
    const lines = Array.isArray(voucher.lines)
      ? (voucher.lines as Record<string, unknown>[])
      : [];
    if (
      !validIsoDate(voucherDate) ||
      !periodPattern.test(period) ||
      !description ||
      description.length > 200 ||
      externalReference.length > 120 ||
      lines.length < 2 ||
      lines.length > 100
    )
      return json(
        {
          error: "voucher_fields_invalid",
          required: ["voucherDate", "period", "description", "lines(min 2)"],
        },
        { status: 400 },
      );
    const locked = await db
      .prepare(
        "SELECT status FROM accounting_periods WHERE board_id=? AND period=? AND status='locked'",
      )
      .bind(boardId, period)
      .first();
    if (locked)
      return json({ error: "period_locked", period }, { status: 409 });
    let debit = 0;
    let credit = 0;
    const normalized = [] as {
      accountId: string;
      description: string;
      debit: number;
      credit: number;
      vatCode: string | null;
    }[];
    for (const line of lines) {
      const accountId = String(line.accountId || line.account_id || "");
      const lineDescription = String(line.description || "").trim();
      const d = asMinor(line.debitMinor ?? line.debit_minor ?? 0);
      const c = asMinor(line.creditMinor ?? line.credit_minor ?? 0);
      const vatCode =
        line.vatCode === undefined ||
        line.vatCode === null ||
        line.vatCode === ""
          ? null
          : String(line.vatCode).trim();
      if (
        !accountId ||
        !lineDescription ||
        lineDescription.length > 200 ||
        d === null ||
        c === null ||
        (d === 0 && c === 0) ||
        (d > 0 && c > 0) ||
        (vatCode !== null && !["0", "1", "1_12", "1_15", "3", "3_12", "3_15", "3C"].includes(vatCode))
      )
        return json({ error: "voucher_line_invalid" }, { status: 400 });
      debit += d;
      credit += c;
      normalized.push({
        accountId,
        description: lineDescription,
        debit: d,
        credit: c,
        vatCode,
      });
    }
    if (debit !== credit)
      return json(
        {
          error: "voucher_not_balanced",
          debitMinor: debit,
          creditMinor: credit,
        },
        { status: 422 },
      );
    const accountIds = [...new Set(normalized.map((line) => line.accountId))];
    const placeholders = accountIds.map(() => "?").join(",");
    const accountRows = (
      await db
        .prepare(
          `SELECT id FROM ledger_accounts WHERE board_id=? AND active=1 AND id IN (${placeholders})`,
        )
        .bind(boardId, ...accountIds)
        .all()
    ).results;
    if (accountRows.length !== accountIds.length)
      return json({ error: "account_not_found" }, { status: 400 });
    // Allocate and consume the per-board sequence in the same D1 batch as the
    // voucher and its lines. A failed batch rolls back the sequence increment,
    // so successful vouchers keep a gapless, collision-free number trail.
    const voucherId = id("voucher");
    const statements = [
      db
        .prepare(
          "INSERT INTO voucher_sequences (board_id,next_number) SELECT ?,COALESCE(MAX(voucher_number),0)+1 FROM vouchers WHERE board_id=? ON CONFLICT(board_id) DO NOTHING",
        )
        .bind(boardId, boardId),
      db
        .prepare(
          "UPDATE voucher_sequences SET next_number=next_number+1,updated_at=datetime('now') WHERE board_id=?",
        )
        .bind(boardId),
      db
        .prepare(
          "INSERT INTO vouchers (id,board_id,voucher_number,voucher_date,period,description,source,status,external_reference,created_by) SELECT ?,?,next_number-1,?,?,?,?,?,?,? FROM voucher_sequences WHERE board_id=?",
        )
        .bind(
          voucherId,
          boardId,
          voucherDate,
          period,
          description,
          String(voucher.source || "manual"),
          "posted",
          externalReference || null,
          String(voucher.createdBy || "api"),
          boardId,
        ),
    ];
    normalized.forEach((line) =>
      statements.push(
        db
          .prepare(
            "INSERT INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            id("line"),
            voucherId,
            line.accountId,
            line.description,
            line.debit,
            line.credit,
            line.vatCode,
          ),
      ),
    );
    await db.batch(statements);
    const created = await db
      .prepare("SELECT voucher_number FROM vouchers WHERE id=? AND board_id=?")
      .bind(voucherId, boardId)
      .first<{ voucher_number: number }>();
    if (!created)
      return json({ error: "voucher_created_without_number" }, { status: 503 });
    const voucherNumber = Number(created.voucher_number);
    await recordAudit(db, {
      boardId,
      action: "voucher_created",
      entityType: "voucher",
      entityId: voucherId,
      userId: authorization.userId || undefined,
      details: {
        period,
        voucherNumber,
        debitMinor: debit,
        creditMinor: credit,
        numbering: "atomic_sequence",
      },
    });
    return json(
      {
        ok: true,
        action: "create_voucher",
        boardId,
        voucherId,
        voucherNumber,
        period,
        debitMinor: debit,
        creditMinor: credit,
      },
      { status: 201 },
    );
  } catch (error) {
    return json(
      {
        error: "database_unavailable",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
};
