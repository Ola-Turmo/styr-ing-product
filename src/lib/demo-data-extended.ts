// Extended demo data for full Styreportal experience
// Norwegian board portal — realistic demo content

export interface AgendaItem {
  id: string; number: number; title: string; type: 'decision'|'discussion'|'information'|'election';
  description?: string; prepared_by?: string; documents?: string[]; duration_min: number;
  status: 'pending'|'in_progress'|'completed'; decision?: string; notes?: string;
}

export interface Meeting {
  id: string; board_id: string; title: string; date: string; time: string; location: string;
  status: 'draft'|'scheduled'|'in_progress'|'completed'|'archived';
  agenda_items: AgendaItem[]; attendees: string[]; minutes_draft?: string;
  minutes_status: 'not_started'|'drafting'|'review'|'approved';
  minutes_approved_by?: string; minutes_approved_at?: string;
  pack_status: 'not_started'|'assembling'|'ready'|'distributed';
  total_duration_min: number;
}

export interface ActionItem {
  id: string; board_id: string; meeting_id: string;
  title: string; description: string; assigned_to: string; assigned_to_name: string;
  priority: 'low'|'medium'|'high'|'critical'; status: 'open'|'in_progress'|'blocked'|'completed';
  due_date: string; created_at: string; completed_at?: string;
  source: string;
}

export interface Resolution {
  id: string; board_id: string; meeting_id: string;
  number: string; title: string; description: string;
  type: 'ordinary'|'extraordinary'|'written';
  status: 'draft'|'proposed'|'adopted'|'rejected'|'signed'|'archived';
  proposed_by: string; seconded_by?: string;
  votes_for: number; votes_against: number; votes_abstain: number;
  adoption_date?: string; signature_status: 'not_required'|'pending'|'partial'|'complete';
  signatures_required: number; signatures_completed: number;
  signatories: { name: string; status: 'pending'|'signed'|'declined'; signed_at?: string }[];
}

export interface BoardDocument {
  id: string; board_id: string; meeting_id?: string;
  title: string; type: 'agenda'|'minutes'|'report'|'presentation'|'policy'|'financial'|'contract'|'other';
  category: string; uploaded_by: string; uploaded_at: string;
  version: number; size_kb: number; page_count?: number;
  status: 'draft'|'final'|'archived'; tags: string[];
}

export const demoMeetingsExtended: Meeting[] = [
  { id: 'mtg-ext-1', board_id: 'board-1', title: 'Ordinært styremøte Q2 2026', date: '2026-06-15', time: '09:00-12:00', location: 'Hovedkontor, Møterom Fjord', status: 'scheduled', attendees: ['m1','m2','m3','m4','m5'], pack_status: 'assembling', total_duration_min: 160, minutes_status: 'not_started',
    agenda_items: [
      { id:'ag-1',number:1,title:'Godkjenning av innkalling og agenda',type:'decision',duration_min:5,status:'pending'},
      { id:'ag-2',number:2,title:'Godkjenning av protokoll fra forrige møte',type:'decision',duration_min:5,status:'pending'},
      { id:'ag-3',number:3,title:'Statusrapport — drift og økonomi Q1 2026',type:'discussion',prepared_by:'CFO',duration_min:30,status:'pending'},
      { id:'ag-4',number:4,title:'Ny strategi for bærekraft 2027-2030',type:'discussion',prepared_by:'CEO',duration_min:45,status:'pending',documents:['strategi-baerekraft.pdf']},
      { id:'ag-5',number:5,title:'Godkjenning av budsjett H2 2026',type:'decision',prepared_by:'CFO',duration_min:25,status:'pending'},
      { id:'ag-6',number:6,title:'Valg av nytt styremedlem',type:'election',prepared_by:'Valgkomité',duration_min:20,status:'pending'},
      { id:'ag-7',number:7,title:'Status compliance-kalender — regulatoriske frister',type:'information',prepared_by:'Sekretær',duration_min:15,status:'pending'},
      { id:'ag-8',number:8,title:'Eventuelt',type:'information',duration_min:15,status:'pending'}
    ]},
  { id: 'mtg-ext-2', board_id: 'board-1', title: 'Ekstraordinært styremøte — Leverandørkontrakt', date: '2026-05-20', time: '14:00-15:30', location: 'Teams', status: 'scheduled', attendees: ['m1','m2','m3'], pack_status: 'ready', total_duration_min: 75, minutes_status: 'not_started',
    agenda_items: [
      { id:'ag-9',number:1,title:'Godkjenning av innkalling',type:'decision',duration_min:5,status:'pending'},
      { id:'ag-10',number:2,title:'Vurdering av ny hovedleverandør IT-drift',type:'decision',prepared_by:'CTO',duration_min:50,status:'pending',documents:['leverandor-it.pdf','kontrakt-utkast.pdf']},
      { id:'ag-11',number:3,title:'Fullmakt til signering av kontrakt',type:'decision',duration_min:20,status:'pending'}
    ]},
  { id: 'mtg-ext-3', board_id: 'board-1', title: 'Styremøte Q1 2026 — Resultatgjennomgang', date: '2026-03-15', time: '09:00-12:00', location: 'Hovedkontor', status: 'completed', attendees: ['m1','m2','m3','m4','m5'], pack_status: 'distributed', total_duration_min: 145, minutes_status: 'approved', minutes_approved_by: 'Ola Turmo', minutes_approved_at: '2026-03-20',
    agenda_items: [
      { id:'ag-12',number:1,title:'Godkjenning av innkalling og agenda',type:'decision',duration_min:5,status:'completed',decision:'Godkjent'},
      { id:'ag-13',number:2,title:'Godkjenning av protokoll fra forrige møte',type:'decision',duration_min:5,status:'completed',decision:'Godkjent'},
      { id:'ag-14',number:3,title:'Årsregnskap 2025',type:'decision',prepared_by:'CFO',duration_min:45,status:'completed',decision:'Godkjent enstemmig'},
      { id:'ag-15',number:4,title:'Strategi for digital transformasjon 2026',type:'discussion',prepared_by:'CEO',duration_min:40,status:'completed'},
      { id:'ag-16',number:5,title:'Internkontroll — årlig gjennomgang',type:'discussion',duration_min:30,status:'completed'},
      { id:'ag-17',number:6,title:'Styrets årsberetning',type:'decision',duration_min:20,status:'completed',decision:'Vedtatt 3-2'}
    ]}
];

