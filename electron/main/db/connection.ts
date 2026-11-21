import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from 'node:sqlite'

/**
 * 打开书库连接。
 *
 * 只应该由主进程调用一次；渲染进程通过 IPC 访问（见 AGENTS.md 第 1 节第 7 条）。
 * WAL 让读写并发不互相阻塞；foreign_keys 每个连接都必须显式打开，SQLite 默认是关的。
 */
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA synchronous = NORMAL')
  return db
}

export function queryAll<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T[] {
  const rows = db.prepare(sql).all(...params) as Record<string, SQLOutputValue>[]
  return rows as unknown as T[]
}

export function queryOne<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T | undefined {
  const row = db.prepare(sql).get(...params) as Record<string, SQLOutputValue> | undefined
  return row as unknown as T | undefined
}

export function execute(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): void {
  db.prepare(sql).run(...params)
}

/** node:sqlite 没有 better-sqlite3 那样的事务包装器，这里手工实现同样的语义。 */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
