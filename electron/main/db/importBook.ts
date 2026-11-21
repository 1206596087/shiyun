import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { BookFormat, LibraryBook } from '../../../src/types/library.ts'
import type { DataPaths } from './paths.ts'
import { queryOne } from './connection.ts'
import { findBookByHash, insertBook } from './library.ts'

const EXTENSIONS: Record<string, BookFormat> = { '.pdf': 'pdf', '.epub': 'epub' }

export function detectFormat(file: string): BookFormat | null {
  return EXTENSIONS[extname(file).toLowerCase()] ?? null
}

export function titleFromFile(file: string): string {
  return basename(file, extname(file))
}

export function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function validateSource(file: string, format: BookFormat): Promise<void> {
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.alloc(1024)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const head = buffer.subarray(0, bytesRead)
    if (format === 'pdf' && !head.includes(Buffer.from('%PDF-'))) throw new Error('文件扩展名是 PDF，但内容不是有效的 PDF 文件')
    if (format === 'epub' && !(head[0] === 0x50 && head[1] === 0x4b)) throw new Error('文件扩展名是 EPUB，但内容不是有效的 EPUB 压缩包')
  } finally { await handle.close() }
}

export interface ImportOutcome {
  book: LibraryBook | null
  duplicate: LibraryBook | null
}

/**
 * 导入一本书：算哈希去重 → 复制到 books/<id>/source.<ext> → 写库。
 *
 * 复制而不是引用，避免用户移动源文件后书失效（DATABASE_SCHEMA.md 第 1 节）。
 * 页数与封面要真正解析文件，属于 M3 的任务，这里只写 NULL。
 */
export async function importBookFromPath(
  db: DatabaseSync,
  paths: DataPaths,
  sourceFile: string,
  folderId: string | null,
): Promise<ImportOutcome> {
  const format = detectFormat(sourceFile)
  if (!format) throw new Error('只支持导入 PDF 与 EPUB 文件')
  await validateSource(sourceFile, format)

  const fileHash = await hashFile(sourceFile)
  const existing = findBookByHash(db, fileHash)
  if (existing) return { book: null, duplicate: existing }

  // 工作区状态会跨系统、跨知识库保存在 localStorage。旧环境里选中的
  // 文件夹 ID 在当前数据库中可能不存在；有效书籍应安全落到“未分类”，
  // 而不是暴露一个 SQLite 外键错误并取消整次导入。
  const resolvedFolderId = folderId && queryOne<{ id: string }>(
    db,
    'SELECT id FROM folders WHERE id = ? AND deleted_at IS NULL',
    folderId,
  ) ? folderId : null

  const bookId = `book-${randomUUID()}`
  const bookDir = join(paths.booksDir, bookId)
  await mkdir(bookDir, { recursive: true })
  const relativePath = join('books', bookId, `source.${format}`)
  const finalPath = join(paths.root, relativePath)
  const temporaryPath = `${finalPath}.partial`
  try {
    await copyFile(sourceFile, temporaryPath)
    const [sourceStat, copiedStat] = await Promise.all([stat(sourceFile), stat(temporaryPath)])
    if (sourceStat.size !== copiedStat.size) throw new Error('复制后的文件大小不一致')
    const copiedHash = await hashFile(temporaryPath)
    if (copiedHash !== fileHash) throw new Error('复制后的文件校验失败')
    await rename(temporaryPath, finalPath)
    const book = insertBook(db, {
      id: bookId,
      title: titleFromFile(sourceFile),
      format,
      filePath: relativePath,
      fileHash,
      fileSize: copiedStat.size,
      folderId: resolvedFolderId,
    })
    return { book, duplicate: null }
  } catch (error) {
    await rm(bookDir, { recursive: true, force: true })
    throw error
  }
}