export const demoActionItems: ActionItem[] = [
  { id:'act-1',board_id:'board-1',meeting_id:'mtg-ext-1',title:'Utarbeide detaljert budsjett H2 2026',description:'CFO skal utarbeide budsjett med 3 vekstbaner',assigned_to:'m3',assigned_to_name:'CFO',priority:'high',status:'in_progress',due_date:'2026-05-30',created_at:'2026-04-10',source:'meeting'},
  { id:'act-2',board_id:'board-1',meeting_id:'mtg-ext-1',title:'Innkalling til generalforsamling',description:'Med full saksdokumentasjon, minst 3 uker før',assigned_to:'m5',assigned_to_name:'Sekretær',priority:'critical',status:'open',due_date:'2026-05-25',created_at:'2026-04-10',source:'meeting'},
  { id:'act-3',board_id:'board-1',meeting_id:'mtg-ext-3',title:'Send årsregnskap til Brønnøysund',description:'Alle vedlegg og signaturer må være klare',assigned_to:'m3',assigned_to_name:'CFO',priority:'high',status:'in_progress',due_date:'2026-07-31',created_at:'2026-03-20',source:'resolution'},
  { id:'act-4',board_id:'board-1',meeting_id:'mtg-ext-3',title:'Lukk avvik — tilgangsstyring ERP',description:'Kritisk avvik internkontroll. Tekniske tiltak + dokumentasjon',assigned_to:'m4',assigned_to_name:'IT-ansvarlig',priority:'critical',status:'blocked',due_date:'2026-04-30',created_at:'2026-03-20',source:'compliance'},
  { id:'act-5',board_id:'board-1',meeting_id:'mtg-ext-3',title:'Oppdatere styreinstruks',description:'Oppdatere iht. nye krav i Aksjeloven + e-signering',assigned_to:'m2',assigned_to_name:'Styremedlem',priority:'medium',status:'open',due_date:'2026-06-15',created_at:'2026-03-20',source:'manual'},
  { id:'act-6',board_id:'board-1',meeting_id:'mtg-ext-1',title:'Innhente tilbud pensjonsavtale',description:'Minst 3 tilbud — sammenligne og anbefale',assigned_to:'m3',assigned_to_name:'CFO',priority:'medium',status:'open',due_date:'2026-06-01',created_at:'2026-04-10',source:'meeting'},
];

