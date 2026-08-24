import { authorizeWrite, json, requireDb, type Env } from './_lib';
import { searchBoard } from './search';

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const result = (id: RpcRequest['id'], value: unknown) => json({ jsonrpc: '2.0', id: id ?? null, result: value });
const error = (id: RpcRequest['id'], code: number, message: string) => json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status: code === -32001 ? 401 : 400 });

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return error(null, -32001, 'mcp_authentication_required');
  let rpc: RpcRequest;
  try { rpc = await request.json() as RpcRequest; } catch { return error(null, -32700, 'invalid_json'); }
  const id = rpc.id;
  if (rpc.jsonrpc !== '2.0' || !rpc.method) return error(id, -32600, 'invalid_request');
  if (rpc.method === 'initialize') return result(id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'styr.ing', version: '1.0' } });
  if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 });
  if (rpc.method === 'tools/list') return result(id, { tools: [{ name: 'search_board', description: 'Søk i ett autorisert Styr.ing-board med kildemerking. Returnerer bare utkast til videre menneskelig vurdering.', inputSchema: { type: 'object', required: ['boardId', 'query'], properties: { boardId: { type: 'string' }, query: { type: 'string', minLength: 2 } } } }] });
  if (rpc.method === 'tools/call') {
    const params = rpc.params || {};
    const name = String(params.name || '');
    if (name !== 'search_board') return error(id, -32602, 'unknown_tool');
    const args = (params.arguments && typeof params.arguments === 'object') ? params.arguments as Record<string, unknown> : {};
    const boardId = String(args.boardId || '').trim();
    const query = String(args.query || '').trim();
    if (!boardId || query.length < 2) return error(id, -32602, 'boardId_and_query_required');
    try {
      const data = await searchBoard(requireDb(env), boardId, query);
      return result(id, { content: [{ type: 'text', text: JSON.stringify({ boardId, query, data, humanReviewRequired: true }) }], structuredContent: { boardId, query, data, humanReviewRequired: true } });
    } catch (e) { return error(id, -32000, e instanceof Error ? e.message : 'database_unavailable'); }
  }
  return error(id, -32601, 'method_not_found');
};
