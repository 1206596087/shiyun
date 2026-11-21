import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryBridge } from '../../data/libraryBridge'
import type { AnnotationBridge } from '../../data/annotationBridge'
import type { BookSource, SaveReadingStatePayload } from '../../types/reader'
import type { Highlight, Note, TextSelectionAnchor } from '../../types/annotation'
import { describeLocator, readableNoteTitle } from '../../types/annotation'
const EpubReader = lazy(() => import('./EpubReader').then((module) => ({ default: module.EpubReader })))
const PdfReader = lazy(() => import('./PdfReader').then((module) => ({ default: module.PdfReader })))
import { IconBook, IconHighlight, IconNote } from './icons'
import { researchSearchUrl, translationUrl } from '../../data/selectionActions'

export interface ReaderFocus {
  page?: number
  cfi?: string
  token: number
}

interface Props {
  bookId: string
  title: string
  bridge: LibraryBridge
  annotations: AnnotationBridge
  /** 外部（划线列表 / 笔记列表）要求定位到某一页或某个 CFI */
  focusRequest?: ReaderFocus | null
  /** 打开（或新建后打开）某篇笔记的标签页 */
  onOpenNote: (noteId: string) => void
  /** 划线或笔记数量变化后通知外层（左栏计数要准）。 */
  onAnnotationsChange?: () => void
}

