import Database from 'better-sqlite3';
import type { SqlDriver, SqlValue } from '../src/sql.js';

/** In-memory SQLite driver for tests (the Node server ships its own). */
export function memoryDriver(): SqlDriver {
  const db = new Database(':memory:');
  return {
    run: (sql: string, ...params: SqlValue[]) => void db.prepare(sql).run(...params),
    all: <T>(sql: string, ...params: SqlValue[]) => db.prepare(sql).all(...params) as T[],
    transaction: <T>(fn: () => T) => db.transaction(fn)(),
  };
}
