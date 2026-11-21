import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './connection.ts'
import { runMigrations } from './migrate.ts'
import { insertBook } from './library.ts'
import {
  restoreNote,
  searchNotes,
  countAnnotations,
  createHighlight,
  createNote,
  deleteHighlight,
  deleteNote,
  getNote,
  highlightsForNote,
  linkHighlightNote,
  listHighlights,
  listNotes,
  notesForHighlight,
  unlinkHighlightNote,
  updateNote,
} from './annotations.ts'

let db: DatabaseSync
const BOOK_ID = 'book-annotation-test'

beforeEach(() => {
  db = openDatabase(':memory:')
  runMigrations(db)
  insertBook(db, {
    id: BOOK_ID,
    title: '回归模型讲义',
    format: 'pdf',
    filePath: 'books/book-annotation-test/source.pdf',
    pageCount: 3,
  })
})

afterEach(() => {
  db.close()
})

function makeHighlight(quote = '优势比（OR）和相对危险度（RR）', page = 1): string {
  return createHighlight(db, {
    bookId: BOOK_ID,
    locatorType: 'pdf_page',
    page,
    quote,
    prefix: '前面的话',
    suffix: '后面的话',
    rects: [{ left: 0.1, top: 0.2, width: 0.5, height: 0.03 }],
  }).id
}

describe('划线', () => {
  it('写入后能按书读回，定位信息与原文都在', () => {
    const id = makeHighlight()
    const highlights = listHighlights(db, BOOK_ID)
    expect(highlights).toHaveLength(1)
    const [highlight] = highlights
    expect(highlight.id).toBe(id)
    expect(highlight.page).toBe(1)
    expect(highlight.cfi).toBeNull()
    expect(highlight.quote).toBe('优势比（OR）和相对危险度（RR）')
    expect(highlight.prefix).toBe('前面的话')
    expect(highlight.rects).toEqual([{ left: 0.1, top: 0.2, width: 0.5, height: 0.03 }])
    expect(highlight.noteCount).toBe(0)
  })

  it('PDF 划线没有页码就拒绝，EPUB 划线没有 CFI 也拒绝', () => {
    expect(() =>
      createHighlight(db, { bookId: BOOK_ID, locatorType: 'pdf_page', quote: '没页码' }),
    ).toThrow(/页码/)

    expect(() =>
      createHighlight(db, { bookId: BOOK_ID, locatorType: 'epub_cfi', quote: '没 CFI' }),
    ).toThrow(/CFI/)
  })

  it('空白原文与不存在的书都拒绝写入', () => {
    expect(() =>
      createHighlight(db, { bookId: BOOK_ID, locatorType: 'pdf_page', page: 1, quote: '   ' }),
    ).toThrow(/为空/)

    expect(() =>
      createHighlight(db, { bookId: 'book-missing', locatorType: 'pdf_page', page: 1, quote: '有字' }),
    ).toThrow(/不存在/)
  })

  it('EPUB 划线存 CFI 而不是页码', () => {
    const highlight = createHighlight(db, {
      bookId: BOOK_ID,
      locatorType: 'epub_cfi',
      cfi: 'epubcfi(/6/4!/4/2/1:0)',
      quote: '第一章 生存曲线',
    })
    expect(highlight.page).toBeNull()
    expect(highlight.cfi).toBe('epubcfi(/6/4!/4/2/1:0)')
  })
})

