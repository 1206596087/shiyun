import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  BookFormat,
  LibraryBook,
  LibraryCounts,
  LibraryFolder,
  LibraryNodeKind,
  LibraryTreeNode,
  LibraryTree,
} from '../../../src/types/library.ts'
import { execute, queryAll, queryOne, transaction } from './connection.ts'

export const MAX_FOLDER_DEPTH = 3

interface FolderRow {
  id: string
  parent_id: string | null
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

interface BookRow {
  id: string
  folder_id: string | null
  title: string
  author: string | null
  format: BookFormat
  page_count: number | null
  file_size: number | null
  last_opened_at: string | null
  created_at: string
  updated_at: string
}

const nowIso = () => new Date().toISOString()

function toBook(row: BookRow): LibraryBook {
  return {
    kind: 'book',
    id: row.id,
    title: row.title,
    author: row.author,
    format: row.format,
    folderId: row.folder_id,
    pageCount: row.page_count,
    fileSize: row.file_size,
    lastOpenedAt: row.last_opened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 递归取某个文件夹及其全部子文件夹的 id（含已软删除的，用于整体还原/删除）。 */
function collectSubtreeIds(db: DatabaseSync, folderId: string): string[] {
  const rows = queryAll<{ id: string }>(
    db,
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM folders WHERE id = ?
       UNION ALL
       SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
     ) SELECT id FROM sub`,
    folderId,
  )
  return rows.map((row) => row.id)
}

export function folderDepth(db: DatabaseSync, folderId: string | null): number {
  let depth = 0
  let cursor = folderId
  const seen = new Set<string>()
  while (cursor) {
    if (seen.has(cursor)) throw new Error('文件夹层级出现环，数据已损坏')
    seen.add(cursor)
    const row = queryOne<{ parent_id: string | null }>(db, 'SELECT parent_id FROM folders WHERE id = ?', cursor)
    if (!row) break
    cursor = row.parent_id
    depth += 1
  }
  return depth
}

export function listTree(db: DatabaseSync, dataDir: string): LibraryTree {
  const folderRows = queryAll<FolderRow>(
    db,
    'SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort_order, name COLLATE NOCASE',
  )
  const bookRows = queryAll<BookRow>(
    db,
    'SELECT * FROM books WHERE deleted_at IS NULL ORDER BY sort_order, title COLLATE NOCASE',
  )

  const folders = new Map<string, LibraryFolder>()
  for (const row of folderRows) {
    folders.set(row.id, { kind: 'folder', id: row.id, name: row.name, parentId: row.parent_id, children: [] })
  }

  const roots: LibraryFolder[] = []
  for (const folder of folders.values()) {
    const parent = folder.parentId ? folders.get(folder.parentId) : undefined
    if (parent) parent.children.push(folder)
    else roots.push(folder)
  }

  const uncategorized: LibraryBook[] = []
  for (const row of bookRows) {
    const book = toBook(row)
    const parent = book.folderId ? folders.get(book.folderId) : undefined
    if (parent) parent.children.push(book)
    else uncategorized.push(book)
  }

  const counts = countLibrary(db)
  return { folders: roots, uncategorized, counts, dataDir }
}

export function countLibrary(db: DatabaseSync): LibraryCounts {
  const row = queryOne<{ books: number; folders: number; highlights: number; notes: number; links: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM books WHERE deleted_at IS NULL) AS books,
       (SELECT COUNT(*) FROM folders WHERE deleted_at IS NULL) AS folders,
       (SELECT COUNT(*) FROM highlights h JOIN books b ON b.id = h.book_id WHERE b.deleted_at IS NULL) AS highlights,
       (SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL) AS notes,
       (SELECT COUNT(*) FROM knowledge_links) AS links`,
  )
  return {
    books: Number(row?.books ?? 0),
    folders: Number(row?.folders ?? 0),
    highlights: Number(row?.highlights ?? 0),
    notes: Number(row?.notes ?? 0),
    links: Number(row?.links ?? 0),
  }
}

export function createFolder(db: DatabaseSync, name: string, parentId: string | null): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('文件夹名不能为空')
  if (parentId) {
    const parent = queryOne<{ id: string; deleted_at: string | null }>(db, 'SELECT id, deleted_at FROM folders WHERE id = ?', parentId)
    if (!parent || parent.deleted_at) throw new Error('上级文件夹不存在')
    if (folderDepth(db, parentId) >= MAX_FOLDER_DEPTH) throw new Error(`文件夹最多 ${MAX_FOLDER_DEPTH} 层`)
  }
  const id = `folder-${randomUUID()}`
  const stamp = nowIso()
  execute(
    db,
    'INSERT INTO folders (id, parent_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    parentId,
    trimmed,
    0,
    stamp,
    stamp,
  )
  return id
}

export function renameNode(db: DatabaseSync, kind: LibraryNodeKind, id: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('名称不能为空')
  const stamp = nowIso()
  if (kind === 'folder') {
    const changed = db.prepare('UPDATE folders SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(trimmed, stamp, id)
    if (Number(changed.changes) === 0) throw new Error('文件夹不存在')
    return
  }
  const changed = db.prepare('UPDATE books SET title = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(trimmed, stamp, id)
  if (Number(changed.changes) === 0) throw new Error('书籍不存在')
}

export function moveNode(db: DatabaseSync, kind: LibraryNodeKind, id: string, targetFolderId: string | null): void {
  const stamp = nowIso()
  if (targetFolderId) {
    const target = queryOne<{ id: string; deleted_at: string | null }>(db, 'SELECT id, deleted_at FROM folders WHERE id = ?', targetFolderId)
    if (!target || target.deleted_at) throw new Error('目标文件夹不存在')
  }

  if (kind === 'book') {
    const changed = db
      .prepare('UPDATE books SET folder_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(targetFolderId, stamp, id)
    if (Number(changed.changes) === 0) throw new Error('书籍不存在')
    return
  }

  if (targetFolderId) {
    if (targetFolderId === id) throw new Error('不能把文件夹移动到自身')
    if (collectSubtreeIds(db, id).includes(targetFolderId)) throw new Error('不能把文件夹移动到自己的子文件夹')
    if (folderDepth(db, targetFolderId) + 1 > MAX_FOLDER_DEPTH) throw new Error(`文件夹最多 ${MAX_FOLDER_DEPTH} 层`)
  }
  const changed = db
    .prepare('UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(targetFolderId, stamp, id)
  if (Number(changed.changes) === 0) throw new Error('文件夹不存在')
}

/**
 * 删除文件夹：软删除整棵子树，树里的书落到「未分类」。
 * 书与笔记一律不删除（DATABASE_SCHEMA.md 第 4 节）。
 */
export function deleteFolder(db: DatabaseSync, folderId: string): void {
  transaction(db, () => {
    const stamp = nowIso()
    const ids = collectSubtreeIds(db, folderId)
    if (ids.length === 0) throw new Error('文件夹不存在')
    const placeholders = ids.map(() => '?').join(', ')
    execute(db, `UPDATE books SET folder_id = NULL, updated_at = ? WHERE folder_id IN (${placeholders})`, stamp, ...ids)
    execute(db, `UPDATE folders SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders})`, stamp, stamp, ...ids)
  })
}

/** 删除书籍：只是进回收站（软删除）。划线保留在库里，笔记绝不删除。 */
export function deleteBook(db: DatabaseSync, bookId: string): void {
  const stamp = nowIso()
  const changed = db.prepare('UPDATE books SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(stamp, stamp, bookId)
  if (Number(changed.changes) === 0) throw new Error('书籍不存在')
}

export function restoreBook(db: DatabaseSync, bookId: string): void {
  const stamp = nowIso()
  execute(db, 'UPDATE books SET deleted_at = NULL, updated_at = ? WHERE id = ?', stamp, bookId)
}

export function listTrash(db: DatabaseSync): LibraryBook[] {
  return queryAll<BookRow>(db, 'SELECT * FROM books WHERE deleted_at IS NOT NULL ORDER BY updated_at DESC').map(toBook)
}

export interface InsertBookInput {
  id?: string
  title: string
  author?: string | null
  format: BookFormat
  filePath: string
  fileHash?: string | null
  fileSize?: number | null
  pageCount?: number | null
  folderId?: string | null
}

export function findBookByHash(db: DatabaseSync, fileHash: string): LibraryBook | undefined {
  const row = queryOne<BookRow>(
    db,
    'SELECT * FROM books WHERE file_hash = ? AND deleted_at IS NULL LIMIT 1',
    fileHash,
  )
  return row ? toBook(row) : undefined
}

export function insertBook(db: DatabaseSync, input: InsertBookInput): LibraryBook {
  const id = input.id ?? `book-${randomUUID()}`
  const stamp = nowIso()
  execute(
    db,
    `INSERT INTO books
       (id, folder_id, title, author, format, file_path, file_hash, file_size, page_count,
        cover_path, sort_order, created_at, updated_at, last_opened_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, NULL, NULL)`,
    id,
    input.folderId ?? null,
    input.title,
    input.author ?? null,
    input.format,
    input.filePath,
    input.fileHash ?? null,
    input.fileSize ?? null,
    input.pageCount ?? null,
    stamp,
    stamp,
  )
  return {
    kind: 'book',
    id,
    title: input.title,
    author: input.author ?? null,
    format: input.format,
    folderId: input.folderId ?? null,
    pageCount: input.pageCount ?? null,
    fileSize: input.fileSize ?? null,
    lastOpenedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export function getSetting(db: DatabaseSync, key: string): string | undefined {
  const row = queryOne<{ value: string }>(db, 'SELECT value FROM app_settings WHERE key = ?', key)
  return row?.value
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  execute(
    db,
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    nowIso(),
  )
}

export function nodeExists(db: DatabaseSync, id: string): LibraryTreeNode | undefined {
  const folder = queryOne<FolderRow>(db, 'SELECT * FROM folders WHERE id = ? AND deleted_at IS NULL', id)
  if (folder) return { kind: 'folder', id: folder.id, name: folder.name, parentId: folder.parent_id, children: [] }
  const book = queryOne<BookRow>(db, 'SELECT * FROM books WHERE id = ? AND deleted_at IS NULL', id)
  return book ? toBook(book) : undefined
}
