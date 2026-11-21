import type {
  CreateHighlightInput,
  CreateNoteInput,
  Highlight,
  Note,
  UpdateNoteInput,
} from '../types/annotation'
import { DEFAULT_HIGHLIGHT_COLOR, normalizeQuote, plainTextFromTiptap } from '../types/annotation'

export type AnnotationMode = 'desktop' | 'demo'

/**
 * 划线/笔记的统一出入口。桌面版走 IPC（数据库是权威副本），
 * 浏览器演示版在内存里实现同样的语义，方便没有 Electron 时调界面。
 */
export interface AnnotationBridge {
  readonly mode: AnnotationMode
  listForBook: (bookId: string) => Promise<Highlight[]>
  listAllHighlights: () => Promise<Highlight[]>
  createHighlight: (input: CreateHighlightInput) => Promise<Highlight>
  deleteHighlight: (highlightId: string) => Promise<void>
  notesForHighlight: (highlightId: string) => Promise<Note[]>
  highlightsForNote: (noteId: string) => Promise<Highlight[]>
  listNotes: () => Promise<Note[]>
  getNote: (noteId: string) => Promise<Note | null>
  createNote: (input: CreateNoteInput) => Promise<Note>
  updateNote: (noteId: string, patch: UpdateNoteInput) => Promise<Note>
  deleteNote: (noteId: string) => Promise<void>
  link: (highlightId: string, noteId: string) => Promise<void>
  unlink: (highlightId: string, noteId: string) => Promise<void>
}

const DEMO_BOOK_ID = 'book-biostatistics'
const DEMO_NOTE_ID = 'note-demo-rr'

function now(): string {
  return new Date().toISOString()
}

/**
 * 演示数据：和书房的演示书《生物统计学.pdf》对得上，内容与研究资料栏一致。
 * 明确标注为演示，避免看起来像用户真实数据。
 */
function seedHighlights(): Highlight[] {
  const stamp = now()
  return [
    {
      id: 'hl-demo-or-rr',
      bookId: DEMO_BOOK_ID,
      locatorType: 'pdf_page',
      page: 1,
      cfi: null,
      quote: '优势比（OR）和相对危险度（RR）在某些情况下数值接近，但两者并不等同。',
      prefix: null,
      suffix: null,
      rects: null,
      color: 'gold',
      noteCount: 1,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ]
}

function seedNotes(): Note[] {
  const stamp = now()
  return [
    {
      id: DEMO_NOTE_ID,
      title: '',
      body: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '为什么在罕见结局下，OR 会近似 RR？因为当发病率很低时，分母里「无病」的人数远大于「有病」的人数。',
              },
            ],
          },
        ],
      }),
      bodyText:
        '为什么在罕见结局下，OR 会近似 RR？因为当发病率很低时，分母里「无病」的人数远大于「有病」的人数。',
      highlightIds: ['hl-demo-or-rr'],
      createdAt: stamp,
      updatedAt: stamp,
    },
  ]
}

