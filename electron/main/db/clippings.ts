import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { execute, queryAll, queryOne } from './connection.ts'
import { createNote } from './annotations.ts'
import { normalizeQuote } from '../../../src/types/annotation.ts'
import {
  CLIPPING_NOTE_LIMIT,
  CLIPPING_QUOTE_LIMIT,
  normalizeClippingUrl,
  type CreateClippingInput,
  type UpdateClippingInput,
  type WebClipping,
} from '../../../src/types/clipping.ts'

/**
 * 网页摘录仓储。
 *
 * 删除语义与笔记一致：默认软删（进回收站），`restoreClipping` 能恢复；
 * 转成笔记只是把 `note_id` 指过去，删笔记不会删摘录（ON DELETE SET NULL），
 * 删摘录也不会删笔记——两边都是用户手动写下的东西。
 */

interface ClippingRow {
  id: string
  quote: string
  page_title: string
  url: string
  captured_at: string
  prefix: string | null
  suffix: string | null
  user_note: string
  note_id: string | null
  created_at: string
  updated_at: string
}

function toClipping(row: ClippingRow): WebClipping {
  return {
    id: row.id,
    quote: row.quote,
    pageTitle: row.page_title,
    url: row.url,
    capturedAt: row.captured_at,
    prefix: row.prefix,
    suffix: row.suffix,
    userNote: row.user_note,
    noteId: row.note_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function requireClipping(db: DatabaseSync, clippingId: string, includeDeleted = false): ClippingRow {
  const row = queryOne<ClippingRow>(
    db,
    `SELECT * FROM web_clippings WHERE id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`,
    clippingId,
  )
  if (!row) throw new Error('网页摘录不存在或已删除')
  return row
}

export function createClipping(db: DatabaseSync, input: CreateClippingInput): WebClipping {
  const quote = normalizeQuote(input.quote).slice(0, CLIPPING_QUOTE_LIMIT)
  if (!quote) throw new Error('摘录内容不能为空')
  const url = normalizeClippingUrl(input.url)
  const timestamp = nowIso()
  const id = `clip-${randomUUID()}`
  execute(
    db,
    `INSERT INTO web_clippings
       (id, quote, page_title, url, captured_at, prefix, suffix, user_note, note_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    id,
    quote,
    (input.pageTitle ?? '').trim().slice(0, 300),
    url,
    timestamp,
    input.prefix ?? null,
    input.suffix ?? null,
    (input.userNote ?? '').slice(0, CLIPPING_NOTE_LIMIT),
    timestamp,
    timestamp,
  )
  return toClipping(requireClipping(db, id))
}

export function listClippings(db: DatabaseSync, limit = 200): WebClipping[] {
  return queryAll<ClippingRow>(
    db,
    `SELECT * FROM web_clippings WHERE deleted_at IS NULL ORDER BY captured_at DESC LIMIT ?`,
    limit,
  ).map(toClipping)
}

export function getClipping(db: DatabaseSync, clippingId: string): WebClipping | undefined {
  const row = queryOne<ClippingRow>(db, 'SELECT * FROM web_clippings WHERE id = ? AND deleted_at IS NULL', clippingId)
  return row ? toClipping(row) : undefined
}

export function updateClipping(db: DatabaseSync, clippingId: string, input: UpdateClippingInput): WebClipping {
  const current = requireClipping(db, clippingId)
  const userNote = input.userNote !== undefined ? input.userNote.slice(0, CLIPPING_NOTE_LIMIT) : current.user_note
  execute(db, 'UPDATE web_clippings SET user_note = ?, updated_at = ? WHERE id = ?', userNote, nowIso(), clippingId)
  return toClipping(requireClipping(db, clippingId))
}

/** 软删（回收站）；摘录指向的笔记保持不动。 */
export function deleteClipping(db: DatabaseSync, clippingId: string): void {
  requireClipping(db, clippingId)
  execute(db, 'UPDATE web_clippings SET deleted_at = ?, updated_at = ? WHERE id = ?', nowIso(), nowIso(), clippingId)
}

export function restoreClipping(db: DatabaseSync, clippingId: string): void {
  const row = requireClipping(db, clippingId, true)
  if (!row.id) throw new Error('网页摘录不存在')
  execute(db, 'UPDATE web_clippings SET deleted_at = NULL, updated_at = ? WHERE id = ?', nowIso(), clippingId)
}

/**
 * 把摘录转成一篇笔记（或在已有关联笔记时直接返回它）。
 *
 * 笔记正文用「引文 + 来源 + 用户附注」拼出来，body 保持空字符串，
 * 这样后续在 TipTap 里编辑不会与 `body_text` 打架（`updateNote` 会重算 body_text）。
 */
export function clippingToNote(db: DatabaseSync, clippingId: string): { clipping: WebClipping; noteId: string; created: boolean } {
  const row = requireClipping(db, clippingId)
  if (row.note_id) {
    const existing = queryOne<{ id: string }>(db, 'SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL', row.note_id)
    if (existing) return { clipping: toClipping(row), noteId: row.note_id, created: false }
  }
  const lines = [`> ${row.quote.replace(/\n+/gu, '\n> ')}`, '', `来源：${row.page_title || row.url}`, row.url]
  if (row.user_note.trim()) lines.push('', row.user_note.trim())
  const timestamp = nowIso()
  // createNote 自己会开事务，这里不能再套一层（node:sqlite 不支持嵌套 BEGIN）。
  const note = createNote(db, { title: row.page_title.trim().slice(0, 80), bodyText: lines.join('\n') })
  const noteId = note.id
  execute(db, 'UPDATE web_clippings SET note_id = ?, updated_at = ? WHERE id = ?', noteId, timestamp, clippingId)
  return { clipping: toClipping(requireClipping(db, clippingId)), noteId, created: true }
}

/** 回收站与统计里用的计数。 */
export function countClippings(db: DatabaseSync): number {
  const row = queryOne<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM web_clippings WHERE deleted_at IS NULL')
  return Number(row?.total ?? 0)
}

/** 给回收站列表用：已软删的摘录。 */
export function listDeletedClippings(db: DatabaseSync, limit = 100): WebClipping[] {
  return queryAll<ClippingRow>(
    db,
    `SELECT * FROM web_clippings WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?`,
    limit,
  ).map(toClipping)
}
