INSERT OR IGNORE INTO boards (id,company_id,name,description,org_number,status,plan)
VALUES ('board-1','company-demo','Styret 2026','Fiktivt hovedstyre for Pilotselskap AS','123456789','active','pilot');

INSERT OR IGNORE INTO board_members (id,board_id,name,email,role,since) VALUES
('m1','board-1','Demo Leder','leder@example.invalid','leader','2026-01-01'),
('m2','board-1','Demo Nestleder','nestleder@example.invalid','deputy','2026-01-01'),
('m3','board-1','Demo Medlem A','medlem-a@example.invalid','member','2026-01-01');

INSERT OR IGNORE INTO meetings (id,board_id,title,date,time,location,status,agenda,minutes) VALUES
('mtg-ext-1','board-1','Q1 Resultater','2026-05-15','09:00','Styrerommet','completed','["Åpning","Resultater","Likviditet"]','Illustrert protokollutkast'),
('mtg-ext-2','board-1','Strategi 2027','2026-09-12','10:00','Digitalt','planned','["Strategi","Investeringer"]',NULL);
INSERT OR IGNORE INTO meeting_attendance (id,board_id,meeting_id,member_id,attendance_status,conflict_flag) VALUES
('att-1','board-1','mtg-ext-1','m1','present',0),('att-2','board-1','mtg-ext-1','m2','present',0),('att-3','board-1','mtg-ext-1','m3','present',0),
('att-4','board-1','mtg-ext-2','m1','invited',0),('att-5','board-1','mtg-ext-2','m2','invited',0),('att-6','board-1','mtg-ext-2','m3','invited',0);

INSERT OR IGNORE INTO risks (id,board_id,code,title,level,trend,owner,status,treatment,due_date) VALUES
('risk-1','board-1','R-001','Leverandørkonsentrasjon — single-source IT-drift','critical','up','CTO','treating','Kvalifiser alternativ leverandør','2026-09-30'),
('risk-2','board-1','R-002','Manglende databehandleravtaler','high','stable','DPO','open','Fullfør leverandørgjennomgang','2026-09-15');

INSERT OR IGNORE INTO action_items (id,board_id,meeting_id,title,description,assigned_to,due_date,priority,status) VALUES
('action-1','board-1','mtg-ext-1','Ferdigstill budsjett H2','Oppdater likviditetsforutsetninger og styrenotat','CFO','2026-09-01','high','in_progress'),
('action-2','board-1','mtg-ext-1','Lukk tilgangsavvik ERP','Dokumenter roller og fjern inaktive tilganger','IT-sjef','2026-08-31','critical','blocked');

INSERT OR IGNORE INTO resolutions (id,board_id,meeting_id,number,title,description,status,votes_for,signature_status,adoption_date) VALUES
('resolution-1','board-1','mtg-ext-1','2026/03','Godkjenning av årsberetning','Årsberetningen godkjennes som fremlagt','signed',3,'complete','2026-05-15');
INSERT OR IGNORE INTO resolution_ballots (id,board_id,resolution_id,member_id,vote) VALUES
('ballot-1','board-1','resolution-1','m1','for'),('ballot-2','board-1','resolution-1','m2','for'),('ballot-3','board-1','resolution-1','m3','for');

INSERT OR IGNORE INTO board_documents (id,board_id,meeting_id,title,category,type,status,version,uploaded_by) VALUES
('doc-1','board-1','mtg-ext-1','Styrets årsberetning 2025','Årsoppgjør','report','final','1.0','Demo Sekretær'),
('doc-2','board-1','mtg-ext-2','Strateginotat 2027','Strategi','presentation','draft','0.3','Demo Leder');

