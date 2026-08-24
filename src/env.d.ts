/// <reference path="../.astro/types.d.ts" />

interface D1Result<T = Record<string, unknown>> { results: T[]; success: boolean; meta?: Record<string, unknown>; }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): D1Result<T>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): { success: boolean; meta?: Record<string, unknown> };
}
interface D1Database { prepare(sql: string): D1PreparedStatement; batch(statements: D1PreparedStatement[]): Promise<unknown>; }
type PagesFunction<E = Record<string, unknown>> = (context: {
  request: Request;
  env: E;
  params: Record<string, string | undefined>;
}) => Response | Promise<Response>;
