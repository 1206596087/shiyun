import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

export const BACKUP_KEEP = 14
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

const BACKUP_PATTERN = /^shiyun-\d{8}-\d{6}\.db$/

export function backupFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `shiyun-${stamp}.db`
}

export function listBackups(backupDir: string): { name: string; path: string; mtimeMs: number }[] {
  if (!existsSync(backupDir)) return []
  return readdirSync(backupDir)
    .filter((name) => BACKUP_PATTERN.test(name))
    .map((name) => ({ name, path: join(backupDir, name), mtimeMs: statSync(join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/**
 * 复制一份库文件到 backups/，并只保留最近 BACKUP_KEEP 份。
 *
 * WAL 模式下必须先 checkpoint，否则复制到的 .db 可能缺少最近的提交。
 * 备份只包含数据库，不含 books/ 里的原始文件（那些是用户自己的书）。
 */
export function createBackup(db: DatabaseSync, dbFile: string, backupDir: string, now = new Date(), keep = BACKUP_KEEP): string {
  if (!existsSync(dbFile)) throw new Error(`数据库文件不存在：${dbFile}`)
  mkdirSync(backupDir, { recursive: true })
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const target = join(backupDir, backupFileName(now))
  copyFileSync(dbFile, target)

  for (const stale of listBackups(backupDir).slice(keep)) {
    rmSync(stale.path, { force: true })
  }
  return target
}

/** 距最近一次备份超过 24 小时（或从未备份）时返回 true。 */
export function shouldAutoBackup(backupDir: string, now = new Date(), intervalMs = BACKUP_INTERVAL_MS): boolean {
  const newest = listBackups(backupDir)[0]
  if (!newest) return true
  return now.getTime() - newest.mtimeMs >= intervalMs
}