INSERT OR IGNORE INTO people (id,board_id,name,email,role,department,employment_status,start_date) VALUES
('person-1','board-1','Demo Leder','leder@example.invalid','Styreleder','Ledelse','active','2024-01-01'),
('person-2','board-1','Demo CFO','cfo@example.invalid','CFO','Økonomi','active','2024-03-01'),
('person-3','board-1','Demo IT-sjef','it@example.invalid','IT-sjef','IT','active','2024-02-01');
INSERT OR IGNORE INTO goals (id,board_id,owner_id,title,period,status,progress) VALUES
('goal-1','board-1','person-1','Styringsmodell 2026','2026','on_track',72),
('goal-2','board-1','person-2','Forutsigbar likviditet','2026','at_risk',48);
INSERT OR IGNORE INTO it_assets (id,board_id,asset_tag,name,asset_type,owner_id,status,vendor,renewal_date) VALUES
('asset-1','board-1','IT-001','ERP-lisenser','saas','person-3','active','Demo ERP','2026-12-31'),
('asset-2','board-1','IT-002','Bærbar PC — demo','hardware','person-1','active','Demo Hardware','2027-05-01');
INSERT OR IGNORE INTO service_tickets (id,board_id,title,description,category,priority,status,assignee_id,due_date) VALUES
('ticket-1','board-1','Tilgangsavvik ERP','Avklar rolle og fjern inaktiv tilgang','access','critical','in_progress','person-3','2026-08-31');
INSERT OR IGNORE INTO finance_records (id,board_id,record_type,reference,counterparty,amount_minor,currency,status,due_date,source) VALUES
('fin-1','board-1','invoice','INV-DEMO-001','Demo Leverandør AS',1250000,'NOK','pending','2026-09-01','illustration'),
('fin-2','board-1','bank_transaction','BANK-DEMO-001','Demo Kunde AS',4500000,'NOK','matched','2026-08-25','illustration');
INSERT OR IGNORE INTO crm_accounts (id,board_id,company_name,org_number,stage,owner_id,next_action,estimated_value_minor,currency) VALUES
('crm-1','board-1','Nordic Demo AS','987654321','proposal','person-2','Avklar sikkerhetskrav',35000000,'NOK');
INSERT OR IGNORE INTO contracts (id,board_id,title,counterparty,contract_type,status,start_date,end_date,owner_id,renewal_notice_date) VALUES
('contract-1','board-1','ERP-avtale — demo','Demo ERP AS','supplier','review','2026-01-01','2026-12-31','person-3','2026-10-01');
INSERT OR IGNORE INTO contract_reviews (id,board_id,contract_id,review_type,status,owner_id,findings,decision,due_date) VALUES
('review-1','board-1','contract-1','renewal','in_review','person-3','[{"finding":"Automatisk fornyelse krever 90 dagers varsel","severity":"medium"}]',NULL,'2026-09-15');
INSERT OR IGNORE INTO mandates (id,board_id,holder_id,mandate_type,scope,status,valid_from,valid_until,evidence_ref) VALUES
('mandate-1','board-1','person-2','prokura','Kan inngå ordinære driftsavtaler inntil 250 000 NOK','active','2026-01-01','2026-12-31','res-2026-02');
INSERT OR IGNORE INTO mandates (id,board_id,holder_id,mandate_type,scope,status,valid_from,valid_until,evidence_ref) VALUES
('mandate-2','board-1','person-3','purchase','Innkjøp og leverandøravtaler over 50 000 NOK','draft','2026-01-01','2026-12-31','Mangler styrevedtak');
INSERT OR IGNORE INTO equity_holders (id,board_id,holder_name,holder_type,shares,share_class,ownership_percent,vesting_status) VALUES
('equity-1','board-1','Demo Gründer AS','company',700000,'A',70,'fully_vested'),
('equity-2','board-1','Demo Ansattpool','option_pool',300000,'A',30,'vesting_plan');
INSERT OR IGNORE INTO equity_grants (id,board_id,holder_id,grant_name,instrument,granted_shares,strike_minor,currency,grant_date,vesting_start,vesting_months,vested_shares,status,tax_review_status,evidence_ref) VALUES
('grant-1','board-1','person-2','Demo opsjonsprogram 2026','option',50000,1250,'NOK','2026-01-15','2026-01-15',48,6250,'active','review','board-resolution-2026-02');
INSERT OR IGNORE INTO contract_redlines (id,board_id,contract_id,clause_ref,original_text,proposed_text,risk_level,recommendation,status) VALUES
('redline-1','board-1','contract-1','§ 8 Automatisk fornyelse','Avtalen fornyes automatisk.','Fornyelse krever skriftlig bekreftelse 90 dager før utløp.','high','Krev eksplisitt fornyelsesbeslutning og fristvakt.','review');
INSERT OR IGNORE INTO intercompany_postings (id,board_id,source_entity,target_entity,reference,amount_minor,currency,period,status,elimination_required) VALUES
('ic-1','board-1','Styr.ing Holding AS','Styr.ing Drift AS','Management fee Q2',1250000,'NOK','2026-06','review',1);
INSERT OR IGNORE INTO statutory_notes (id,board_id,note_type,period,status,payload,evidence_refs) VALUES
('note-1','board-1','remuneration','2026','review','{"fte":12,"board_remuneration_minor":350000,"related_party_loans_minor":0}','["payroll-1","equity-1"]');
INSERT OR IGNORE INTO sustainability_items (id,board_id,item_type,title,status,severity,scope,due_date) VALUES
('sustain-1','board-1','hms_incident','Nestenulykke — illustrasjon','open','medium','Kontor','2026-09-05'),
('sustain-2','board-1','vendor_due_diligence','Åpenhetsloven leverandørgjennomgang','in_progress','high','Leverandørkjede','2026-09-30');
INSERT OR IGNORE INTO integration_registry (id,board_id,key,display_name,domain,status,residency,notes) VALUES
('int-1','board-1','altinn','Altinn / NAV','public-sector','planned','EEA','Maskinporten og avtale kreves'),
('int-2','board-1','ehf','EHF / PEPPOL','finance','planned','EEA','Peppol access point kreves'),
('int-3','board-1','stripe','Stripe Billing','billing','configuration','EEA','Konto, priser og skatt må godkjennes');

