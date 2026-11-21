import type { DatabaseSync } from 'node:sqlite'
import type { ReadingState } from '../../../src/types/reader.ts'
import { execute, queryOne } from './connection.ts'

interface ReadingRow {
  book_id: string
  page: number | null
  cfi: string | null
  zoom: number
  scroll_ratio: number | null
  updated_at: string
}

const nowIso = () => new Date().toISOString()

export const DEFAULT_ZOOM = 1

export function getReadingState(db: DatabaseSync, bookId: string): ReadingState {
  const row = queryOne<ReadingRow>(db, 'SELECT * FROM reading_states WHERE book_id = ?', bookId)
  if (!row) {
    return { bookId, page: null, cfi: null, zoom: DEFAULT_ZOOM, scrollRatio: null, updatedAt: null }
  }
  return {
    bookId: row.book_id,
    page: row.page,
    cfi: row.cfi,
    zoom: row.zoom,
    scrollRatio: row.scroll_ratio,
    updatedAt: row.updated_at,
  }
}

export interface SaveReadingStateInput {
  page?: number | null
  cfi?: string | null
  zoom?: number
  scrollRatio?: number | null
}

/** 阅读进度：页码与 CFI 各自独立，缺什么就不覆盖什么（PDF 只有页码，EPUB 只有 CFI）。 */
export function saveReadingState(db: DatabaseSync, bookId: string, input: SaveReadingStateInput): ReadingState {
  const current = getReadingState(db, bookId)
  const page = input.page ?? current.page
  const cfi = input.cfi ?? current.cfi
  const zoom = input.zoom ?? current.zoom
  const scrollRatio = input.scrollRatio ?? current.scrollRatio
  execute(
    db,
    `INSERT INTO reading_states (book_id, page, cfi, zoom, scroll_ratio, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       page = excluded.page,
       cfi = excluded.cfi,
       zoom = excluded.zoom,
       scroll_ratio = excluded.scroll_ratio,
       updated_at = excluded.updated_at`,
    bookId,
    page,
    cfi,
    zoom,
    scrollRatio,
    nowIso(),
  )
  return getReadingState(db, bookId)
}
