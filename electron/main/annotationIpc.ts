import { ipcMain } from 'electron'
import type {
  CreateHighlightInput,
  CreateNoteInput,
  Highlight,
  LocatorType,
  Note,
  UpdateNoteInput,
} from '../../src/types/annotation.ts'
import { isLocatorType, parseRects } from '../../src/types/annotation.ts'
import {
  createHighlight,
  createNote,
  deleteHighlight,
  deleteNote,
  getNote,
  highlightsForNote,
  linkHighlightNote,
  listAllHighlights,
  listHighlights,
  listNotes,
  notesForHighlight,
  unlinkHighlightNote,
  updateNote,
} from './db/annotations.ts'
import { requireLibrary } from './libraryService.ts'

type TrustCheck = (url: string) => void

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new TypeError('参数必须是对象')
  return value as Record<string, unknown>
}

function asString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`参数 ${key} 必须是非空字符串`)
  return value
}

function asOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new TypeError(`参数 ${key} 必须是字符串`)
  return value
}

function asOptionalNumber(record: Record<string, unknown>, key: string): number | null | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`参数 ${key} 必须是数字`)
  return value
}

/** rects 允许三种形态：缺省、null、以及合法矩形数组；坏数据一律拒绝而不是悄悄丢掉。 */
function asRects(record: Record<string, unknown>): CreateHighlightInput['rects'] {
  const value = record.rects
  if (value === undefined) return undefined
  if (value === null) return null
  const parsed = parseRects(JSON.stringify(value))
  if (!parsed) throw new TypeError('参数 rects 必须是归一化矩形数组')
  return parsed
}

function locatorOf(record: Record<string, unknown>): LocatorType {
  const value = record.locatorType
  if (!isLocatorType(value)) throw new TypeError('参数 locatorType 必须是 pdf_page 或 epub_cfi')
  return value
}

function readHighlightInput(payload: unknown): CreateHighlightInput {
  const record = asRecord(payload)
  return {
    bookId: asString(record, 'bookId'),
    locatorType: locatorOf(record),
    page: asOptionalNumber(record, 'page') ?? null,
    cfi: asOptionalString(record, 'cfi') ?? null,
    quote: asString(record, 'quote'),
    prefix: asOptionalString(record, 'prefix') ?? null,
    suffix: asOptionalString(record, 'suffix') ?? null,
    rects: asRects(record) ?? null,
    color: asOptionalString(record, 'color'),
  }
}

function readNoteInput(payload: unknown): CreateNoteInput {
  const record = asRecord(payload)
  return {
    title: asOptionalString(record, 'title'),
    body: asOptionalString(record, 'body'),
    bodyText: asOptionalString(record, 'bodyText'),
    highlightId: asOptionalString(record, 'highlightId'),
  }
}

function readNotePatch(payload: unknown): UpdateNoteInput {
  const record = asRecord(payload)
  return {
    title: asOptionalString(record, 'title'),
    body: asOptionalString(record, 'body'),
    bodyText: asOptionalString(record, 'bodyText'),
  }
}

/**
 * 划线与笔记的 IPC 入口。返回值一律是「当前状态」而不是增量补丁，
 * 渲染进程拿回来直接整体替换，避免两边各算一半导致的漂移。
 */
export function registerAnnotationIpc(assertTrusted: TrustCheck) {
  ipcMain.handle('annotation:listForBook', (event, payload: unknown): Highlight[] => {
    assertTrusted(event.senderFrame?.url ?? '')
    const { db } = requireLibrary()
    return listHighlights(db, asString(asRecord(payload), 'bookId'))
  })

  ipcMain.handle('annotation:listAllHighlights', (event): Highlight[] => {
    assertTrusted(event.senderFrame?.url ?? '')
    const { db } = requireLibrary()
    return listAllHighlights(db)
  })

  ipcMain.handle('annotation:getNote', (event, payload: unknown): Note | null => {
    assertTrusted(event.senderFrame?.url ?? '')
    const { db } = requireLibrary()
    return getNote(db, asString(asRecord(payload), 'noteId')) ?? null
  })

  ipcMain.handle('annotation:createHighlight', (event, payload: unknown): Highlight => {
    assertTrusted(event.senderFrame?.url ?? '')
    const { db } = requireLibrary()
    return createHighlight(db, readHighlightInput(payload))
  })

  ipcMain.handle('annotation:deleteHighlight', (event, payload: unknown): void => {
    assertTrusted(event.senderFrame?.url ?? '')
    const { db } = requireLibrary()
    deleteHighlight(db, asString(asRecord(payload), 'highlightId'))
  })

  ipcMain.handle('annotation:notesForHighlight', (event, payload: unknown): Note[] => {
    assertTrusted(event.senderFrame?.url ?? '')
    const { db } = requireLibrary()
    return notesForHighlight(db, asString(asRecord(payload), 'highlightId'))
  })

  ipcMain.handle('annotation:highlightsForNote', (event, payload: unknown): Highlight[] => {
    assertTrusted(event.senderFrame?.url ?? '')
    const { db } = requireLibrary()
    return highlightsForNote(db, asString(asRecord(payload), 'noteId'))
  })

  ipcMain.handle('annotation:listNotes', (event): Note[] => {
    assertTrusted(event.senderFrame?.url ?? '')
    const { db } = requireLibrary()
    return listNotes(db)
  })

  ipcMain.handle('annotation:createNote', (event, payload: unknown): Note => {
    assertTrusted(event.senderFrame?.url ?? '')
    const { db } = requireLibrary()
    return createNote(db, readNoteInput(payload))
  })

  ipcMain.handle('annotation:updateNote', (event, payload: unknown): Note => {
    assertTrusted(event.senderFrame?.url ?? '')
    const record = asRecord(payload)
    const { db } = requireLibrary()
    return updateNote(db, asString(record, 'noteId'), readNotePatch(record.patch))
  })

  ipcMain.handle('annotation:deleteNote', (event, payload: unknown): void => {
    assertTrusted(event.senderFrame?.url ?? '')
    const { db } = requireLibrary()
    deleteNote(db, asString(asRecord(payload), 'noteId'))
  })

  ipcMain.handle('annotation:link', (event, payload: unknown): void => {
    assertTrusted(event.senderFrame?.url ?? '')
    const record = asRecord(payload)
    const { db } = requireLibrary()
    linkHighlightNote(db, asString(record, 'highlightId'), asString(record, 'noteId'))
  })

  ipcMain.handle('annotation:unlink', (event, payload: unknown): void => {
    assertTrusted(event.senderFrame?.url ?? '')
    const record = asRecord(payload)
    const { db } = requireLibrary()
    unlinkHighlightNote(db, asString(record, 'highlightId'), asString(record, 'noteId'))
  })
}
