export type SqlValue = string | number | null;

/**
 * The tiny synchronous SQLite surface the core needs. Implemented with
 * better-sqlite3 on Node and with `ctx.storage.sql` in Durable Objects.
 */
export interface SqlDriver {
  run(sql: string, ...params: SqlValue[]): void;
  all<T>(sql: string, ...params: SqlValue[]): T[];
  transaction<T>(fn: () => T): T;
}

export function first<T>(db: SqlDriver, sql: string, ...params: SqlValue[]): T | undefined {
  return db.all<T>(sql, ...params)[0];
}

/** Runs each `;`-separated statement on its own (Durable Objects reject batches with bindings). */
export function runSchema(db: SqlDriver, schema: string) {
  for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) db.run(stmt);
}
