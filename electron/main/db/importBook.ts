import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { BookFormat, LibraryBook } from '../../../src/types/library.ts'
import type { DataPaths } from './paths.ts'
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

  const fileHash = await hashFile(sourceFile)
  const existing = findBookByHash(db, fileHash)
  if (existing) return { book: null, duplicate: existing }

  const book = insertBook(db, {
    title: titleFromFile(sourceFile),
    format,
    filePath: join('books', 'placeholder', `source.${format}`),
    fileHash,
    folderId,
  })

  const bookDir = join(paths.booksDir, book.id)
  await mkdir(bookDir, { recursive: true })
  const relativePath = join('books', book.id, `source.${format}`)
  await copyFile(sourceFile, join(paths.root, relativePath))

  const size = (await stat(sourceFile)).size
  db.prepare('UPDATE books SET file_path = ?, file_size = ?, updated_at = ? WHERE id = ?').run(
    relativePath,
    size,
    new Date().toISOString(),
    book.id,
  )

  return { book: { ...book, fileSize: size }, duplicate: null }
}
