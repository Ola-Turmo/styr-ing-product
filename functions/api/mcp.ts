import { authorizeWrite, json, requireDb, type Env } from './_lib';
import { searchBoard } from './search';

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const rpcResult = (id: RpcRequest['id'], value: unknown) => json({ jsonrpc: '2.0', id: id ?? null, result: value });
const rpcError = (id: RpcRequest['id'], code: number, message: string) => json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status: code === -32001 ? 401 : 400 });

export const onRequestGet: PagesFunction<Env> = async () => json({ service: 'styr.ing-mcp', protocol: 'JSON-RPC 2.0', authentication: 'x-styr-api-key', mode: 'read-only', tools: ['search_board'], humanReviewRequired: true, writes: false });

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!authorizeWrite(request, env)) return rpcError(null, -32001, 'mcp_authentication_required');
  let rpc: RpcRequest;
  try { rpc = await request.json() as RpcRequest; } catch { return rpcError(null, -32700, 'invalid_json'); }
  const requestId = rpc.id;
  if (rpc.jsonrpc !== '2.0' || !rpc.method) return rpcError(requestId, -32600, 'invalid_request');
  if (rpc.method === 'initialize') return rpcResult(requestId, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'styr.ing', version: '1.0' } });
  if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 });
  if (rpc.method === 'tools/list') return rpcResult(requestId, { tools: [{ name: 'search_board', description: 'Søk i ett autorisert Styr.ing-board med kildemerking. Returnerer bare utkast til videre menneskelig vurdering.', inputSchema: { type: 'object', required: ['boardId', 'query'], properties: { boardId: { type: 'string' }, query: { type: 'string', minLength: 2 } } } }] });
  if (rpc.method === 'tools/call') {
    const params = rpc.params || {}; if (String(params.name || '') !== 'search_board') return rpcError(requestId, -32602, 'unknown_tool');
    const args = (params.arguments && typeof params.arguments === 'object') ? params.arguments as Record<string, unknown> : {}; const boardId = String(args.boardId || '').trim(); const query = String(args.query || '').trim();
    if (!boardId || query.length < 2) return rpcError(requestId, -32602, 'boardId_and_query_required');
    try { const data = await searchBoard(requireDb(env), boardId, query); return rpcResult(requestId, { content: [{ type: 'text', text: JSON.stringify({ boardId, query, data, humanReviewRequired: true }) }], structuredContent: { boardId, query, data, humanReviewRequired: true } }); } catch (error) { return rpcError(requestId, -32000, error instanceof Error ? error.message : 'database_unavailable'); }
  }
  return rpcError(requestId, -32601, 'method_not_found');
};
