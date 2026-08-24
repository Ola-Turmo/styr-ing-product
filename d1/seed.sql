INSERT OR IGNORE INTO boards (id,company_id,name,description,org_number,status,plan)
VALUES ('board-1','company-demo','Styret 2026','Fiktivt hovedstyre for Pilotselskap AS','123456789','active','pilot');

INSERT OR IGNORE INTO board_members (id,board_id,name,email,role,since) VALUES
('m1','board-1','Demo Leder','leder@example.invalid','leader','2026-01-01'),
('m2','board-1','Demo Nestleder','nestleder@example.invalid','deputy','2026-01-01'),
('m3','board-1','Demo Medlem A','medlem-a@example.invalid','member','2026-01-01');

INSERT OR IGNORE INTO meetings (id,board_id,title,date,time,location,status,agenda,minutes) VALUES
('mtg-ext-1','board-1','Q1 Resultater','2026-05-15','09:00','Styrerommet','completed','["Åpning","Resultater","Likviditet"]','Illustrert protokollutkast'),
('mtg-ext-2','board-1','Strategi 2027','2026-09-12','10:00','Digitalt','planned','["Strategi","Investeringer"]',NULL);

INSERT OR IGNORE INTO risks (id,board_id,code,title,level,trend,owner,status,treatment,due_date) VALUES
('risk-1','board-1','R-001','Leverandørkonsentrasjon — single-source IT-drift','critical','up','CTO','treating','Kvalifiser alternativ leverandør','2026-09-30'),
('risk-2','board-1','R-002','Manglende databehandleravtaler','high','stable','DPO','open','Fullfør leverandørgjennomgang','2026-09-15');

INSERT OR IGNORE INTO action_items (id,board_id,meeting_id,title,description,assigned_to,due_date,priority,status) VALUES
('action-1','board-1','mtg-ext-1','Ferdigstill budsjett H2','Oppdater likviditetsforutsetninger og styrenotat','CFO','2026-09-01','high','in_progress'),
('action-2','board-1','mtg-ext-1','Lukk tilgangsavvik ERP','Dokumenter roller og fjern inaktive tilganger','IT-sjef','2026-08-31','critical','blocked');

INSERT OR IGNORE INTO resolutions (id,board_id,meeting_id,number,title,description,status,votes_for,signature_status,adoption_date) VALUES
('resolution-1','board-1','mtg-ext-1','2026/03','Godkjenning av årsberetning','Årsberetningen godkjennes som fremlagt','signed',3,'complete','2026-05-15');

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
