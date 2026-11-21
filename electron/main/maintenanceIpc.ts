import { dialog, ipcMain, shell } from 'electron'
import { exportBundle } from './db/bundle.ts'
import { mkdir } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { requireLibrary } from './libraryService.ts'
import { currentVersion } from './db/migrate.ts'
import { createBackup, listBackups } from './db/backup.ts'
import { queryAll } from './db/connection.ts'
import { restoreNote } from './db/annotations.ts'
import { restoreBook } from './db/library.ts'
import type { TrashItem } from '../../src/types/maintenance.ts'

export function registerMaintenanceIpc(trust: (url: string) => void) {
  let exporting = false
  ipcMain.handle('maintenance:exportBundle', async (event) => {
    trust(event.senderFrame?.url ?? '')
    if (exporting) throw new Error('已有导出任务正在运行')
    exporting = true
    try {
      const result = await dialog.showSaveDialog({ title: '导出完整知识库', defaultPath: `shiyun-${Date.now()}.shiyunbundle`, filters: [{ name: '诗云知识库', extensions: ['shiyunbundle'] }] })
      if (result.canceled || !result.filePath) return null
      const { db, paths } = requireLibrary()
      const inside = relative(resolve(paths.root), resolve(result.filePath))
      if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) throw new Error('请选择书库数据目录以外的位置保存导出包')
      await exportBundle(db, paths, result.filePath)
      return result.filePath
    } finally { exporting = false }
  })
  ipcMain.handle('maintenance:status', (event) => {
    trust(event.senderFrame?.url ?? '')
    const { db, paths } = requireLibrary()
    const newest = listBackups(paths.backupsDir)[0]
    const check = db.prepare('PRAGMA quick_check').get() as { quick_check?: unknown } | undefined
    return {
      dataDir: paths.root,
      logDir: join(paths.root, 'logs'),
      schemaVersion: currentVersion(db),
      lastBackupAt: newest ? new Date(newest.mtimeMs).toISOString() : null,
      integrity: check?.quick_check === 'ok' ? 'ok' : 'error',
    }
  })
  ipcMain.handle('maintenance:trash', (event): TrashItem[] => {
    trust(event.senderFrame?.url ?? '')
    return queryAll<TrashItem>(requireLibrary().db, `SELECT id, title, 'book' AS kind, deleted_at AS deletedAt FROM books WHERE deleted_at IS NOT NULL UNION ALL SELECT id, title, 'note' AS kind, deleted_at AS deletedAt FROM notes WHERE deleted_at IS NOT NULL ORDER BY deletedAt DESC`)
  })
  ipcMain.handle('maintenance:restore', (event, kind: unknown, id: unknown) => {
    trust(event.senderFrame?.url ?? '')
    if ((kind !== 'book' && kind !== 'note') || typeof id !== 'string' || !id || id.length > 200) throw new TypeError('Invalid restore request')
    const { db } = requireLibrary()
    if (kind === 'book') restoreBook(db, id)
    else restoreNote(db, id)
  })
  ipcMain.handle('maintenance:openDirectory', async (event, kind: unknown) => {
    trust(event.senderFrame?.url ?? '')
    if (kind !== 'data' && kind !== 'logs') throw new TypeError('Invalid directory')
    const path = kind === 'data' ? requireLibrary().paths.root : join(requireLibrary().paths.root, 'logs')
    await mkdir(path, { recursive: true })
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
  ipcMain.handle('maintenance:backup', (event) => {
    trust(event.senderFrame?.url ?? '')
    const { db, paths } = requireLibrary()
    createBackup(db, paths.dbFile, paths.backupsDir)
  })
}
