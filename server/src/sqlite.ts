import type { SqlDriver, SqlValue } from '@agenthub/core';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openSqlite(path: string): SqlDriver {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  return {
    run: (sql: string, ...params: SqlValue[]) => void db.prepare(sql).run(...params),
    all: <T>(sql: string, ...params: SqlValue[]) => db.prepare(sql).all(...params) as T[],
    transaction: <T>(fn: () => T) => db.transaction(fn)(),
  };
}
