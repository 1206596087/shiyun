import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_HIGHLIGHT_COLOR,
  normalizeQuote,
  parseRects,
  plainTextFromTiptap,
  type CreateHighlightInput,
  type CreateNoteInput,
  type Highlight,
  type HighlightRect,
  type Note,
  type UpdateNoteInput,
} from '../../../src/types/annotation.ts'
import { execute, queryAll, queryOne, transaction } from './connection.ts'

/**
 * 划线与笔记的持久化层。
 *
 * 硬约束（[DATABASE_SCHEMA.md] 第 4 节）：
 * - 删书是软删且不级联笔记/划线（books 上的外键只在真删时级联，业务层从不真删）。
 * - 删划线不删笔记；删笔记用 deleted_at 软删，同样不碰划线。
 * - 划线必须至少有一种可重建的定位：pdf 页码或 epub CFI。
 */

interface HighlightRow {
  id: string
  book_id: string
  locator_type: 'pdf_page' | 'epub_cfi'
  page: number | null
  cfi: string | null
  quote: string
  prefix: string | null
  suffix: string | null
  rect_json: string | null
  color: string
  created_at: string
  updated_at: string
  note_count?: number
}

interface NoteRow {
  id: string
  title: string
  body: string
  body_text: string
  created_at: string
  updated_at: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function toHighlight(row: HighlightRow): Highlight {
  const rects: HighlightRect[] | null = parseRects(row.rect_json ?? null)
  return {
    id: row.id,
    bookId: row.book_id,
    locatorType: row.locator_type,
    page: row.page,
    cfi: row.cfi,
    quote: row.quote,
    prefix: row.prefix,
    suffix: row.suffix,
    rects,
    color: row.color,
    noteCount: row.note_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function noteHighlightIds(db: DatabaseSync, noteId: string): string[] {
  const rows = queryAll<{ highlight_id: string }>(
    db,
    'SELECT highlight_id FROM highlight_notes WHERE note_id = ? ORDER BY created_at',
    noteId,
  )
  return rows.map((row) => row.highlight_id)
}

function toNote(db: DatabaseSync, row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    bodyText: row.body_text,
    highlightIds: noteHighlightIds(db, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createHighlight(db: DatabaseSync, input: CreateHighlightInput): Highlight {
  const quote = normalizeQuote(input.quote)
  if (!quote) throw new Error('划线内容为空')
  if (input.locatorType === 'pdf_page') {
    if (typeof input.page !== 'number' || !Number.isInteger(input.page) || input.page < 1) {
      throw new Error('PDF 划线必须带有效页码')
    }
  } else if (input.locatorType === 'epub_cfi') {
    if (!input.cfi || input.cfi.trim().length === 0) throw new Error('EPUB 划线必须带 CFI')
  } else {
    throw new Error('未知的划线定位方式')
  }
  const book = queryOne<{ id: string; deleted_at: string | null }>(
    db,
    'SELECT id, deleted_at FROM books WHERE id = ?',
    input.bookId,
  )
  if (!book || book.deleted_at) throw new Error('书籍不存在或已删除')

  const id = `hl-${randomUUID()}`
  const timestamp = nowIso()
  const rectJson = input.rects && input.rects.length > 0 ? JSON.stringify(input.rects) : null
  execute(
    db,
    `INSERT INTO highlights
      (id, book_id, locator_type, page, cfi, quote, prefix, suffix, rect_json, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.bookId,
    input.locatorType,
    input.locatorType === 'pdf_page' ? (input.page ?? null) : null,
    input.locatorType === 'epub_cfi' ? (input.cfi ?? null) : null,
    quote,
    input.prefix ?? null,
    input.suffix ?? null,
    rectJson,
    input.color ?? DEFAULT_HIGHLIGHT_COLOR,
    timestamp,
    timestamp,
  )
  const created = queryOne<HighlightRow>(
    db,
    `SELECT h.*, 0 AS note_count FROM highlights h WHERE h.id = ?`,
    id,
  )
  if (!created) throw new Error('划线写入失败')
  return toHighlight(created)
}

export function listHighlights(db: DatabaseSync, bookId: string): Highlight[] {
  const rows = queryAll<HighlightRow>(
    db,
    `SELECT h.*, (SELECT COUNT(*) FROM highlight_notes hn WHERE hn.highlight_id = h.id) AS note_count
       FROM highlights h
      WHERE h.book_id = ?
      ORDER BY h.locator_type, h.page, h.created_at`,
    bookId,
  )
  return rows.map(toHighlight)
}

/** 「我的划线」页面用：跨书收藏，按最近创建排序。 */
export function listAllHighlights(db: DatabaseSync, limit = 200): Highlight[] {
  const rows = queryAll<HighlightRow>(
    db,
    `SELECT h.*, (SELECT COUNT(*) FROM highlight_notes hn WHERE hn.highlight_id = h.id) AS note_count
       FROM highlights h
       JOIN books b ON b.id = h.book_id AND b.deleted_at IS NULL
      ORDER BY h.created_at DESC
      LIMIT ?`,
    limit,
  )
  return rows.map(toHighlight)
}

export function getHighlight(db: DatabaseSync, highlightId: string): Highlight | undefined {  const row = queryOne<HighlightRow>(
    db,
    `SELECT h.*, (SELECT COUNT(*) FROM highlight_notes hn WHERE hn.highlight_id = h.id) AS note_count
       FROM highlights h WHERE h.id = ?`,
    highlightId,
  )
  return row ? toHighlight(row) : undefined
}

/** 删划线不删笔记：只删这一行与它的关联行，笔记本体留在 notes 里 */
export function deleteHighlight(db: DatabaseSync, highlightId: string): void {
  transaction(db, () => {
    execute(db, 'DELETE FROM highlight_notes WHERE highlight_id = ?', highlightId)
    execute(db, 'DELETE FROM highlights WHERE id = ?', highlightId)
  })
}

export function createNote(db: DatabaseSync, input: CreateNoteInput = {}): Note {
  const id = `note-${randomUUID()}`
  const timestamp = nowIso()
  const body = input.body ?? ''
  const bodyText = input.bodyText ?? plainTextFromTiptap(body)
  // 标题只存用户显式写的；「没有标题就用正文首行」是展示层的事（readableNoteTitle），
  // 这样改正文时不会留下过期的旧标题。
  const title = (input.title ?? '').trim()
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO notes (id, title, body, body_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      title,
      body,
      bodyText,
      timestamp,
      timestamp,
    )
    if (input.highlightId) {
      if (!getHighlight(db, input.highlightId)) throw new Error('要关联的划线不存在')
      execute(
        db,
        'INSERT OR IGNORE INTO highlight_notes (highlight_id, note_id, created_at) VALUES (?, ?, ?)',
        input.highlightId,
        id,
        timestamp,
      )
    }
  })
  const row = queryOne<NoteRow>(db, 'SELECT * FROM notes WHERE id = ?', id)
  if (!row) throw new Error('笔记写入失败')
  return toNote(db, row)
}

export function updateNote(db: DatabaseSync, noteId: string, input: UpdateNoteInput): Note {
  const current = queryOne<NoteRow>(db, 'SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL', noteId)
  if (!current) throw new Error('笔记不存在或已删除')
  const body = input.body ?? current.body
  const bodyText = input.bodyText ?? (input.body === undefined ? current.body_text : plainTextFromTiptap(input.body))
  const title = input.title !== undefined ? input.title.trim() : current.title
  execute(
    db,
    'UPDATE notes SET title = ?, body = ?, body_text = ?, updated_at = ? WHERE id = ?',
    title,
    body,
    bodyText,
    nowIso(),
    noteId,
  )
  const row = queryOne<NoteRow>(db, 'SELECT * FROM notes WHERE id = ?', noteId)
  if (!row) throw new Error('笔记读取失败')
  return toNote(db, row)
}

/** 删笔记是软删，且不删划线：关系行删掉，实体保留（划线还在） */
export function deleteNote(db: DatabaseSync, noteId: string): void {
  transaction(db, () => {
    execute(db, 'DELETE FROM highlight_notes WHERE note_id = ?', noteId)
    execute(db, 'UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?', nowIso(), nowIso(), noteId)
  })
}

export function getNote(db: DatabaseSync, noteId: string): Note | undefined {
  const row = queryOne<NoteRow>(db, 'SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL', noteId)
  return row ? toNote(db, row) : undefined
}

export function listNotes(db: DatabaseSync, limit = 200): Note[] {
  const rows = queryAll<NoteRow>(
    db,
    `SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
    limit,
  )
  return rows.map((row) => toNote(db, row))
}

export function linkHighlightNote(db: DatabaseSync, highlightId: string, noteId: string): void {
  const highlight = getHighlight(db, highlightId)
  if (!highlight) throw new Error('划线不存在')
  const note = getNote(db, noteId)
  if (!note) throw new Error('笔记不存在')
  execute(
    db,
    'INSERT OR IGNORE INTO highlight_notes (highlight_id, note_id, created_at) VALUES (?, ?, ?)',
    highlightId,
    noteId,
    nowIso(),
  )
}

/** 解除关联不删任何实体：划线还在、笔记还在，只是不再互相引用 */
export function unlinkHighlightNote(db: DatabaseSync, highlightId: string, noteId: string): void {
  execute(db, 'DELETE FROM highlight_notes WHERE highlight_id = ? AND note_id = ?', highlightId, noteId)
}

export function notesForHighlight(db: DatabaseSync, highlightId: string): Note[] {
  const rows = queryAll<NoteRow>(
    db,
    `SELECT n.* FROM notes n
       JOIN highlight_notes hn ON hn.note_id = n.id
      WHERE hn.highlight_id = ? AND n.deleted_at IS NULL
      ORDER BY hn.created_at`,
    highlightId,
  )
  return rows.map((row) => toNote(db, row))
}

export function highlightsForNote(db: DatabaseSync, noteId: string): Highlight[] {
  const rows = queryAll<HighlightRow>(
    db,
    `SELECT h.*, (SELECT COUNT(*) FROM highlight_notes hn2 WHERE hn2.highlight_id = h.id) AS note_count
       FROM highlights h
       JOIN highlight_notes hn ON hn.highlight_id = h.id
      WHERE hn.note_id = ?
      ORDER BY h.created_at`,
    noteId,
  )
  return rows.map(toHighlight)
}

export function countAnnotations(db: DatabaseSync): { highlights: number; notes: number; links: number } {
  const highlights = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM highlights')
  const notes = queryOne<{ count: number }>(
    db,
    'SELECT COUNT(*) AS count FROM notes WHERE deleted_at IS NULL',
  )
  const links = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM knowledge_links')
  return {
    highlights: highlights?.count ?? 0,
    notes: notes?.count ?? 0,
    links: links?.count ?? 0,
  }
}