INSERT OR IGNORE INTO ledger_accounts (id,board_id,code,name,account_type,vat_code) VALUES
('acct-1920','board-1','1920','Bankinnskudd','asset',NULL),
('acct-2400','board-1','2400','Leverandørgjeld','liability',NULL),
('acct-3000','board-1','3000','Salgsinntekt','revenue','3'),
('acct-4300','board-1','4300','Innkjøp varer og tjenester','expense','1'),
('acct-6800','board-1','6800','Kontorrekvisita','expense','1');
INSERT OR IGNORE INTO accounting_periods (id,board_id,period,status) VALUES
('period-2026-08','board-1','2026-08','open'),('period-2026-07','board-1','2026-07','locked');
INSERT OR IGNORE INTO vouchers (id,board_id,voucher_number,voucher_date,period,description,source,status,external_reference) VALUES
('voucher-1001','board-1',1001,'2026-08-02','2026-08','Kontorrekvisita — demo','illustration','posted','INV-DEMO-001');
INSERT OR IGNORE INTO voucher_lines (id,voucher_id,account_id,description,debit_minor,credit_minor,vat_code) VALUES
('line-1001-1','voucher-1001','acct-6800','Kontorrekvisita',100000,0,'1'),('line-1001-2','voucher-1001','acct-1920','Betalt fra bank',0,100000,NULL);

