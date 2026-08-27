const baseUrl = (process.env.STYR_SMOKE_BASE_URL || 'https://styr.ing').replace(/\/$/, '');
const checks = [
  ['MCP descriptor', '/api/mcp', 200],
  ['health', '/api/health', 200], ['auth session', '/api/auth', 200],
  ['legal status', '/api/legal?boardId=board-1', 200], ['billing status', '/api/billing?boardId=board-1', 200],
  ['privacy center', '/api/privacy?boardId=board-1', 200], ['membership guard', '/api/members?boardId=board-1', 401],
 ['invite activation page', '/activate/', 200], ['public landing page', '/', 200], ['public capability map', '/capabilities/', 200], ['customer workspace shell', '/app/', 200], ['tenant workspace shell', '/app/arbeidsflate/', 200], ['tenant finance workspace shell', '/app/finance/', 200], ['tenant intelligence workspace shell', '/app/intelligence/', 200], ['boards', '/api/boards', 200], ['accounting document metadata', '/api/documents?boardId=board-1', 200],
  ['event mesh summary', '/api/events?boardId=board-1&view=summary', 200], ['event mesh destinations', '/api/events?boardId=board-1&view=destinations', 200], ['event mesh deliveries', '/api/events?boardId=board-1&view=deliveries', 200], ['event mesh events', '/api/events?boardId=board-1&view=events', 200],
  ['compliance summary', '/api/compliance?boardId=board-1&view=summary', 200],
  ['controls summary', '/api/controls?boardId=board-1&view=summary', 200],
  ['risk summary', '/api/risk?boardId=board-1&view=summary', 200],
  ['risk register', '/api/risk?boardId=board-1&view=risks', 200],
  ['risk actions', '/api/risk?boardId=board-1&view=actions', 200],
  ['HMS and ESG summary', '/api/sustainability?boardId=board-1&view=summary', 200],
  ['HMS and ESG items', '/api/sustainability?boardId=board-1&view=items', 200],
  ['transparency vendor assessments', '/api/sustainability?boardId=board-1&view=transparency', 200],
  ['transparency reports', '/api/sustainability?boardId=board-1&view=transparency_reports', 200],
  ['HCM summary', '/api/hcm?boardId=board-1&view=summary', 200], ['HCM people', '/api/hcm?boardId=board-1&view=people', 200], ['HCM goals', '/api/hcm?boardId=board-1&view=goals', 200], ['HCM candidates', '/api/hcm?boardId=board-1&view=candidates', 200], ['HCM handbook', '/api/hcm?boardId=board-1&view=handbook', 200], ['HCM training', '/api/hcm?boardId=board-1&view=training', 200], ['HCM reviews', '/api/hcm?boardId=board-1&view=reviews', 200], ['HCM offboarding', '/api/hcm?boardId=board-1&view=offboarding', 200],
 ['governance summary', '/api/governance?boardId=board-1&view=summary', 200], ['governance contracts', '/api/governance?boardId=board-1&view=contracts', 200], ['governance redlines', '/api/governance?boardId=board-1&view=redlines', 200], ['governance mandates', '/api/governance?boardId=board-1&view=mandates', 200], ['governance equity', '/api/governance?boardId=board-1&view=equity', 200], ['governance grants', '/api/governance?boardId=board-1&view=grants', 200], ['governance equity filings', '/api/governance?boardId=board-1&view=filings', 200],
  ['board governance summary', '/api/board_governance?boardId=board-1&view=summary', 200],
  ['board governance attendance', '/api/board_governance?boardId=board-1&view=attendance', 200],
  ['board governance ballots', '/api/board_governance?boardId=board-1&view=ballots', 200],
  ['operations cockpit', '/api/operations?boardId=board-1', 200],
  ['audit trail', '/api/audit?boardId=board-1', 200], ['audit integrity', '/api/audit?boardId=board-1&limit=50', 200], ['SAF-T export history', '/api/finance?boardId=board-1&view=saf-t-exports', 200], ['SAF-T export', '/api/finance?boardId=board-1&view=saf-t', 200],
  ['accounting periods', '/api/finance?boardId=board-1&view=periods', 200], ['MVA summary', '/api/mva?boardId=board-1&view=summary', 200], ['MVA periods', '/api/mva?boardId=board-1&view=periods', 200], ['chart of accounts', '/api/finance?boardId=board-1&view=accounts', 200], ['finance customers', '/api/finance?boardId=board-1&view=customers', 200], ['customer register', '/api/finance?boardId=board-1&view=customer-register', 200], ['product catalog', '/api/finance?boardId=board-1&view=products', 200], ['invoice setup', '/api/finance?boardId=board-1&view=invoice-setup', 200], ['sales invoices', '/api/finance?boardId=board-1&view=invoices', 200], ['recurring invoice templates', '/api/finance?boardId=board-1&view=recurring-templates', 200], ['recurring invoice generations', '/api/finance?boardId=board-1&view=recurring-generations', 200],
  ['posting summary', '/api/postings?boardId=board-1&view=summary', 200], ['posting proposals', '/api/postings?boardId=board-1&view=proposals', 200],
  ['bank summary', '/api/bank?boardId=board-1&view=summary', 200], ['bank accounts', '/api/bank?boardId=board-1&view=accounts', 200], ['bank transactions', '/api/bank?boardId=board-1&view=transactions', 200], ['bank suggestions', '/api/bank?boardId=board-1&view=suggestions', 200], ['bank reconciliation UI', '/app/finance/', 200],
  ['bank ledger bridge', '/api/bank?boardId=board-1&view=accounts', 200],
  ['treasury summary', '/api/treasury?boardId=board-1&view=summary', 200], ['treasury payroll', '/api/treasury?boardId=board-1&view=payroll', 200],
  ['treasury submissions', '/api/treasury?boardId=board-1&view=submissions', 200], ['treasury liquidity', '/api/treasury?boardId=board-1&view=liquidity', 200],
  ['treasury collections', '/api/treasury?boardId=board-1&view=collections', 200],
  ['collection reminder drafts', '/api/collections?boardId=board-1&view=reminders', 200],
  ['payroll summary', '/api/payroll?boardId=board-1&view=summary', 200],
  ['payroll runs', '/api/payroll?boardId=board-1&view=runs', 200],
  ['payroll checks', '/api/payroll?boardId=board-1&view=checks', 200],
  ['payroll submissions', '/api/payroll?boardId=board-1&view=submissions', 200], ['annual accounts summary', '/api/payroll?boardId=board-1&view=annual-summary&period=2026', 200],

  ['payroll people', '/api/payroll?boardId=board-1&view=people', 200],
  ['field summary', '/api/field?boardId=board-1&view=summary', 200], ['field projects', '/api/field?boardId=board-1&view=projects', 200], ['field facility tasks', '/api/field?boardId=board-1&view=facility_tasks', 200], ['field people', '/api/field?boardId=board-1&view=people', 200],
  ['field time', '/api/field?boardId=board-1&view=time', 200], ['field WIP', '/api/field?boardId=board-1&view=wip', 200],
  ['field invoice drafts', '/api/field?boardId=board-1&view=invoice_drafts', 200],
  ['commercial summary', '/api/commercial?boardId=board-1&view=summary', 200], ['commercial pipeline', '/api/commercial?boardId=board-1&view=pipeline', 200],
  ['commercial quotes', '/api/commercial?boardId=board-1&view=quotes', 200], ['commercial rooms', '/api/commercial?boardId=board-1&view=rooms', 200],
  ['commercial subscriptions', '/api/commercial?boardId=board-1&view=subscriptions', 200], ['commercial cases', '/api/commercial?boardId=board-1&view=cases', 200],
  ['IT summary', '/api/it?boardId=board-1&view=summary', 200], ['IT assets', '/api/it?boardId=board-1&view=assets', 200],
  ['IT tickets', '/api/it?boardId=board-1&view=tickets', 200], ['IT SaaS insights', '/api/it?boardId=board-1&view=saas_insights', 200],
  ['IT access', '/api/it?boardId=board-1&view=access', 200], ['IT lifecycle', '/api/it?boardId=board-1&view=lifecycle', 200],
  ['fixed assets summary', '/api/assets?boardId=board-1&view=summary', 200], ['fixed assets rows', '/api/assets?boardId=board-1&view=assets', 200], ['depreciation rows', '/api/assets?boardId=board-1&view=depreciation', 200],
  ['cards summary', '/api/cards?boardId=board-1&view=summary', 200], ['cards rows', '/api/cards?boardId=board-1&view=cards', 200], ['card transactions', '/api/cards?boardId=board-1&view=transactions', 200],
  ['revenue summary', '/api/revenue?boardId=board-1&view=summary', 200], ['revenue contracts', '/api/revenue?boardId=board-1&view=contracts', 200], ['revenue obligations', '/api/revenue?boardId=board-1&view=obligations', 200], ['revenue schedule', '/api/revenue?boardId=board-1&view=schedule', 200],
 ['procurement summary', '/api/procurement?boardId=board-1&view=summary', 200], ['supplier register', '/api/procurement?boardId=board-1&view=suppliers', 200], ['procurement orders', '/api/procurement?boardId=board-1&view=orders', 200], ['procurement receipts', '/api/procurement?boardId=board-1&view=receipts', 200], ['procurement EHF inbox', '/api/procurement?boardId=board-1&view=ehf', 200], ['procurement EHF XML guard', '/api/procurement?boardId=board-1&view=ehf-xml', 400], ['procurement invoices', '/api/procurement?boardId=board-1&view=invoices', 200], ['supplier credit notes', '/api/procurement?boardId=board-1&view=credit-notes', 200],
  ['private board guard', '/api/events?boardId=board-2&view=summary', 403], ['private forecast guard', '/api/forecast?boardId=board-2', 403],
  ['private domain guard', '/api/domains/people?boardId=board-2', 403],
];
checks.push(['MVA detail', '/api/mva?boardId=board-1&view=detail&period=2026-08', 200]);
const failures = [];
for (const [label, path, expected] of checks) {
  const response = await fetch(`${baseUrl}${path}`);
  if (response.status !== expected) failures.push(`${label}: expected ${expected}, got ${response.status}`);
  if (label === 'SAF-T export' && !((response.headers.get('content-type') || '').includes('application/xml'))) failures.push(`${label}: expected application/xml content type`);
  if (label === 'boards') {
    const payload = await response.json();
    if (!Array.isArray(payload.data) || payload.data.some((board) => board.id !== 'board-1')) failures.push(`${label}: unauthenticated response must be limited to fictional board-1`);
  }
  if (label === 'audit integrity') {
    const payload = await response.json();
    if (!payload.integrity || payload.integrity.valid !== true) failures.push(`${label}: expected valid audit integrity`);
  }
  if (label === 'accounting document metadata') {
    const payload = await response.json();
    if (!Array.isArray(payload.data) || payload.storage !== 'r2') failures.push(`${label}: expected tenant metadata and R2 storage`);
  }
  if (label === 'sales invoices') {
    const payload = await response.json();
    if (!Array.isArray(payload.data)) failures.push(`${label}: expected invoice rows`);
  }
  if (label === 'invoice setup') {
    const payload = await response.json();
    if (!payload.data || !payload.data.seller || !Array.isArray(payload.data.customers)) failures.push(`${label}: expected seller and customer profile data`);
  }
  if (label === 'product catalog') {
    const payload = await response.json();
    if (!Array.isArray(payload.data)) failures.push(`${label}: expected product rows`);
  }
}
for (const [label, path, payload] of [
  ['event mesh write guard', '/api/events', { boardId: 'board-1' }], ['assistant write guard', '/api/assistant', { boardId: 'board-1', question: 'status' }], ['MCP write guard', '/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }],
  ['domain write guard', '/api/domains/people', { boardId: 'board-1', data: { name: 'Unauthorised' } }],
  ['meeting write guard', '/api/board_governance', { boardId: 'board-1', action: 'create_meeting', title: 'Unauthorised', date: '2026-08-25' }],
  ['resolution write guard', '/api/board_governance', { boardId: 'board-1', action: 'create_resolution', number: 'X-UNAUTH', title: 'Unauthorised' }],
  ['meeting status write guard', '/api/board_governance', { boardId: 'board-1', action: 'update_meeting_status', meetingId: 'fixture-not-used', status: 'completed' }],
  ['ballot write guard', '/api/board_governance', { boardId: 'board-1', action: 'cast_ballot', resolutionId: 'fixture-not-used', memberId: 'fixture-not-used', vote: 'for' }],
  ['compliance write guard', '/api/compliance', { boardId: 'board-1', eventId: 'fixture-not-used', status: 'pending' }],
  ['controls write guard', '/api/controls', { boardId: 'board-1', controlId: 'fixture-not-used', status: 'green' }],
  ['HMS and ESG write guard', '/api/sustainability', { boardId: 'board-1', action: 'close_item', itemId: 'fixture-not-used' }],
  ['carbon calculation guard', '/api/sustainability', { boardId: 'board-1', action: 'calculate_carbon', title: 'Unauthorised', scope: 'scope_2', activityNumeric: 1, emissionFactor: 0.1 }],
  ['transparency preparation guard', '/api/sustainability', { boardId: 'board-1', action: 'prepare_transparency_assessments', reportYear: '2026' }],
  ['transparency report guard', '/api/sustainability', { boardId: 'board-1', action: 'prepare_transparency_report', reportYear: '2026' }],
  ['risk write guard', '/api/risk', { boardId: 'board-1', action: 'update_risk', riskId: 'fixture-not-used', status: 'monitoring' }],
  ['risk create guard', '/api/risk', { boardId: 'board-1', action: 'create_risk', title: 'Unauthorised risk', level: 'high' }],
  ['risk action completion guard', '/api/risk', { boardId: 'board-1', action: 'complete_action', actionId: 'fixture-not-used' }],
  ['HCM write guard', '/api/hcm', { boardId: 'board-1', action: 'update_goal', goalId: 'fixture-not-used', progress: 50, status: 'on_track' }],
  ['HCM offboarding guard', '/api/hcm', { boardId: 'board-1', action: 'advance_offboarding', caseId: 'fixture-not-used', accessRevoked: true }],
  ['HCM candidate write guard', '/api/hcm', { boardId: 'board-1', action: 'update_candidate', candidateId: 'fixture-not-used', stage: 'screening' }],
  ['HCM scorecard write guard', '/api/hcm', { boardId: 'board-1', action: 'save_scorecard', candidateId: 'fixture-not-used', overallScore: 80, recommendation: 'yes' }],
  ['governance write guard', '/api/governance', { boardId: 'board-1', action: 'review_contract', reviewId: 'fixture-not-used', decision: 'approved' }],
  ['governance equity filing guard', '/api/governance', { boardId: 'board-1', action: 'prepare_equity_filing', filingType: 'rf_1086', period: '2026' }],
  ['board governance write guard', '/api/board_governance', { boardId: 'board-1', action: 'record_attendance', attendanceId: 'fixture-not-used', attendanceStatus: 'present' }],
  ['board dissent write guard', '/api/board_governance', { boardId: 'board-1', action: 'record_dissent', resolutionId: 'fixture-not-used', memberId: 'fixture-not-used', statement: 'fixture' }],
  ['finance period write guard', '/api/finance', { boardId: 'board-1', action: 'lock_period', period: '2026-99' }],
  ['finance fiscal year write guard', '/api/finance', { boardId: 'board-1', action: 'create_fiscal_year', year: 2027 }],
  ['SMB chart setup write guard', '/api/finance', { boardId: 'board-1', action: 'seed_smb_chart' }],
  ['voucher import write guard', '/api/finance', { boardId: 'board-1', action: 'import_vouchers', vouchers: [] }],
  ['MVA calculation guard', '/api/mva', { boardId: 'board-1', action: 'calculate_period', period: '2026-08' }],
  ['MVA approval guard', '/api/mva', { boardId: 'board-1', action: 'approve_period', period: '2026-08' }],
  ['posting preparation guard', '/api/postings', { boardId: 'board-1', action: 'prepare_sales_invoice', sourceId: 'fixture-not-used', period: '2026-08', primaryAccountId: 'fixture-not-used', secondaryAccountId: 'fixture-not-used' }],
  ['posting approval guard', '/api/postings', { boardId: 'board-1', action: 'approve_proposal', proposalId: 'fixture-not-used' }],
  ['posting post guard', '/api/postings', { boardId: 'board-1', action: 'post_proposal', proposalId: 'fixture-not-used' }],
  ['sales invoice write guard', '/api/finance', { boardId: 'board-1', action: 'create_invoice', invoiceNumber: 'UNAUTH', issueDate: '2026-08-25', description: 'Unauthorised', amountMinor: 100 }],
  ['crm org number write guard', '/api/domains/crm_accounts', { boardId: 'board-1', data: { company_name: 'Unauthorised AS', org_number: '123456789' } }],
  ['bank account write guard', '/api/bank', { boardId: 'board-1', action: 'create_account', name: 'Unauthorised bank account' }],
  ['bank transaction write guard', '/api/bank', { boardId: 'board-1', action: 'import_transaction', bankAccountId: 'fixture-not-used', transactionDate: '2026-08-25', description: 'Unauthorised', externalReference: 'UNAUTH', amountMinor: -100 }],
  ['bank post guard', '/api/bank', { boardId: 'board-1', action: 'post_match', transactionId: 'fixture-not-used', counterAccountId: 'fixture-not-used' }],
  ['finance period reseal guard', '/api/finance', { boardId: 'board-1', action: 'reseal_period', period: '2026-07' }],
  ['finance note preparation guard', '/api/finance', { boardId: 'board-1', action: 'prepare_note', noteType: 'remuneration', period: '2026' }],
  ['finance FX revaluation guard', '/api/finance', { boardId: 'board-1', action: 'prepare_fx', reference: 'FX-TEST', currency: 'EUR', period: '2026-08', foreignAmountMinor: 10000, bookedRate: 11, closingRate: 12 }],
  ['payroll write guard', '/api/payroll', { boardId: 'board-1', action: 'calculate_compliance', payrollRunId: 'fixture-not-used' }],
  ['payroll run creation guard', '/api/payroll', { boardId: 'board-1', action: 'create_run', period: '2026-99', grossMinor: 1000, employeeCount: 1 }],
  ['payroll approval guard', '/api/payroll', { boardId: 'board-1', action: 'approve_compliance', checkId: 'fixture-not-used' }],
  ['treasury write guard', '/api/treasury', { boardId: 'board-1', action: 'create_liquidity_snapshot' }],
  ['collection reminder write guard', '/api/collections', { boardId: 'board-1', action: 'prepare_reminder', invoiceId: 'fixture-not-used' }],
  ['field write guard', '/api/field', { boardId: 'board-1', action: 'approve_time', entryId: 'fixture-not-used' }],
  ['field invoice preparation guard', '/api/field', { boardId: 'board-1', action: 'prepare_invoice', projectId: 'fixture-not-used', period: '2026-08' }],
  ['field invoice approval guard', '/api/field', { boardId: 'board-1', action: 'approve_invoice_draft', draftId: 'fixture-not-used' }],
  ['field invoice conversion guard', '/api/field', { boardId: 'board-1', action: 'convert_invoice_draft', draftId: 'fixture-not-used', dueDate: '2026-09-30' }],
  ['commercial write guard', '/api/commercial', { boardId: 'board-1', action: 'approve_quote', quoteId: 'fixture-not-used' }],
  ['IT ticket write guard', '/api/it', { boardId: 'board-1', action: 'create_ticket', title: 'Unauthorised' }],
  ['IT SaaS register write guard', '/api/it', { boardId: 'board-1', action: 'create_saas_subscription', name: 'Unauthorised', vendor: 'Unauthorised', seats: 1 }],
  ['IT write guard', '/api/it', { boardId: 'board-1', action: 'approve_lifecycle_task', taskId: 'fixture-not-used' }],
  ['fixed assets write guard', '/api/assets', { boardId: 'board-1', action: 'approve_depreciation', entryId: 'fixture-not-used' }],
  ['fixed asset creation guard', '/api/assets', { boardId: 'board-1', action: 'create_asset', assetNumber: 'AM-INVALID', name: 'Unauthorised', category: 'test', acquisitionDate: '2026-99-99', acquisitionCostMinor: 1000, usefulLifeMonths: 12 }],
  ['depreciation calculation guard', '/api/assets', { boardId: 'board-1', action: 'calculate_depreciation', assetId: 'fixture-not-used', period: '2026-08' }],
  ['cards write guard', '/api/cards', { boardId: 'board-1', action: 'approve_transaction', transactionId: 'fixture-not-used' }],
  ['revenue write guard', '/api/revenue', { boardId: 'board-1', action: 'approve_schedule_entry', entryId: 'fixture-not-used' }],
  ['revenue schedule preparation guard', '/api/revenue', { boardId: 'board-1', action: 'prepare_schedule', contractId: 'fixture-not-used' }],
  ['procurement write guard', '/api/procurement', { boardId: 'board-1', action: 'approve_order', orderId: 'fixture-not-used' }],
  ['procurement order creation guard', '/api/procurement', { boardId: 'board-1', action: 'create_order', orderNumber: 'UNAUTH', supplierName: 'Unauthorised', totalMinor: 100, currency: 'NOK' }],
  ['procurement receipt creation guard', '/api/procurement', { boardId: 'board-1', action: 'create_receipt', purchaseOrderId: 'fixture-not-used', receivedDate: '2026-08-25', status: 'confirmed' }],
  ['procurement invoice creation guard', '/api/procurement', { boardId: 'board-1', action: 'create_invoice', invoiceNumber: 'UNAUTH', supplierName: 'Unauthorised', amountMinor: 100, currency: 'NOK', dueDate: '2026-08-25' }],
  ['supplier credit note write guard', '/api/procurement', { boardId: 'board-1', action: 'create_credit_note', supplierInvoiceId: 'fixture-not-used', creditNoteNumber: 'UNAUTH', issueDate: '2026-08-25', description: 'Unauthorised', amountMinor: 100, vatMinor: 0, currency: 'NOK' }],
  ['EHF receive guard', '/api/procurement', { boardId: 'board-1', action: 'receive_ehf', documentRef: 'UNAUTH', supplierName: 'Unauthorised', invoiceNumber: 'UNAUTH', issueDate: '2026-08-25', dueDate: '2026-09-01', amountMinor: 100, currency: 'NOK' }],
  ['EHF validate guard', '/api/procurement', { boardId: 'board-1', action: 'validate_ehf', ehfId: 'fixture-not-used' }],
  ['EHF link guard', '/api/procurement', { boardId: 'board-1', action: 'link_ehf_invoice', ehfId: 'fixture-not-used' }],
  ['procurement invoice match guard', '/api/procurement', { boardId: 'board-1', action: 'match_invoice', invoiceId: 'fixture-not-used' }],
  ['procurement invoice attestation guard', '/api/procurement', { boardId: 'board-1', action: 'attest_invoice', invoiceId: 'fixture-not-used' }],
  ['procurement invoice assignment guard', '/api/procurement', { boardId: 'board-1', action: 'assign_invoice', invoiceId: 'fixture-not-used' }],
  ['payroll compliance calculation guard', '/api/payroll', { boardId: 'board-1', action: 'calculate_compliance', payrollRunId: 'fixture-not-used' }],
  ['payroll submission preparation guard', '/api/payroll', { boardId: 'board-1', action: 'prepare_submission', submissionType: 'a_melding', period: '2026-08' }],
  ['payroll submission approval guard', '/api/payroll', { boardId: 'board-1', action: 'approve_submission', submissionId: 'fixture-not-used' }],
  ['field trip classification guard', '/api/field', { boardId: 'board-1', action: 'classify_trip', tripId: 'fixture-not-used', tripType: 'business' }],
  ['field maintenance guard', '/api/field', { boardId: 'board-1', action: 'complete_maintenance', maintenanceId: 'fixture-not-used' }],
  ['field facility task guard', '/api/field', { boardId: 'board-1', action: 'complete_facility_task', taskId: 'fixture-not-used' }],
  ['field time entry guard', '/api/field', { boardId: 'board-1', action: 'create_time_entry', projectId: 'fixture-not-used', personId: 'fixture-not-used', workDate: '2026-08-25', minutes: 60 }],
  ['field time submit guard', '/api/field', { boardId: 'board-1', action: 'submit_time', entryId: 'fixture-not-used' }],
  ['field invoice preparation guard', '/api/field', { boardId: 'board-1', action: 'prepare_invoice', projectId: 'fixture-not-used', period: '2026-08' }],
  ['commercial case creation guard', '/api/commercial', { boardId: 'board-1', action: 'create_case', title: 'Unauthorised case', priority: 'low', channel: 'internal' }],
  ['commercial quote send guard', '/api/commercial', { boardId: 'board-1', action: 'send_quote', quoteId: 'fixture-not-used' }],
  ['commercial case response guard', '/api/commercial', { boardId: 'board-1', action: 'record_case_response', caseId: 'fixture-not-used' }],
  ['commercial case status guard', '/api/commercial', { boardId: 'board-1', action: 'update_case_status', caseId: 'fixture-not-used', status: 'in_progress' }],
  ['commercial case resolution guard', '/api/commercial', { boardId: 'board-1', action: 'resolve_case', caseId: 'fixture-not-used' }],
  ['governance review guard', '/api/governance', { boardId: 'board-1', action: 'review_contract', reviewId: 'fixture-not-used', decision: 'approved' }],
  ['governance redline guard', '/api/governance', { boardId: 'board-1', action: 'accept_redline', redlineId: 'fixture-not-used' }],
  ['governance mandate guard', '/api/governance', { boardId: 'board-1', action: 'activate_mandate', mandateId: 'fixture-not-used' }],
  ['billing checkout guard', '/api/billing-checkout', { boardId: 'board-1', plan: 'paid' }],
  ['SAF-T export record guard', '/api/finance', { boardId: 'board-1', action: 'record_saf_t_export', from: '2026-01', to: '2026-12' }],
  ['privacy request guard', '/api/privacy', { boardId: 'board-1', requestType: 'access' }],
  ['invite guard', '/api/auth', { action: 'invite_user', boardId: 'board-1', email: 'invite@example.invalid', name: 'Invite User' }],
]) {
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (response.status !== 401) failures.push(`${label}: expected 401, got ${response.status}`);
}
const documentForm = new FormData();
documentForm.set('boardId', 'board-1');
documentForm.set('file', new Blob(['smoke'], { type: 'text/plain' }), 'smoke.txt');
const documentUploadGuard = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: documentForm });
if (documentUploadGuard.status !== 401) failures.push(`accounting document upload guard: expected 401, got ${documentUploadGuard.status}`);
const invalidLogin = await fetch(`${baseUrl}/api/auth`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'login', email: 'nobody@example.invalid', password: 'not-a-real-password' }) });
if (invalidLogin.status !== 401) failures.push(`invalid login guard: expected 401, got ${invalidLogin.status}`);
const webhookUnconfigured = await fetch(`${baseUrl}/api/billing-webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
if (![400, 503].includes(webhookUnconfigured.status)) failures.push(`billing webhook guard: expected 400 or 503, got ${webhookUnconfigured.status}`);
if (failures.length) { console.error(`LIVE API SMOKE: FAIL (${failures.length})`); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
console.log(`LIVE API SMOKE: PASS (${checks.length + 3} checks against ${baseUrl})`);
