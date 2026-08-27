import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve('src/pages');
const failures = [];
let pageCount = 0;
let scriptCount = 0;
const componentContracts = {
  'src/components/EHFInboxQuick.astro': ['name="currency"', 'value="NOK"', 'name="documentRef"', 'name="supplierName"'],
  'src/components/ReceivablesPayablesQuick.astro': ['<section class="cash-control"', 'id="cash-payment-form"', 'id="collection-case-form"', 'cash-aging', 'aging-current', 'aging-30', 'aging-60', 'aging-old', 'payable-aging-current', 'payable-aging-30', 'payable-aging-60', 'payable-aging-old', 'renderAging', 'renderPayableAging', '<script is:inline>', '</script>', '<style>', '</style>'],
'src/components/ProductCatalogQuick.astro': ['id="product-catalog-form"', 'id="product-catalog-list"', 'id="product-edit-form"', 'product-edit-trigger', 'revenueAccountId', 'update_product', 'create_product', 'view=products', '<script is:inline>', '</script>', '<style>', '</style>'],
  'src/components/SalesInvoiceQuick.astro': ['data-invoice-action="create_invoice"', 'id="invoice-lines"', 'invoice-product-picker', 'revenueAccountId', 'view=products', 'id="invoice-draft-total"', 'updateInvoiceDraftTotal', 'update_invoice_draft', 'invoice-edit-draft', 'cancel_invoice_draft', 'invoice-cancel-draft', '<script is:inline>', '</script>'],
'src/components/BankReconciliationQuick.astro': ['data-bank-action="import_transactions"', 'id="bank-statement-file"', 'id="bank-import-preview"', 'parseBankCsv', 'renderBankImportPreview', '<script is:inline>', '</script>', '<style>', '</style>'],
  'src/components/VatPeriodQuick.astro': ['id="vat-periods"', 'id="vat-detail"', 'data-vat-detail', 'vatLoadDetail', 'view=detail', '<script is:inline>', '</script>', '<style>', '</style>'],
  'src/components/SupplierInvoiceQuick.astro': ['data-supplier-action="create_invoice"', 'data-supplier-action="approve_order"', 'supplier-approve-order', 'lineAccountId', 'data-supplier-line-account', 'default_expense_account_id', 'supplierRefreshLineAccounts', 'supplier-invoice-total', 'updateSupplierInvoiceTotal', '<script is:inline>', '</script>', '<style>', '</style>'],
  'src/components/AnnualAccountsQuick.astro': ['annual-approve-form', 'annual-summary', 'annualShowDetail', 'annual-detail', 'annualSummary', '<script is:inline>', '</script>', '<style>', '</style>'],
  'src/components/PayrollQuick.astro': ['payroll-draft-total', 'payroll-employer-hint', 'payroll-total-gross', 'payroll-total-net', 'payroll-total-employer', 'payroll-total-compliance', 'payrollTotalsMoney', 'loadPayrollTotals', 'payrollDraftTotals', 'data-payroll-action="create_run"', '<script is:inline>', '</script>', '<style>', '</style>'],
  'src/components/AccountingSetupQuick.astro': ['setup-readiness', 'setup-readiness-list', 'data-readiness="chart"', 'data-readiness="profile"', 'view=invoice-setup', 'view=accounts', 'view=periods', '<script is:inline>', '</script>', '<style>', '</style>'],
  'src/components/AccountingReportsQuick.astro': ['id="reports-filter"', 'id="reports-totals"', 'report-csv', 'saft-export-form', 'saft-record', 'view=saf-t', 'view=saf-t-exports', '<script is:inline>', '</script>', '<style>', '</style>'],
  'src/components/PostingQueueQuick.astro': ['id="posting-proposal-list"', 'lines_json', 'postingAccountLabel', 'Kontroller ${lines.length} bilagslinjer', 'Godkjenn kontrollerte linjer', 'debit===creditTotal', 'posting-payroll-readiness', 'renderPayrollReadiness', 'Serveren kontrollerer på nytt ved lagring', '<script is:inline>', '</script>', '<style>', '</style>'],
  'src/components/CardLedgerQuick.astro': ['id="card-ledger-form"', 'id="card-vat-rate"', 'id="card-vat-account"', 'vatRate', 'vatMinor', 'netMinor', '<script is:inline>', '</script>', '<style>', '</style>'],
 'src/pages/app/finance.astro': ['finance-task-start', 'finance-task-grid', 'data-finance-task="invoice"', 'data-finance-task="receipt"', 'data-finance-task="bank"', 'data-finance-task="payroll"', 'data-finance-tasks="voucher"', 'finance-task-workflow', 'finance-task-clear', 'Start med oppgaven, ikke modulen.', 'financeCount', 'data-overview-task="bank"', 'data-overview-task="supplier"', 'data-overview-task="payroll"', 'data-overview-task="vat"', 'data-overview-task="invoice"', 'metric-vat', 'metric-receivables', 'metric-receivables-detail', 'document-entity-type', 'document-card-transaction', 'document-supplier-invoice', 'document-sales-invoice', 'attach_receipt', 'loadCardReceiptOptions', 'loadSupplierInvoices', 'loadSalesInvoices'],
  'src/pages/app.astro': ['primary-finance-callout', 'Regnskap først', 'href="/app/finance"', 'app-stats'],
};

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await walk(path); continue; }
    if (!entry.name.endsWith('.astro')) continue;
    pageCount += 1;
    const source = await readFile(path, 'utf8');
    const label = relative(process.cwd(), path);
    for (const token of componentContracts[label] || []) if (!source.includes(token)) failures.push(`${label}: mangler nødvendig brukerfelt (${token})`);
    if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) failures.push(`${label}: mangler gyldig Astro-frontmatter`);
    for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      scriptCount += 1;
      try { new vm.Script(match[1], { filename: label }); }
      catch (error) { failures.push(`${label}: ugyldig nettleser-JavaScript (${error.message})`); }
    }
    const ids = [...source.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]).filter((id) => !id.includes('{'));
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (duplicates.length) failures.push(`${label}: dupliserte HTML-id-er (${duplicates.join(', ')})`);
    for (const pattern of [/x-styr-api-key/i, /preview-write/i, /sk_(?:live|test)_[a-z0-9]+/i, /CLOUDFLARE_API_TOKEN/i]) if (pattern.test(source)) failures.push(`${label}: mulig skrivehemmelighet eller API-nøkkel i offentlig side`);
  }
}

await walk(root);
for (const [file, tokens] of Object.entries(componentContracts)) {
  const source = await readFile(resolve(file), 'utf8');
  for (const token of tokens) if (!source.includes(token)) failures.push(`${file}: mangler nødvendig brukerfelt (${token})`);
}
if (failures.length) {
  console.error(`SOURCE INTEGRITY: FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`SOURCE INTEGRITY: PASS (${pageCount} sider, ${scriptCount} nettleserskript)`);