INSERT OR IGNORE INTO job_requisitions (id,board_id,title,department,owner_id,status,employment_type,location,description,opened_at) VALUES
('req-1','board-1','Senior prosjektleder','Leveranse','person-1','open','full_time','Oslo','Lede kundeprosjekter og bygge bedre leveransespor.','2026-08-01');
INSERT OR IGNORE INTO candidates (id,board_id,requisition_id,name,email,stage,skills,score,consent_status) VALUES
('candidate-1','board-1','req-1','Demo Kandidat','candidate@example.invalid','interview','["prosjektledelse","SaaS"]',82,'granted');
INSERT OR IGNORE INTO handbook_documents (id,board_id,title,category,version,status,content,requires_ack,published_at) VALUES
('handbook-1','board-1','Personalhåndbok 2026','Policy','2.1','published','Reise, OTP, HMS, varsling og etiske retningslinjer — illustrert innhold.',1,'2026-01-15');
INSERT OR IGNORE INTO handbook_acknowledgements (id,board_id,handbook_id,person_id) VALUES
('ack-1','board-1','handbook-1','person-1'),('ack-2','board-1','handbook-1','person-2');
INSERT OR IGNORE INTO training_courses (id,board_id,title,category,description,duration_minutes,required,due_days,status) VALUES
('course-1','board-1','HMS og avvik','HMS','Obligatorisk introduksjon til HMS og avviksrapportering.',35,1,30,'active'),
('course-2','board-1','GDPR i praksis','Personvern','Grunnkurs i personvern for alle ansatte.',25,1,45,'active');
INSERT OR IGNORE INTO training_enrollments (id,board_id,course_id,person_id,status,due_date,score) VALUES
('enroll-1','board-1','course-1','person-1','passed','2026-08-31',92),('enroll-2','board-1','course-1','person-2','in_progress','2026-08-31',NULL),('enroll-3','board-1','course-2','person-3','assigned','2026-09-15',NULL);
INSERT OR IGNORE INTO performance_reviews (id,board_id,person_id,period,reviewer_id,status,summary,rating,due_date) VALUES
('review-1','board-1','person-2','2026-H2','person-1','manager_review','Fokus på likviditet og bedre beslutningsgrunnlag.',4,'2026-09-20');
INSERT OR IGNORE INTO offboarding_cases (id,board_id,person_id,last_day,status,access_revoked,assets_returned,payroll_reviewed,notes) VALUES
('offboard-1','board-1','person-3','2026-12-31','planned',0,0,0,'Illustrert sak — krever HR/IT/lønnsgodkjenning.');
INSERT OR IGNORE INTO asset_assignments (id,board_id,asset_id,person_id,status,assigned_at,notes) VALUES
('assign-1','board-1','asset-2','person-1','assigned','2026-01-10','Demo-laptop i bruk');
INSERT OR IGNORE INTO saas_subscriptions (id,board_id,name,vendor,owner_id,seats,monthly_minor,currency,status,renewal_date,utilization_percent,source) VALUES
('saas-1','board-1','ERP-lisenser','Demo ERP','person-3',25,189000,'NOK','active','2026-12-31',76,'illustration'),
('saas-2','board-1','Designverktøy','Demo Design','person-2',12,79000,'NOK','active','2026-10-15',42,'illustration');
INSERT OR IGNORE INTO access_reviews (id,board_id,person_id,system_name,access_level,decision,reviewer_id,reason) VALUES
('access-1','board-1','person-3','ERP','admin','pending','person-1','Årlig tilgangsrevisjon'),
('access-2','board-1','person-1','Dokumentarkiv','editor','retain','person-1','Rolle krever redigering');
INSERT OR IGNORE INTO it_lifecycle_tasks (id,board_id,offboarding_case_id,task_type,title,status,requires_approval,due_date) VALUES
('life-1','board-1','offboard-1','access','Foreslå tilgangsrevisjon for Demo IT-sjef','proposed',1,'2026-12-31'),
('life-2','board-1','offboard-1','asset','Foreslå retur av tildelte eiendeler','proposed',1,'2026-12-31'),
('life-3','board-1','offboard-1','payroll','Foreslå lønns- og feriepengesjekk','proposed',1,'2026-12-31');