function createDemoBridge(): AnnotationBridge {
  let highlights = seedHighlights()
  let notes = seedNotes()
  const unlinked = new Set<string>()

  const refreshCounts = (): void => {
    highlights = highlights.map((highlight) => ({
      ...highlight,
      noteCount: notes.filter(
        (note) => note.highlightIds.includes(highlight.id) && !unlinked.has(`${highlight.id}:${note.id}`),
      ).length,
    }))
  }

  const findNote = (noteId: string): Note => {
    const note = notes.find((item) => item.id === noteId)
    if (!note) throw new Error('笔记不存在（演示模式）')
    return note
  }

  refreshCounts()

  return {
    mode: 'demo',
    listForBook: async (bookId) => highlights.filter((highlight) => highlight.bookId === bookId),
    listAllHighlights: async () => [...highlights].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    createHighlight: async (input) => {
      const quote = normalizeQuote(input.quote)
      if (!quote) throw new Error('划线原文不能为空')
      if (input.locatorType === 'pdf_page' && !Number.isInteger(input.page)) {
        throw new Error('PDF 划线必须带页码')
      }
      if (input.locatorType === 'epub_cfi' && !input.cfi) throw new Error('EPUB 划线必须带 CFI')
      const stamp = now()
      const highlight: Highlight = {
        id: `hl-demo-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        bookId: input.bookId,
        locatorType: input.locatorType,
        page: input.locatorType === 'pdf_page' ? (input.page ?? null) : null,
        cfi: input.locatorType === 'epub_cfi' ? (input.cfi ?? null) : null,
        quote,
        prefix: input.prefix ?? null,
        suffix: input.suffix ?? null,
        rects: input.rects ?? null,
        color: input.color ?? DEFAULT_HIGHLIGHT_COLOR,
        noteCount: 0,
        createdAt: stamp,
        updatedAt: stamp,
      }
      highlights = [...highlights, highlight]
      return highlight
    },
    deleteHighlight: async (highlightId) => {
      highlights = highlights.filter((highlight) => highlight.id !== highlightId)
      // 演示模式也遵守「删划线不删笔记」：只断开关联
      notes = notes.map((note) => ({
        ...note,
        highlightIds: note.highlightIds.filter((id) => id !== highlightId),
      }))
    },
    notesForHighlight: async (highlightId) =>
      notes.filter((note) => note.highlightIds.includes(highlightId) && !unlinked.has(`${highlightId}:${note.id}`)),
    highlightsForNote: async (noteId) => {
      const note = findNote(noteId)
      return highlights.filter(
        (highlight) => note.highlightIds.includes(highlight.id) && !unlinked.has(`${highlight.id}:${noteId}`),
      )
    },
    listNotes: async () => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    getNote: async (noteId) => notes.find((note) => note.id === noteId) ?? null,
    createNote: async (input) => {
      const stamp = now()
      const note: Note = {
        id: `note-demo-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        title: (input.title ?? '').trim(),
        body: input.body ?? '',
        bodyText: input.bodyText ?? plainTextFromTiptap(input.body ?? ''),
        highlightIds: input.highlightId ? [input.highlightId] : [],
        createdAt: stamp,
        updatedAt: stamp,
      }
      notes = [note, ...notes]
      refreshCounts()
      return note
    },
    updateNote: async (noteId, patch) => {
      const note = findNote(noteId)
      const body = patch.body ?? note.body
      const updated: Note = {
        ...note,
        title: patch.title === undefined ? note.title : patch.title.trim(),
        body,
        bodyText: patch.body === undefined ? (patch.bodyText ?? note.bodyText) : plainTextFromTiptap(body),
        updatedAt: now(),
      }
      notes = notes.map((item) => (item.id === noteId ? updated : item))
      return updated
    },
    deleteNote: async (noteId) => {
      notes = notes.filter((note) => note.id !== noteId)
      refreshCounts()
    },
    link: async (highlightId, noteId) => {
      const note = findNote(noteId)
      if (!note.highlightIds.includes(highlightId)) {
        notes = notes.map((item) =>
          item.id === noteId ? { ...item, highlightIds: [...item.highlightIds, highlightId], updatedAt: now() } : item,
        )
      }
      unlinked.delete(`${highlightId}:${noteId}`)
      refreshCounts()
    },
    unlink: async (highlightId, noteId) => {
      unlinked.add(`${highlightId}:${noteId}`)
      refreshCounts()
    },
  }
}

/** 桌面版：全部走 preload 暴露的 IPC，渲染进程看不到 SQL。 */
function createDesktopBridge(api: NonNullable<Window['shiyunDesktop']>['annotations']): AnnotationBridge {
  return {
    mode: 'desktop',
    listForBook: (bookId) => api.listForBook(bookId),
    listAllHighlights: () => api.listAllHighlights(),
    createHighlight: (input) => api.createHighlight(input),
    deleteHighlight: (id) => api.deleteHighlight(id),
    notesForHighlight: (id) => api.notesForHighlight(id),
    highlightsForNote: (id) => api.highlightsForNote(id),
    listNotes: () => api.listNotes(),
    getNote: (id) => api.getNote(id),
    createNote: (input) => api.createNote(input),
    updateNote: (noteId, patch) => api.updateNote(noteId, patch),
    deleteNote: (id) => api.deleteNote(id),
    link: (highlightId, noteId) => api.link(highlightId, noteId),
    unlink: (highlightId, noteId) => api.unlink(highlightId, noteId),
  }
}

export function getAnnotationBridge(): AnnotationBridge {
  const desktop = window.shiyunDesktop
  if (desktop?.annotations) return createDesktopBridge(desktop.annotations)
  return createDemoBridge()
}
