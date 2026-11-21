import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection.ts'
import { migrations, runMigrations } from './migrate.ts'
import { DEFAULT_ZOOM, getReadingState, saveReadingState } from './reading.ts'
import { insertBook } from './library.ts'

let dir: string
let db: DatabaseSync

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shiyun-reading-'))
  db = openDatabase(join(dir, 'shiyun.db'))
  runMigrations(db, migrations)
  insertBook(db, {
    id: 'book-a',
    title: '测试书',
    format: 'pdf',
    folderId: null,
    filePath: 'books/book-a/source.pdf',
    fileSize: 1024,
    pageCount: null,
    fileHash: 'hash-a',
  })
  insertBook(db, {
    id: 'book-b',
    title: '另一本',
    format: 'epub',
    folderId: null,
    filePath: 'books/book-b/source.epub',
    fileSize: 2048,
    pageCount: null,
    fileHash: 'hash-b',
  })
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('reading_states', () => {
  it('没有记录时返回干净的默认态', () => {
    expect(getReadingState(db, 'book-a')).toEqual({
      bookId: 'book-a',
      page: null,
      cfi: null,
      zoom: DEFAULT_ZOOM,
      scrollRatio: null,
      updatedAt: null,
    })
  })

  it('写入页码与缩放后可读回', () => {
    const saved = saveReadingState(db, 'book-a', { page: 7, zoom: 1.4 })
    expect(saved.page).toBe(7)
    expect(saved.zoom).toBe(1.4)
    expect(saved.updatedAt).not.toBeNull()
    expect(getReadingState(db, 'book-a').page).toBe(7)
  })

  it('部分字段更新不覆盖已有字段（PDF 页码与 EPUB CFI 各自独立）', () => {
    saveReadingState(db, 'book-a', { page: 7, zoom: 1.4 })
    const next = saveReadingState(db, 'book-a', { zoom: 2 })
    expect(next.page).toBe(7)
    expect(next.zoom).toBe(2)
    expect(next.cfi).toBeNull()

    saveReadingState(db, 'book-b', { cfi: 'epubcfi(/6/4[chap01]!/4/2)' })
    const epub = saveReadingState(db, 'book-b', { scrollRatio: 0.5 })
    expect(epub.cfi).toBe('epubcfi(/6/4[chap01]!/4/2)')
    expect(epub.scrollRatio).toBe(0.5)
  })

  it('同一本书只保留一行记录', () => {
    saveReadingState(db, 'book-a', { page: 1 })
    saveReadingState(db, 'book-a', { page: 2 })
    const rows = db.prepare('SELECT COUNT(*) AS count FROM reading_states').all() as { count: number }[]
    expect(rows[0]?.count).toBe(1)
  })
})