INSERT OR IGNORE INTO quotes (id,board_id,account_id,quote_number,title,status,currency,subtotal_minor,discount_minor,total_minor,valid_until,owner_id,approval_required) VALUES
('quote-1','board-1','crm-1',2001,'Styr.ing kontrollplattform — pilot','pending_approval','NOK',35000000,0,35000000,'2026-09-30','person-2',1);
INSERT OR IGNORE INTO quote_lines (id,quote_id,description,quantity,unit_minor,total_minor,revenue_type) VALUES
('quote-line-1','quote-1','SaaS-plattform · 12 måneder',1,24000000,24000000,'subscription'),
('quote-line-2','quote-1','Onboarding og kontrollkart',1,11000000,11000000,'service');
INSERT OR IGNORE INTO sales_rooms (id,board_id,account_id,quote_id,name,status,mutual_action_plan,buyer_contact,expires_at) VALUES
('room-1','board-1','crm-1','quote-1','Nordic Demo AS · pilotrom','active','[{"step":"Sikkerhetskrav","owner":"Kunde","status":"open"},{"step":"Godkjenn tilbud","owner":"Kunde","status":"waiting"}]','kontakt@example.invalid','2026-09-30');
INSERT OR IGNORE INTO customer_subscriptions (id,board_id,account_id,quote_id,plan_name,status,recurring_minor,currency,interval,start_date,renewal_date) VALUES
('sub-1','board-1','crm-1','quote-1','Pilot · Styr.ing','trial',2400000,'NOK','month','2026-09-01','2026-10-01');
INSERT OR IGNORE INTO customer_cases (id,board_id,account_id,case_number,title,description,channel,priority,status,assignee_id,first_response_due,resolution_due) VALUES
('case-1','board-1','crm-1',3001,'Avklare sikkerhetskrav','Kunden trenger oversikt over tenant-isolasjon og databehandleravtale.','portal','high','open','person-2','2026-08-25 12:00','2026-08-29 17:00');
INSERT OR IGNORE INTO fleet_vehicles (id,board_id,registration,make_model,vehicle_type,status,odometer_km,next_inspection_date,insurance_renewal_date,owner_id) VALUES
('vehicle-1','board-1','SV 12345','Toyota Proace Electric','van','active',48210,'2026-09-19','2026-11-01','person-3');
INSERT OR IGNORE INTO trip_logs (id,board_id,vehicle_id,driver_id,trip_date,start_location,end_location,distance_km,trip_type,purpose,status,tax_basis) VALUES
('trip-1','board-1','vehicle-1','person-3','2026-08-22','Oslo','Drammen',86.4,'business','Kundemøte Nordic Demo AS','classified','Kilometergodtgjørelse må kvalitetssikres');
INSERT OR IGNORE INTO trip_logs (id,board_id,vehicle_id,driver_id,trip_date,start_location,end_location,distance_km,trip_type,purpose,status) VALUES
('trip-2','board-1','vehicle-1','person-3','2026-08-23','Oslo','Hjemmeadresse',18.2,'unknown','Mangler klassifisering','draft');
INSERT OR IGNORE INTO fleet_maintenance (id,board_id,vehicle_id,maintenance_type,title,due_date,status,vendor,cost_minor) VALUES
('maint-1','board-1','vehicle-1','inspection','EU-kontroll','2026-09-19','scheduled','Demo Verksted',125000);
INSERT OR IGNORE INTO facilities (id,board_id,name,address,property_type,status,owner_id) VALUES
('facility-1','board-1','Pilotselskap kontor','Karl Johans gate 1, Oslo','office','active','person-3');
INSERT OR IGNORE INTO facility_tasks (id,board_id,facility_id,task_type,title,due_date,status,assignee_id,evidence_ref) VALUES
('facility-task-1','board-1','facility-1','fire_safety','Brannrunde — kontrollpunkt B-04','2026-09-25','open','person-3',NULL);
INSERT OR IGNORE INTO projects (id,board_id,code,name,customer_account_id,status,billing_model,budget_minor,currency) VALUES
('project-1','board-1','NORDIC-PILOT','Nordic Demo AS · kontrollkart','crm-1','active','hourly',18000000,'NOK');
INSERT OR IGNORE INTO project_rates (id,board_id,project_id,role,hourly_minor,currency,valid_from) VALUES
('rate-1','board-1','project-1','Prosjektleder',145000,'NOK','2026-08-01'),
('rate-2','board-1','project-1','Konsulent',125000,'NOK','2026-08-01');
INSERT OR IGNORE INTO project_rate_costs (id,board_id,rate_id,cost_hourly_minor,currency,source) VALUES
('rate-cost-1','board-1','rate-1',82000,'NOK','illustration'),
('rate-cost-2','board-1','rate-2',70000,'NOK','illustration');
INSERT OR IGNORE INTO time_entries (id,board_id,project_id,person_id,work_date,minutes,description,billable,status,rate_minor) VALUES
('time-1','board-1','project-1','person-1','2026-08-22',150,'Workshop kontrollkart',1,'submitted',145000),
('time-2','board-1','project-1','person-2','2026-08-23',90,'Økonomisk kontrollspor',1,'approved',145000);
INSERT OR IGNORE INTO payroll_runs (id,board_id,period,status,gross_minor,tax_withheld_minor,employer_cost_minor,holiday_pay_minor,otp_minor,employee_count,calculated_at) VALUES
('payrun-1','board-1','2026-08','review',12500000,3100000,15000000,1275000,250000,3,'2026-08-24 08:00:00');
INSERT OR IGNORE INTO payroll_items (id,board_id,payroll_run_id,person_id,gross_minor,tax_minor,holiday_pay_minor,otp_minor,status) VALUES
('payitem-1','board-1','payrun-1','person-1',4200000,1050000,428400,84000,'reviewed'),
('payitem-2','board-1','payrun-1','person-2',4800000,1200000,489600,96000,'calculated'),
('payitem-3','board-1','payrun-1','person-3',3500000,850000,357000,70000,'calculated');
INSERT OR IGNORE INTO payroll_compliance_checks (id,board_id,payroll_run_id,holiday_rate,otp_rate,holiday_pay_minor,otp_minor,employee_count,status,assumptions) VALUES
('paycheck-1','board-1','payrun-1',0.102,0.02,1275000,250000,3,'review','{"holiday_basis":"gross wages","otp_basis":"pensionable salary","source":"payroll_items"}');
INSERT OR IGNORE INTO compliance_submissions (id,board_id,submission_type,period,status,payload_hash,notes) VALUES
('submit-1','board-1','a_melding','2026-08','prepared','demo-a-melding-hash','Klar for kontroll; Altinn/MOTP-adapter ikke konfigurert.'),
('submit-2','board-1','mva','2026-07','review','demo-mva-hash','SAF-T-grunnlag klart; innsending krever autorisasjon.');
INSERT OR IGNORE INTO liquidity_snapshots (id,board_id,as_of_date,cash_minor,receivables_minor,payables_minor,payroll_due_minor,runway_months,source,status) VALUES
('liq-1','board-1','2026-08-24',125000000,45000000,22000000,15000000,7.8,'illustration','reviewed');
INSERT OR IGNORE INTO collection_cases (id,board_id,account_id,reference,amount_minor,due_date,status,next_action) VALUES
('collect-1','board-1','crm-1','INV-DEMO-001',1250000,'2026-09-01','open','Forbered vennlig påminnelse');
INSERT OR IGNORE INTO purchase_orders (id,board_id,order_number,supplier_name,status,total_minor,currency,requested_by) VALUES
('po-1','board-1','PO-2026-001','Demo Leverandør AS','approved',1250000,'NOK','CFO');
INSERT OR IGNORE INTO goods_receipts (id,board_id,purchase_order_id,received_date,received_by,status,notes) VALUES
('gr-1','board-1','po-1','2026-08-22','Ola Turmo','confirmed','Kontorutstyr mottatt');
INSERT OR IGNORE INTO supplier_invoices (id,board_id,purchase_order_id,invoice_number,supplier_name,amount_minor,currency,due_date,status,match_status) VALUES
('si-1','board-1','po-1','INV-2026-001','Demo Leverandør AS',1250000,'NOK','2026-09-01','matched','matched');
INSERT OR IGNORE INTO project_invoice_drafts (id,board_id,project_id,period,source_minutes,amount_minor,currency,status,created_by) VALUES
('invprep-1','board-1','project-1','2026-08',240,560000,'NOK','prepared','CFO');
INSERT OR IGNORE INTO corporate_cards (id,board_id,card_name,last_four,holder_id,status,monthly_limit_minor,currency,provider) VALUES
('card-1','board-1','Demo driftskort','4242','person-2','proposed',5000000,'NOK','Provider not configured');
INSERT OR IGNORE INTO card_transactions (id,board_id,card_id,transaction_date,merchant,amount_minor,currency,category,status,receipt_ref) VALUES
('cardtx-1','board-1','card-1','2026-08-23','Nordic kontorrekvisita',125000,'NOK','Kontor','needs_receipt',NULL),
('cardtx-2','board-1','card-1','2026-08-21','Cloud hosting demo',89000,'NOK','Programvare','ready_for_review','receipt-demo-2');
INSERT OR IGNORE INTO fixed_assets (id,board_id,asset_number,name,category,acquisition_date,acquisition_cost_minor,residual_value_minor,currency,financial_method,useful_life_months,tax_group,tax_rate_percent,status) VALUES
('fixed-1','board-1','AM-2026-001','Toyota Proace Electric','Kjøretøy','2026-01-01',62000000,5000000,'NOK','linear',60,'d',20,'active'),
('fixed-2','board-1','AM-2026-002','Kontorinnredning','Inventar','2026-03-01',2400000,0,'NOK','linear',60,'d',20,'active');
INSERT OR IGNORE INTO depreciation_entries (id,board_id,asset_id,period,ledger_type,amount_minor,accumulated_minor,book_value_minor,status) VALUES
('dep-1','board-1','fixed-1','2026-08','financial',950000,7600000,54400000,'review'),
('dep-2','board-1','fixed-1','2026-08','tax',1033333,8266664,53733336,'review'),
('dep-3','board-1','fixed-2','2026-08','financial',40000,240000,2160000,'calculated'),
('dep-4','board-1','fixed-2','2026-08','tax',40000,240000,2160000,'calculated');
INSERT OR IGNORE INTO revenue_contracts (id,board_id,account_id,quote_id,contract_number,title,start_date,end_date,transaction_price_minor,currency,status) VALUES
('revcon-1','board-1','crm-1','quote-1','RC-2026-001','Nordic Demo AS · pilot','2026-09-01','2027-08-31',35000000,'NOK','review');
INSERT OR IGNORE INTO performance_obligations (id,board_id,contract_id,description,recognition_method,allocated_minor,satisfied_percent) VALUES
('ob-1','board-1','revcon-1','SaaS-plattform · 12 måneder','over_time',24000000,0),
('ob-2','board-1','revcon-1','Onboarding og kontrollkart','point_in_time',11000000,0);
INSERT OR IGNORE INTO revenue_schedule_entries (id,board_id,contract_id,obligation_id,period,planned_minor,recognized_minor,status) VALUES
('reventry-1','board-1','revcon-1','ob-1','2026-09',2000000,0,'planned'),
('reventry-2','board-1','revcon-1','ob-2','2026-09',11000000,0,'review'),
('reventry-3','board-1','revcon-1','ob-1','2026-10',2000000,0,'planned');
