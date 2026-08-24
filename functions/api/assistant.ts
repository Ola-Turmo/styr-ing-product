import { authorizeBoardWrite, body, id, json, recordAudit, requireDb, type Env } from './_lib';
import { searchBoard, type SearchResult } from './search';

function draftAnswer(question: string, results: SearchResult[]) {
  if (!results.length) return `Jeg fant ingen treff på «${question}». Prøv et navn, en risiko, et vedtak eller en frist.`;
  const lead = results.slice(0, 3).map((result, index) => `${index + 1}. ${result.title} (${result.type}) — ${result.snippet || 'Se kilden for detaljer.'}`).join(' ');
  return `Basert på registrerte kilder fant jeg ${results.length} relevante treff. ${lead}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const value = await body(request);
    const boardId = String(value?.boardId || '').trim();
    const question = String(value?.question || '').trim().slice(0, 500);
    if (!boardId) return json({ error: 'boardId_required' }, { status: 400 });
    if (question.length < 2) return json({ error: 'question_too_short', minLength: 2 }, { status: 400 });
    const authorization = await authorizeBoardWrite(request, env, boardId);
    if (!authorization.allowed) return json({ error: 'write_not_authorized' }, { status: 401 });
    const db = requireDb(env);
    const results = await searchBoard(db, boardId, question);
    const answer = draftAnswer(question, results);
    const citations = results.slice(0, 8).map((result) => ({ type: result.type, title: result.title, source: result.source, id: result.sourceId }));
    const draftId = id('draft');
    await db.prepare('INSERT INTO ai_drafts (id, board_id, question, answer, citations, status, provider) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(draftId, boardId, question, answer, JSON.stringify(citations), 'draft', 'rules-based-preview').run();
    await recordAudit(db, { boardId, action: 'ai_draft_created', entityType: 'ai_draft', entityId: draftId, userId: authorization.userId || undefined, details: { provider: 'rules-based-preview', resultCount: results.length } });
    return json({ ok: true, id: draftId, boardId, question, answer, citations, status: 'draft', provider: 'rules-based-preview', confidence: results.length ? 'grounded' : 'insufficient_context', requiresHumanApproval: true, executed: false });
  } catch (error) {
    return json({ error: 'database_unavailable', detail: error instanceof Error ? error.message : 'unknown' }, { status: 503 });
  }
};
