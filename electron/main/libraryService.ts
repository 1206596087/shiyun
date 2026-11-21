import { app, BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import type { ImportReport, LibraryNodeKind, LibraryTree } from '../../src/types/library.ts'
import { createBackup, listBackups, shouldAutoBackup } from './db/backup.ts'
import { openDatabase } from './db/connection.ts'
import { importBookFromPath } from './db/importBook.ts'
import {
  createFolder,
  deleteBook,
  deleteFolder,
  listTree,
  moveNode,
  renameNode,
  restoreBook,
} from './db/library.ts'
import { pendingVersions, runMigrations } from './db/migrate.ts'
import { resolveDataPaths, type DataPaths } from './db/paths.ts'
import { importPrototypeGraph, prototypeImportState } from './db/prototypeImport.ts'
import type { KnowledgeGraphData } from '../../src/types/knowledge.ts'

let db: DatabaseSync | null = null
let paths: DataPaths | null = null

/**
 * 打开书库：建目录 → 打开连接 → （有旧库时先备份）→ 迁移 → 24 小时自动备份。
 *
 * 任何一步失败都向上抛，由 main/index.ts 弹窗并退出——宁可不开，也不要在半迁移的库上继续写。
 */
export function initLibrary(): void {
  const resolved = resolveDataPaths(app.getPath('userData'))
  mkdirSync(resolved.root, { recursive: true })
  mkdirSync(resolved.booksDir, { recursive: true })

  const existed = existsSync(resolved.dbFile)
  const connection = openDatabase(resolved.dbFile)

  if (existed && pendingVersions(connection).length > 0) {
    createBackup(connection, resolved.dbFile, resolved.backupsDir)
  }
  runMigrations(connection)
  if (shouldAutoBackup(resolved.backupsDir)) {
    createBackup(connection, resolved.dbFile, resolved.backupsDir)
  }

  db = connection
  paths = resolved
}

export function closeLibrary(): void {
  db?.close()
  db = null
  paths = null
}

function requireLibrary(): { db: DatabaseSync; paths: DataPaths } {
  if (!db || !paths) throw new Error('书库尚未初始化')
  return { db, paths }
}

export function libraryTree(): LibraryTree {
  const { db: connection, paths: resolved } = requireLibrary()
  return listTree(connection, resolved.root)
}

export function addFolder(name: string, parentId: string | null): LibraryTree {
  const { db: connection } = requireLibrary()
  createFolder(connection, name, parentId)
  return libraryTree()
}

export function renameLibraryNode(kind: LibraryNodeKind, id: string, name: string): LibraryTree {
  const { db: connection } = requireLibrary()
  renameNode(connection, kind, id, name)
  return libraryTree()
}

export function moveLibraryNode(kind: LibraryNodeKind, id: string, targetFolderId: string | null): LibraryTree {
  const { db: connection } = requireLibrary()
  moveNode(connection, kind, id, targetFolderId)
  return libraryTree()
}

export function removeFolder(id: string): LibraryTree {
  const { db: connection } = requireLibrary()
  deleteFolder(connection, id)
  return libraryTree()
}

export function removeBook(id: string): LibraryTree {
  const { db: connection } = requireLibrary()
  deleteBook(connection, id)
  return libraryTree()
}

export function undeleteBook(id: string): LibraryTree {
  const { db: connection } = requireLibrary()
  restoreBook(connection, id)
  return libraryTree()
}

/** 打开系统文件选择框导入 PDF/EPUB。取消时返回 null，不算失败。 */
export async function importBooks(folderId: string | null): Promise<ImportReport | null> {
  const { db: connection, paths: resolved } = requireLibrary()
  const options: OpenDialogOptions = {
    title: '导入书籍',
    buttonLabel: '导入',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '电子书', extensions: ['pdf', 'epub'] }],
  }

  const owner = requireWindow()
  const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
  if (picked.canceled || picked.filePaths.length === 0) return null

  let imported = 0
  let skipped = 0
  const failures: string[] = []
  for (const file of picked.filePaths) {
    try {
      const outcome = await importBookFromPath(connection, resolved, file, folderId)
      if (outcome.duplicate) skipped += 1
      else imported += 1
    } catch (error) {
      failures.push(`${file}：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`部分文件导入失败：${failures.join('；')}`)
  }
  return { imported, skipped, tree: libraryTree() }
}

function requireWindow() {
  return BrowserWindow.getAllWindows()[0] ?? null
}

export function importPrototype(graph: unknown): { books: number; notes: number; highlights: number; links: number; tree: LibraryTree } {
  const { db: connection } = requireLibrary()
  const typed = graph as KnowledgeGraphData
  if (!typed || !Array.isArray(typed.nodes) || !Array.isArray(typed.links)) {
    throw new Error('原型图谱格式不正确')
  }
  const result = importPrototypeGraph(connection, typed)
  return {
    books: result.books,
    notes: result.notes,
    highlights: result.highlights,
    links: result.links,
    tree: libraryTree(),
  }
}

export function libraryMeta(): {
  dataDir: string
  dbFile: string
  backups: number
  lastBackupAt: string | null
  prototypeImportedAt: string | null
} {
  const { db: connection, paths: resolved } = requireLibrary()
  const backups = listBackups(resolved.backupsDir)
  return {
    dataDir: resolved.root,
    dbFile: resolved.dbFile,
    backups: backups.length,
    lastBackupAt: backups[0]?.name ?? null,
    prototypeImportedAt: prototypeImportState(connection).importedAt,
  }
}
