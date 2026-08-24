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