export const demoResolutions: Resolution[] = [
  { id:'res-1',board_id:'board-1',meeting_id:'mtg-ext-3',number:'2026/01',title:'Godkjenning av årsregnskap 2025',description:'Oversendes generalforsamling med anbefaling om godkjenning',type:'ordinary',status:'adopted',proposed_by:'Styreleder',seconded_by:'Nestleder',votes_for:5,votes_against:0,votes_abstain:0,adoption_date:'2026-03-15',signature_status:'pending',signatures_required:2,signatures_completed:1,signatories:[{name:'Ola Turmo',status:'signed',signed_at:'2026-03-15'},{name:'Nestleder',status:'pending'}]},
  { id:'res-2',board_id:'board-1',meeting_id:'mtg-ext-3',number:'2026/02',title:'Digital transformasjon — strategisk retning',description:'Strategiplan vedtatt. Detaljert handlingsplan innen neste møte',type:'ordinary',status:'adopted',proposed_by:'CEO',seconded_by:'Styreleder',votes_for:4,votes_against:0,votes_abstain:1,adoption_date:'2026-03-15',signature_status:'not_required',signatures_required:0,signatures_completed:0,signatories:[]},
  { id:'res-3',board_id:'board-1',meeting_id:'mtg-ext-3',number:'2026/03',title:'Styrets årsberetning 2025',description:'Årsberetning for regnskapsåret 2025 vedtatt og signert',type:'ordinary',status:'signed',proposed_by:'Styreleder',votes_for:3,votes_against:2,votes_abstain:0,adoption_date:'2026-03-15',signature_status:'complete',signatures_required:2,signatures_completed:2,signatories:[{name:'Ola Turmo',status:'signed',signed_at:'2026-03-20'},{name:'Nestleder',status:'signed',signed_at:'2026-03-21'}]},
  { id:'res-4',board_id:'board-1',meeting_id:'mtg-ext-1',number:'2026/04',title:'Budsjett H2 2026 — foreløpig ramme',description:'Budsjettramme 12,5 MNOK. CFO utarbeider endelig budsjett',type:'ordinary',status:'proposed',proposed_by:'CFO',votes_for:0,votes_against:0,votes_abstain:0,signature_status:'not_required',signatures_required:0,signatures_completed:0,signatories:[]},
];

export const demoDocuments: BoardDocument[] = [
  { id:'doc-1',board_id:'board-1',meeting_id:'mtg-ext-3',title:'Styreprotokoll Q1 2026',type:'minutes',category:'Protokoller',uploaded_by:'Kari Sekretær',uploaded_at:'2026-03-20',version:1,size_kb:245,page_count:4,status:'final',tags:['protokoll','Q1','2026']},
  { id:'doc-2',board_id:'board-1',meeting_id:'mtg-ext-3',title:'Årsregnskap 2025 — komplett',type:'financial',category:'Regnskap',uploaded_by:'CFO',uploaded_at:'2026-03-10',version:2,size_kb:1240,page_count:32,status:'final',tags:['årsregnskap','2025']},
  { id:'doc-3',board_id:'board-1',meeting_id:'mtg-ext-3',title:'Strategi digital transformasjon 2026',type:'report',category:'Strategi',uploaded_by:'CEO',uploaded_at:'2026-03-08',version:1,size_kb:890,page_count:18,status:'final',tags:['strategi','digitalisering']},
  { id:'doc-4',board_id:'board-1',meeting_id:'mtg-ext-1',title:'Utkast budsjett H2 2026',type:'financial',category:'Regnskap',uploaded_by:'CFO',uploaded_at:'2026-05-01',version:3,size_kb:560,page_count:14,status:'draft',tags:['budsjett','H2','2026']},
  { id:'doc-5',board_id:'board-1',meeting_id:'mtg-ext-1',title:'Presentasjon: Bærekraftstrategi 2027-2030',type:'presentation',category:'Strategi',uploaded_by:'CEO',uploaded_at:'2026-04-28',version:1,size_kb:3200,page_count:24,status:'draft',tags:['bærekraft','strategi']},
  { id:'doc-6',board_id:'board-1',title:'Styreinstruks Pilotselskap AS',type:'policy',category:'Retningslinjer',uploaded_by:'Styreleder',uploaded_at:'2026-01-15',version:1,size_kb:180,page_count:6,status:'final',tags:['styreinstruks']},
  { id:'doc-7',board_id:'board-1',title:'Etiske retningslinjer for styret',type:'policy',category:'Retningslinjer',uploaded_by:'Styreleder',uploaded_at:'2026-01-15',version:1,size_kb:95,page_count:3,status:'final',tags:['etikk']},
];