/** 真实书籍的阅读页：取源文件 → 挂 PDF.js / EPUB.js → 划线、笔记、进度。 */
export function ReaderPane({ bookId, title, bridge, annotations, focusRequest, onOpenNote, onAnnotationsChange }: Props) {
  // 载入状态按 bookId 派生：换了书旧结果立即失效，effect 里不必同步重置。
  const [loaded, setLoaded] = useState<{ bookId: string; source: BookSource | null; error: string | null }>({
    bookId: '',
    source: null,
    error: null,
  })
  const source = loaded.bookId === bookId ? loaded.source : null
  const error = loaded.bookId === bookId ? loaded.error : null
  const loading = loaded.bookId !== bookId
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [highlights, setHighlights] = useState<{ bookId: string; items: Highlight[] }>({ bookId: '', items: [] })
  const bookHighlights = highlights.bookId === bookId ? highlights.items : []
  const [selection, setSelection] = useState<TextSelectionAnchor | null>(null)
  const [active, setActive] = useState<{ highlight: Highlight; notes: Note[] } | null>(null)
  const [focus, setFocus] = useState<{ page?: number; cfi?: string; token: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshHighlights = useCallback(async () => {
    const items = await annotations.listForBook(bookId)
    setHighlights({ bookId, items })
    onAnnotationsChange?.()
  }, [annotations, bookId, onAnnotationsChange])

  useEffect(() => {
    let cancelled = false
    bridge.bookSource(bookId).then(
      (next) => {
        if (cancelled) return
        setLoaded({ bookId, source: next, error: null })
      },
      (reason: unknown) => {
        if (cancelled) return
        setLoaded({ bookId, source: null, error: reason instanceof Error ? reason.message : '无法读取这本书' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [bookId, bridge])

  useEffect(() => {
    let cancelled = false
    annotations.listForBook(bookId).then(
      (items) => {
        if (!cancelled) setHighlights({ bookId, items })
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [annotations, bookId])

  // 卸载前把最后一次进度落盘，避免快速切标签丢进度
  const pendingRef = useRef<SaveReadingStatePayload | null>(null)
  const flush = useCallback(() => {
    if (!pendingRef.current) return
    const payload = pendingRef.current
    pendingRef.current = null
    void bridge.saveReadingState(bookId, payload)
  }, [bookId, bridge])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      flush()
    }
  }, [flush])

  const schedule = useCallback(
    (payload: SaveReadingStatePayload) => {
      pendingRef.current = { ...pendingRef.current, ...payload }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        flush()
      }, 700)
    },
    [flush],
  )

  const handlePdfProgress = useCallback(
    (page: number, zoom: number) => {
      schedule({ page, zoom })
    },
    [schedule],
  )

  const handlePageCount = useCallback(
    (total: number) => {
      void bridge.setPageCount(bookId, total)
    },
    [bookId, bridge],
  )

  const handleEpubProgress = useCallback(
    (cfi: string, zoom: number) => {
      schedule({ cfi, zoom })
    },
    [schedule],
  )

  const handleSelect = useCallback((next: TextSelectionAnchor) => {
    setActive(null)
    setSelection(next)
  }, [])

  const handleHighlightClick = useCallback(
    (highlight: Highlight) => {
      setSelection(null)
      annotations.notesForHighlight(highlight.id).then(
        (notes) => setActive({ highlight, notes }),
        () => setActive({ highlight, notes: [] }),
      )
    },
    [annotations],
  )

  /** 把当前选区变成一条划线；返回新划线，供「写笔记」继续挂上去。 */
  const commitSelection = useCallback(
    async (color?: string): Promise<Highlight | null> => {
      if (!selection) return null
      setBusy(true)
      try {
        const highlight = await annotations.createHighlight({
          bookId,
          locatorType: selection.cfi ? 'epub_cfi' : 'pdf_page',
          page: selection.page,
          cfi: selection.cfi,
          quote: selection.quote,
          prefix: selection.prefix,
          suffix: selection.suffix,
          rects: selection.rects,
          color,
        })
        setSelection(null)
        window.getSelection()?.removeAllRanges()
        await refreshHighlights()
        return highlight
      } finally {
        setBusy(false)
      }
    },
    [annotations, bookId, refreshHighlights, selection],
  )

  const openResearch = useCallback((url: string) => {
    window.dispatchEvent(new CustomEvent('shiyun-research-open', { detail: { url, newTab: true } }))
    setSelection(null)
  }, [])

  const saveColoredHighlight = useCallback((color: string) => {
    void commitSelection(color).catch((reason: unknown) => {
      setLoaded((current) => ({ ...current, error: reason instanceof Error ? reason.message : '保存划线失败' }))
    })
  }, [commitSelection])

  const handleNoteFromSelection = useCallback(() => {
    const quote = selection?.quote ?? ''
    void commitSelection()
      .then(async (highlight) => {
        if (!highlight) return
        const note = await annotations.createNote({ bodyText: '', highlightId: highlight.id })
        onOpenNote(note.id)
        void quote
      })
      .catch(() => undefined)
  }, [annotations, commitSelection, onOpenNote, selection])

  const handleNoteFromHighlight = useCallback(
    (highlight: Highlight) => {
      void annotations.createNote({ bodyText: '', highlightId: highlight.id }).then((note) => {
        setActive(null)
        onOpenNote(note.id)
      })
    },
    [annotations, onOpenNote],
  )

  const handleDeleteHighlight = useCallback(
    (highlight: Highlight) => {
      void annotations.deleteHighlight(highlight.id).then(() => {
        setActive(null)
        void refreshHighlights()
      })
    },
    [annotations, refreshHighlights],
  )

  const openHighlightSource = useCallback((highlight: Highlight) => {
    if (highlight.locatorType === 'pdf_page' && highlight.page) {
      setFocus({ page: highlight.page, token: Date.now() })
    } else if (highlight.cfi) {
      setFocus({ cfi: highlight.cfi, token: Date.now() })
    }
  }, [])

  // 外部定位请求与内部「定位到这里」用同一套 token 比较，取更晚的那个。
  // 纯派生，不在 effect 里 setState，避免多渲染一轮。
  const activeFocus: ReaderFocus | null = (() => {
    if (!focusRequest) return focus
    if (!focus) return focusRequest
    return focusRequest.token >= focus.token ? focusRequest : focus
  })()

  if (loading) {
    return <p className="book-reader__status book-reader__status--page">正在打开《{title}》…</p>
  }

  if (error) {
    return <ReaderNotice icon heading={title} body={error} />
  }

  if (!source) {
    return (
      <ReaderNotice
        icon
        heading={title}
        body="书库里找不到这本书，它可能已经被移到回收站。刷新左侧文件树后再试。"
      />
    )
  }

  if (!source.url) {
    return (
      <ReaderNotice
        icon
        heading={title}
        body="这本书没有可读的源文件。原型迁移进来的书只保留了书目记录，源文件需要自己重新导入；导入后就能在这里读正文。"
      />
    )
  }

  const reader =
    source.format === 'pdf' ? (
      <PdfReader
        url={source.url}
        initialPage={source.state.page}
        initialZoom={source.state.zoom}
        focus={activeFocus?.page ? { page: activeFocus.page, token: activeFocus.token } : null}
        highlights={bookHighlights}
        onProgress={handlePdfProgress}
        onPageCount={handlePageCount}
        onSelect={handleSelect}
        onHighlightClick={handleHighlightClick}
      />
    ) : (
      <EpubReader
        url={source.url}
        initialCfi={source.state.cfi}
        initialZoom={source.state.zoom}
        focus={activeFocus?.cfi ? { cfi: activeFocus.cfi, token: activeFocus.token } : null}
        highlights={bookHighlights}
        onProgress={handleEpubProgress}
        onSelect={handleSelect}
        onHighlightClick={handleHighlightClick}
      />
    )

  return (
    <>
      <Suspense fallback={<p className="book-reader__status">正在加载阅读器…</p>}>{reader}</Suspense>
      {selection && (
        <div
          className="selection-toolbar"
          style={{
            left: Math.max(190, Math.min(window.innerWidth - 190, selection.anchor.x)),
            top: Math.max(56, selection.anchor.y - 52),
          }}
          role="toolbar"
          aria-label="选中文字工具栏"
          onMouseDown={(event) => event.preventDefault()}
        >
          <span className="selection-toolbar__label"><IconHighlight size={13} />标记</span>
          <button className="selection-color is-gold" onClick={() => saveColoredHighlight('gold')} disabled={busy} title="金色标记" aria-label="金色标记" />
          <button className="selection-color is-rose" onClick={() => saveColoredHighlight('rose')} disabled={busy} title="玫瑰色标记" aria-label="玫瑰色标记" />
          <button className="selection-color is-sage" onClick={() => saveColoredHighlight('sage')} disabled={busy} title="鼠尾草色标记" aria-label="鼠尾草色标记" />
          <span className="selection-toolbar__divider" aria-hidden="true" />
          <button onClick={handleNoteFromSelection} disabled={busy} title="保存划线并新建一篇关联笔记">
            <IconNote size={14} />写笔记
          </button>
          <button onClick={() => void navigator.clipboard.writeText(selection.quote)} title="复制选中文字">复制</button>
          <button onClick={() => openResearch(translationUrl(selection.quote))} title="联网翻译所选文字">翻译</button>
          <button onClick={() => openResearch(researchSearchUrl(selection.quote))} title="在网页中搜索所选文字">搜索</button>
          <button className="selection-toolbar__close" onClick={() => setSelection(null)} aria-label="关闭选区工具栏">×</button>
        </div>
      )}
      {active && (
        <div className="highlight-popover" role="dialog" aria-label="划线详情">
          <p className="highlight-popover__quote">“{active.highlight.quote.slice(0, 80)}”</p>
          <p className="highlight-popover__meta">
            {describeLocator(active.highlight)} · {active.highlight.noteCount} 篇笔记
          </p>
          {active.notes.length > 0 ? (
            <ul className="highlight-popover__notes">
              {active.notes.map((note) => (
                <li key={note.id}>
                  <button onClick={() => { setActive(null); onOpenNote(note.id) }}>
                    <IconNote size={13} />{readableNoteTitle(note.title, note.bodyText)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="highlight-popover__empty">这条划线还没有笔记。</p>
          )}
          <div className="highlight-popover__actions">
            <button onClick={() => handleNoteFromHighlight(active.highlight)}>
              <IconNote size={13} />写笔记
            </button>
            <button onClick={() => openHighlightSource(active.highlight)}>
              <IconBook size={13} />定位到这里
            </button>
            <button className="is-danger" onClick={() => handleDeleteHighlight(active.highlight)}>
              删除划线
            </button>
            <button className="highlight-popover__close" onClick={() => setActive(null)} aria-label="关闭">
              ×
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export function ReaderNotice({ icon, heading, body }: { icon?: boolean; heading: string; body: string }) {
  return (
    <article className="reader-page">
      <p className="reader-page__chapter">{icon ? <IconBook size={15} /> : null}已从书库打开</p>
      <h2 className="reader-notice__title">{heading}</h2>
      <p className="reader-paragraph">{body}</p>
    </article>
  )
}
