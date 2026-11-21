import type { DatabaseSync } from 'node:sqlite'
import { queryAll, queryOne } from './connection.ts'
import { migration001 } from './migrations/001_init.ts'
import { migration002 } from './migrations/002_note_search.ts'
import { migration003 } from './migrations/003_galaxies.ts'
import { migration004 } from './migrations/004_clippings.ts'

export interface Migration {
  version: number
  name: string
  up: (db: DatabaseSync) => void
}

/**
 * 迁移清单，按 version 升序执行。
 *
 * 只进不退：已发布的迁移不允许修改，只能追加新版本（DATABASE_SCHEMA.md 第 5 节）。
 */
export const migrations: readonly Migration[] = [migration001, migration002, migration003, migration004]

function ensureLedger(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

/** 尚未应用的版本号；启动时用它判断要不要先备份。 */
export function pendingVersions(db: DatabaseSync, list: readonly Migration[] = migrations): number[] {
  ensureLedger(db)
  const applied = new Set(queryAll<{ version: number }>(db, 'SELECT version FROM schema_migrations').map((row) => Number(row.version)))
  return list.filter((migration) => !applied.has(migration.version)).map((migration) => migration.version).sort((a, b) => a - b)
}

export function currentVersion(db: DatabaseSync): number {
  ensureLedger(db)
  const row = queryOne<{ version: number | null }>(db, 'SELECT MAX(version) AS version FROM schema_migrations')
  return row?.version ?? 0
}

/**
 * 应用所有未执行的迁移，返回本次新应用的版本号。
 * 每个版本一个事务：任何一步失败都会回滚该版本并抛出，由调用方拒绝启动（备份在前）。
 */
export function runMigrations(db: DatabaseSync, list: readonly Migration[] = migrations): number[] {
  ensureLedger(db)
  const applied = new Set(queryAll<{ version: number }>(db, 'SELECT version FROM schema_migrations').map((row) => Number(row.version)))
  const pending = [...list].sort((a, b) => a.version - b.version).filter((migration) => !applied.has(migration.version))

  const done: number[] = []
  for (const migration of pending) {
    db.exec('BEGIN')
    try {
      migration.up(db)
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
      db.exec('COMMIT')
      done.push(migration.version)
    } catch (error) {
      db.exec('ROLLBACK')
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`迁移 ${migration.version}_${migration.name} 失败，已回滚：${message}`)
    }
  }
  return done
}
