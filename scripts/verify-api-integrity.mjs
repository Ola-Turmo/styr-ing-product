import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { transform } from 'esbuild';

const root = resolve('functions/api');
const failures = [];
let fileCount = 0;
const malformedSql = [/\bSELECT\s+FROM\b/i, /\bFROM\s+(?:WHERE|LEFT\s+JOIN|RIGHT\s+JOIN|JOIN|ORDER|GROUP|LIMIT)\b/i, /\bAS\s+FROM\b/i, /\bUPDATE\s+SET\s+WHERE\b/i, /\bJOIN\s+ON\s*(?:WHERE|GROUP|ORDER|LIMIT)\b/i, /\bWHERE\s+AND\b/i, /\bCOUNT\(\s*\*\s*\)\s+AS\s+FROM\b/i];
const routeContracts = {
  'functions/api/bank.ts': ['import_transactions', 'external_reference_conflict', 'bank_import_duplicate_or_conflict', 'payment_link_conflict', 'idempotent', 'insertedCount'],
  'functions/api/hcm.ts': ['create_offboarding', 'it_lifecycle_tasks', 'lifecycleTasksSynchronized', 'db.batch'],
  'functions/api/procurement.ts': ['create_order', 'create_receipt', 'create_invoice', 'three_way_match_required', 'approve_invoice', 'requiresHumanApproval', 'payment_reference_conflict', 'idempotent', 'Peppol BIS Billing 3.0', 'line_total_mismatch'],
  'functions/api/finance.ts': ['record_invoice_payment', 'payment_reference_conflict', 'idempotent', 'bank_transaction_id IS NULL', 'save_accounting_profile', 'save_customer_invoice_profile', 'invoice-document', 'sales_invoice_documents', 'validNorwegianMod11', 'invoice_number_exists', 'credit_note_number_exists', 'AuditFileVersion>1.30', 'AuditFileCountry>NO', 'SoftwareCompanyName>Styr.ing', 'GroupingCategory>NA', 'AccountType>GL', 'TaxAccountingBasis>A', 'NumberOfEntries>', 'DebitAmount><Amount>', 'CreditAmount><Amount>'],
  'functions/api/domains.ts': ['crm_accounts', 'authorizeBoardWrite', 'recordAudit', 'org_number_invalid', 'validNorwegianOrgNumber'],
  'functions/api/payroll.ts': ['calculate_compliance', 'prepare_submission', 'payloadHash', 'externalSubmission', 'submission_snapshot_conflict', 'idempotent'],
  'functions/api/mva.ts': ['calculate_period', 'vat_period_snapshot_stale', 'submission_snapshot_conflict', 'idempotent'],
  'functions/api/field.ts': ['classify_trip', 'complete_maintenance', 'prepare_invoice', 'approve_time', 'requiresHumanApproval'],
  'functions/api/commercial.ts': ['approve_quote', 'send_quote', 'create_case', 'record_case_response', 'update_case_status'],
  'functions/api/governance.ts': ['review_contract', 'activate_mandate', 'create_contract_review', 'accept_redline', 'approve_grant'],
  'functions/api/forecast.ts': ['sales_credit_notes', 'substr(collection_cases.reference,15)', 'openCollectionsMinor'],
};

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await walk(path); continue; }
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue;
    fileCount += 1;
    const source = await readFile(path, 'utf8');
    const label = relative(process.cwd(), path);
    try { await transform(source, { loader: entry.name.endsWith('.ts') ? 'ts' : 'js', target: 'es2022' }); }
    catch (error) { failures.push(`${label}: kan ikke transpileres (${error.message.split('\n')[0]})`); }
    for (const pattern of malformedSql) if (pattern.test(source)) failures.push(`${label}: malformed SQL pattern ${pattern}`);
    if (/\.prepare\(\s*`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(source) && !source.includes('requireDb')) failures.push(`${label}: database route prepares SQL without requireDb guard`);
    const required = routeContracts[label];
    if (required) for (const token of required) if (!source.includes(token)) failures.push(`${label}: missing required workflow contract ${token}`);
  }
}

await walk(root);
if (failures.length) {
  console.error(`API INTEGRITY: FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`API INTEGRITY: PASS (${fileCount} API modules)`);
