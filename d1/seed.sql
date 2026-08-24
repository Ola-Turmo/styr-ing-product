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
