import { app, BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { ImportReport, LibraryNodeKind, LibraryTree } from '../../src/types/library.ts'
import type { BookSource, ReadingState, SaveReadingStatePayload } from '../../src/types/reader.ts'
import { createBackup, listBackups, shouldAutoBackup } from './db/backup.ts'
import { openDatabase } from './db/connection.ts'
import { importBookFromPath } from './db/importBook.ts'
import {
  createFolder,
  deleteBook,
  deleteFolder,
  findBookSource,
  listTree,
  moveNode,
  renameNode,
  restoreBook,
  updateBookMeta,
} from './db/library.ts'
import { getReadingState, saveReadingState } from './db/reading.ts'
import { pendingVersions, runMigrations } from './db/migrate.ts'
import { resolveDataPaths, type DataPaths } from './db/paths.ts'
import { importPrototypeGraph, prototypeImportState } from './db/prototypeImport.ts'
import { loadKnowledgeGraph, releaseLayout, savePinnedLayout } from './db/graph.ts'
import type { KnowledgeGraphData } from '../../src/types/knowledge.ts'
import type { CreateGalaxyInput, GalaxyPositionInput, GalaxyUniverse, UpdateGalaxyInput } from '../../src/types/universe.ts'
import {
  createGalaxy,
  deleteGalaxy,
  loadGalaxyUniverse,
  saveGalaxyPosition,
  setGalaxyMembership,
  updateGalaxy,
} from './db/galaxies.ts'

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

export function requireLibrary(): { db: DatabaseSync; paths: DataPaths } {
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

/**
 * 阅读一本书所需的一切：自定义协议地址 + 上次读到的位置。
 *
 * 文件缺失（例如原型迁移进来的书本来就没有源文件）时照样返回 source，让渲染层能显示
 * 「这本书没有可读的源文件」，而不是抛一个用户看不懂的 IPC 错误。
 */
export function bookSource(bookId: string): BookSource | null {
  const { db: connection, paths: resolved } = requireLibrary()
  const row = findBookSource(connection, bookId)
  if (!row) return null
  const state = getReadingState(connection, bookId)
  const absolute = row.filePath ? join(resolved.root, row.filePath) : null
  const readable = absolute ? existsSync(absolute) : false
  updateBookMeta(connection, bookId, { lastOpenedAt: new Date().toISOString() })
  return {
    bookId: row.id,
    title: row.title,
    format: row.format,
    // URL 必须带文件名：EPUB.js 会用这个地址做相对解析基准，只给 `.../<id>` 会把 id 当文件名丢掉。
    url: readable ? `shiyun-book://book/${encodeURIComponent(row.id)}/source.${row.format}` : '',
    pageCount: row.pageCount,
    state,
  }
}

/** 自定义协议处理器用：把 bookId 解析成本机绝对路径，并做目录逃逸检查。 */
export function resolveBookFile(bookId: string): { filePath: string; format: 'pdf' | 'epub' } | null {
  const { db: connection, paths: resolved } = requireLibrary()
  const row = findBookSource(connection, bookId)
  if (!row || !row.filePath) return null
  const absolute = resolve(resolved.root, row.filePath)
  const booksRoot = resolve(resolved.booksDir)
  if (absolute !== booksRoot && !absolute.startsWith(`${booksRoot}${sep}`)) return null
  if (!existsSync(absolute)) return null
  return { filePath: absolute, format: row.format }
}

export function readState(bookId: string): ReadingState {
  const { db: connection } = requireLibrary()
  return getReadingState(connection, bookId)
}

export function writeReadingState(bookId: string, payload: SaveReadingStatePayload): ReadingState {
  const { db: connection } = requireLibrary()
  const saved = saveReadingState(connection, bookId, payload)
  if (typeof payload.page === 'number') {
    updateBookMeta(connection, bookId, { lastOpenedAt: new Date().toISOString() })
  }
  return saved
}

/** PDF 解析出总页数后回写，避免每次打开都重新解析。 */
export function recordPageCount(bookId: string, pageCount: number): ReadingState {
  const { db: connection } = requireLibrary()
  if (Number.isFinite(pageCount) && pageCount > 0) {
    updateBookMeta(connection, bookId, { pageCount: Math.round(pageCount) })
  }
  return getReadingState(connection, bookId)
}

/**
 * 银河图：把书库投影成星图。
 *
 * 第一次投影会把自动生成的坐标落库（pinned = 0），之后只补新节点，
 * 这样用户拖动固定过的星不会在重启后被冲掉。
 */
export function knowledgeGraph(): KnowledgeGraphData {
  const { db: connection } = requireLibrary()
  const { graph } = loadKnowledgeGraph(connection)
  return graph
}

/** 用户拖动一颗星后固定坐标（pinned = 1）。 */
export function pinGraphNode(nodeId: string, position: { x: number; y: number; z: number }): { nodeId: string; x: number; y: number; z: number } {
  const { db: connection } = requireLibrary()
  return savePinnedLayout(connection, nodeId, position)
}

/** 取消固定，回到自动布局。 */
export function unpinGraphNode(nodeId: string): void {
  const { db: connection } = requireLibrary()
  releaseLayout(connection, nodeId)
}

function currentUniverse(connection: DatabaseSync): GalaxyUniverse {
  const { graph } = loadKnowledgeGraph(connection)
  return loadGalaxyUniverse(connection, graph)
}

export function galaxyUniverse(): GalaxyUniverse {
  const { db: connection } = requireLibrary()
  return currentUniverse(connection)
}

export function addGalaxy(input: CreateGalaxyInput): GalaxyUniverse {
  const { db: connection } = requireLibrary()
  createGalaxy(connection, input)
  return currentUniverse(connection)
}

export function editGalaxy(galaxyId: string, patch: UpdateGalaxyInput): GalaxyUniverse {
  const { db: connection } = requireLibrary()
  updateGalaxy(connection, galaxyId, patch)
  return currentUniverse(connection)
}

export function moveGalaxy(galaxyId: string, position: GalaxyPositionInput): GalaxyUniverse {
  const { db: connection } = requireLibrary()
  saveGalaxyPosition(connection, galaxyId, position)
  return currentUniverse(connection)
}

export function changeGalaxyMembership(galaxyId: string, nodeId: string, included: boolean): GalaxyUniverse {
  const { db: connection } = requireLibrary()
  const graph = loadKnowledgeGraph(connection).graph
  if (!graph.nodes.some((node) => node.id === nodeId)) throw new Error('知识节点不存在')
  setGalaxyMembership(connection, galaxyId, nodeId, included)
  return loadGalaxyUniverse(connection, graph)
}

export function removeGalaxy(galaxyId: string): GalaxyUniverse {
  const { db: connection } = requireLibrary()
  deleteGalaxy(connection, galaxyId)
  return currentUniverse(connection)
}