describe('划线与笔记的多对多', () => {
  it('一条划线挂两篇笔记，两篇笔记都能反向看到这条划线', () => {
    const highlightId = makeHighlight()
    const first = createNote(db, { bodyText: '为什么在罕见结局下 OR 会近似 RR？', highlightId })
    const second = createNote(db, { bodyText: 'OR 与 RR 的差异来源', highlightId })

    const notes = notesForHighlight(db, highlightId)
    expect(notes.map((note) => note.id).sort()).toEqual([first.id, second.id].sort())

    for (const note of [first, second]) {
      const linked = highlightsForNote(db, note.id)
      expect(linked).toHaveLength(1)
      expect(linked[0].id).toBe(highlightId)
      expect(linked[0].noteCount).toBe(2)
    }
  })

  it('一篇笔记可以引用多条划线', () => {
    const first = makeHighlight('第一条', 1)
    const second = makeHighlight('第二条', 2)
    const note = createNote(db, { bodyText: '汇总两页的划线', highlightId: first })
    linkHighlightNote(db, second, note.id)

    const linked = highlightsForNote(db, note.id)
    expect(linked).toHaveLength(2)
    expect(getNote(db, note.id)?.highlightIds.sort()).toEqual([first, second].sort())
  })

  it('重复关联是幂等的，解除关联不删实体', () => {
    const highlightId = makeHighlight()
    const note = createNote(db, { bodyText: '一条笔记', highlightId })
    linkHighlightNote(db, highlightId, note.id)
    linkHighlightNote(db, highlightId, note.id)
    expect(notesForHighlight(db, highlightId)).toHaveLength(1)

    unlinkHighlightNote(db, highlightId, note.id)
    expect(notesForHighlight(db, highlightId)).toHaveLength(0)
    expect(getNote(db, note.id)).toBeDefined()
    expect(listHighlights(db, BOOK_ID)).toHaveLength(1)
  })
})

describe('删除语义', () => {
  it('删划线不删笔记，只断开关联', () => {
    const highlightId = makeHighlight()
    const note = createNote(db, { bodyText: '要留下的笔记', highlightId })

    deleteHighlight(db, highlightId)

    expect(listHighlights(db, BOOK_ID)).toHaveLength(0)
    const survivor = getNote(db, note.id)
    expect(survivor).toBeDefined()
    expect(survivor?.highlightIds).toEqual([])
    expect(survivor?.bodyText).toBe('要留下的笔记')
  })

  it('删笔记是软删：笔记从列表消失，划线仍在', () => {
    const highlightId = makeHighlight()
    const note = createNote(db, { bodyText: '会被删掉的笔记', highlightId })

    deleteNote(db, note.id)

    expect(getNote(db, note.id)).toBeUndefined()
    expect(listNotes(db).map((item) => item.id)).not.toContain(note.id)
    expect(notesForHighlight(db, highlightId)).toHaveLength(0)
    expect(listHighlights(db, BOOK_ID)).toHaveLength(1)
  })
})

describe('笔记正文', () => {
  it('更新正文时重算纯文本投影与标题', () => {
    const note = createNote(db, { bodyText: '初始内容' })
    const body = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'OR 与 RR' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '罕见结局时两者接近。' }] },
      ],
    })
    const updated = updateNote(db, note.id, { body })
    expect(updated.bodyText).toBe('OR 与 RR\n罕见结局时两者接近。')
    expect(updated.title).toBe('')
  })

  it('统计接口给出划线、笔记与关系数', () => {
    makeHighlight()
    createNote(db, { bodyText: '一条笔记' })
    expect(countAnnotations(db)).toEqual({ highlights: 1, notes: 1, links: 0 })
  })
})

describe('0.2.0 recovery and search', () => {
  it('restores updated text and three original links', () => {
    const ids = [makeHighlight(), makeHighlight(), makeHighlight()]
    const note = createNote(db, { bodyText: 'old', highlightId: ids[0] })
    for (const id of ids.slice(1)) linkHighlightNote(db, id, note.id)
    updateNote(db, note.id, { bodyText: 'new logistic regression' })
    deleteNote(db, note.id)
    expect(searchNotes(db, 'logistic')).toHaveLength(0)
    expect(listHighlights(db, BOOK_ID).every(h => h.noteCount === 0)).toBe(true)
    restoreNote(db, note.id)
    expect(getNote(db, note.id)?.highlightIds.sort()).toEqual(ids.sort())
    expect(getNote(db, note.id)?.bodyText).toBe('new logistic regression')
    expect(searchNotes(db, 'logistic')).toHaveLength(1)
  })
  it('updates the index and safely quotes query syntax', () => {
    const note = createNote(db, { bodyText: 'logistic' })
    expect(searchNotes(db, 'logistic')).toHaveLength(1)
    updateNote(db, note.id, { bodyText: 'replacement' })
    expect(searchNotes(db, 'logistic')).toHaveLength(0)
    expect(searchNotes(db, 'replacement')).toHaveLength(1)
    expect(searchNotes(db, '" OR *')).toHaveLength(0)
  })
})
