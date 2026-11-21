import { useCallback, useEffect, useRef, useState } from 'react'
import ePub, { EpubCFI, type Book, type Rendition } from 'epubjs'
import type { NavItem } from 'epubjs/types/navigation'
import type { Highlight, TextSelectionAnchor } from '../../types/annotation'
import { buildContext, normalizeQuote } from '../../types/annotation'
import { IconBook, IconList } from './icons'

interface Props {
  url: string
  initialCfi: string | null
  initialZoom: number
  /** 来自外部（划线列表「打开原文」）的跳转请求；token 变化即触发一次。 */
  focus: { cfi: string; token: number } | null
  highlights: Highlight[]
  onProgress: (cfi: string, zoom: number, label: string) => void
  onSelect: (selection: TextSelectionAnchor) => void
  onHighlightClick: (highlight: Highlight) => void
}

interface TocEntry {
  label: string
  href: string
  depth: number
}

/** 稳定的空目录引用：避免每次渲染都产生新数组，把 ref 同步 effect 变成无限循环。 */
const EMPTY_TOC: TocEntry[] = []
const MAX_QUOTE = 2000

/** 划线在舞台坐标系里的位置（EPUB 的 CFI range 换算而来）。 */
interface MarkBox {
  id: string
  highlight: Highlight
  left: number
  top: number
  width: number
  height: number
}

const EMPTY_MARKS: MarkBox[] = []

function flattenToc(items: NavItem[], depth = 0, out: TocEntry[] = []): TocEntry[] {
  for (const item of items) {
    out.push({ label: item.label.trim(), href: item.href, depth })
    if (item.subitems?.length) flattenToc(item.subitems, depth + 1, out)
  }
  return out
}

export function EpubReader(props: Props) {
  const { url, initialCfi, initialZoom, focus, highlights, onProgress } = props
  const hostRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const [readyUrl, setReadyUrl] = useState('')
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null)
  const [tocState, setTocState] = useState<{ url: string; items: TocEntry[] }>({ url: '', items: [] })
  const [tocOpen, setTocOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [fontScale, setFontScale] = useState(() => Math.round(initialZoom * 100))
  // 划线叠加层：与 PDF 用同一套 .book-reader__mark，避免 epub.js 自带标注层在不同版本里失效
  const [markState, setMarkState] = useState<{ url: string; items: MarkBox[] }>({ url: '', items: EMPTY_MARKS })
  const paintRef = useRef<() => void>(() => {})

  // 载入状态按 url 派生：换书后旧状态自动失效，effect 里不需要同步重置。
  const toc = tocState.url === url ? tocState.items : EMPTY_TOC
  const marks = markState.url === url ? markState.items : EMPTY_MARKS
  const error = failure && failure.url === url ? failure.message : null
  const busy = !error && readyUrl !== url

  const onProgressRef = useRef(onProgress)
  const onSelectRef = useRef(props.onSelect)
  const onHighlightClickRef = useRef(props.onHighlightClick)
  const tocRef = useRef<TocEntry[]>(toc)
  const fontScaleRef = useRef(fontScale)
  useEffect(() => {    onProgressRef.current = onProgress
  }, [onProgress])
  useEffect(() => {
    onSelectRef.current = props.onSelect
    onHighlightClickRef.current = props.onHighlightClick
  }, [props.onSelect, props.onHighlightClick])
  useEffect(() => {
    tocRef.current = toc
  }, [toc])
  useEffect(() => {
    fontScaleRef.current = fontScale
  }, [fontScale])

  // 窗口尺寸变化后 EPUB 会重排，划线位置要跟着重算
  useEffect(() => {
    const onResize = () => paintRef.current()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false

    const book = ePub(url)
    bookRef.current = book
    const rendition = book.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'auto',
      allowScriptedContent: false,
    })
    renditionRef.current = rendition
    rendition.themes.fontSize(`${fontScaleRef.current}%`)

    const display = initialCfi ? rendition.display(initialCfi) : rendition.display()
    void display
      .then(() => {
        if (!disposed) setReadyUrl(url)
      })
      .catch((reason: unknown) => {
        if (disposed) return
        setFailure({ url, message: reason instanceof Error ? reason.message : '无法打开这份 EPUB' })
      })

    book.loaded.navigation
      .then((navigation) => {
        if (disposed) return
        setTocState({ url, items: flattenToc(navigation.toc as NavItem[]) })
      })
      .catch(() => undefined)

    // EPUB 的选区必须由 rendition 给 CFI —— 那是这本书稳定不变的定位，换字号/换窗口都不失效。
    rendition.on('selected', (cfiRange: string, contents: { window: Window }) => {
      if (disposed) return
      // getRange 返回的是 Promise，必须 await，否则拿到的原文是 "[object Promise]"
      void Promise.resolve(book.getRange(cfiRange))
        .then((range: Range | null) => {
          if (disposed) return
          const quote = normalizeQuote(range ? range.toString() : '')
          if (!quote || quote.length < 2) return
          const chapterText = (contents.window.document.body?.innerText ?? '').slice(0, 20000)
          const context = buildContext(chapterText, quote)
          const iframe = host.querySelector('iframe')
          const frameRect = iframe?.getBoundingClientRect()
          const selection = contents.window.getSelection()
          const selRect = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null
          onSelectRef.current({
            quote: quote.slice(0, MAX_QUOTE),
            prefix: context.prefix,
            suffix: context.suffix,
            rects: null,
            page: null,
            cfi: cfiRange,
            anchor: {
              x: (frameRect?.left ?? 0) + (selRect ? selRect.left + selRect.width / 2 : 0),
              y: (frameRect?.top ?? 0) + (selRect ? selRect.top : 0),
            },
          })
        })
        .catch((reason: unknown) => console.error('[EpubReader] selection failed', reason))
    })

    rendition.on('relocated', (location: { start?: { cfi?: string; href?: string } }) => {
      if (disposed) return
      const cfi = location.start?.cfi ?? ''
      const href = location.start?.href ?? ''
      const match = tocRef.current.find((entry) => href.endsWith(entry.href.split('#')[0].split('/').pop() ?? ''))
      const current = match?.label ?? ''
      setLabel(current)
      if (cfi) onProgressRef.current(cfi, fontScaleRef.current / 100, current)
    })

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') void rendition.next()
      if (event.key === 'ArrowLeft') void rendition.prev()
    }
    window.addEventListener('keydown', onKey)

    // 每次换页/换章节都要重算划线位置（CFI 只在当前渲染的章节里才有矩形）
    rendition.on('rendered', () => {
      if (disposed) return
      window.setTimeout(() => {
        if (!disposed) paintRef.current()
      }, 60)
    })

    return () => {
      disposed = true
      window.removeEventListener('keydown', onKey)
      rendition.destroy()
      book.destroy()
      bookRef.current = null
      renditionRef.current = null
    }
  }, [url, initialCfi])

  // 已有划线：把 CFI 换算成舞台坐标画出来（与 PDF 共用 .book-reader__mark 样式与交互）
  useEffect(() => {
    if (readyUrl !== url) return
    const paint = () => {
      const host = hostRef.current
      const stage = stageRef.current
      if (!host || !stage) return
      const frame = host.querySelector('iframe')
      const doc = frame?.contentDocument
      if (!frame || !doc) return
      const frameRect = frame.getBoundingClientRect()
      const stageRect = stage.getBoundingClientRect()
      const offsetLeft = frameRect.left - stageRect.left
      const offsetTop = frameRect.top - stageRect.top
      const boxes: MarkBox[] = []
      for (const highlight of highlights) {
        if (highlight.locatorType !== 'epub_cfi' || !highlight.cfi) continue
        try {
          // 关键：用「当前 iframe 的 document」解析 CFI。book.getRange() 拿到的是旧 document，
          // 上面 measure 出来的矩形永远是空的，这也是 epub.js 自带标注层在本项目失效的原因。
          const range = new EpubCFI(highlight.cfi).toRange(doc)
          const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 1 && rect.height > 1)
          if (rects.length === 0) continue
          const first = rects[0]
          boxes.push({
            id: highlight.id,
            highlight,
            left: offsetLeft + first.left,
            top: offsetTop + first.top,
            width: first.width,
            height: first.height,
          })
        } catch {
          // 这条划线在别的章节，等翻到那一页时 rendered 会重算
        }
      }
      setMarkState({ url, items: boxes })
    }
    paintRef.current = paint
    paint()
  }, [highlights, readyUrl, url])

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontScale}%`)
  }, [fontScale])

  // 外部跳转（在「我的划线」里点「打开原文」）
  useEffect(() => {
    if (!focus) return
    void renditionRef.current?.display(focus.cfi)
  }, [focus])

  const step = useCallback((delta: number) => {
    const rendition = renditionRef.current
    if (!rendition) return
    if (delta > 0) void rendition.next()
    else void rendition.prev()
  }, [])

  return (
    <div className="book-reader">
      <div className="book-reader__bar">
        <button
          className={`ws-chip ${tocOpen ? 'is-on' : ''}`}
          onClick={() => setTocOpen((open) => !open)}
          disabled={toc.length === 0}
          title={toc.length === 0 ? '这本书没有目录' : '显示目录'}
          aria-pressed={tocOpen}
        >
          <IconList size={14} />目录
        </button>
        <div className="book-reader__pages">
          <button onClick={() => step(-1)} title="上一页">‹</button>
          <span className="book-reader__label">{label || '正在定位…'}</span>
          <button onClick={() => step(1)} title="下一页">›</button>
        </div>
        <div className="book-reader__zoom">
          <button onClick={() => setFontScale((value) => Math.max(70, value - 10))} disabled={fontScale <= 70} title="缩小字号">−</button>
          <button className="book-reader__zoom-value" onClick={() => setFontScale(100)} title="重置字号">
            {fontScale}%
          </button>
          <button onClick={() => setFontScale((value) => Math.min(220, value + 10))} disabled={fontScale >= 220} title="放大字号">＋</button>
        </div>
      </div>

      <div className="book-reader__main">
        {tocOpen && toc.length > 0 && (
          <nav className="book-reader__toc" aria-label="目录">
            <p className="book-reader__toc-title"><IconBook size={13} />目录</p>
            {toc.map((entry, index) => (
              <button
                key={`${entry.href}-${index}`}
                className="book-reader__toc-item"
                style={{ paddingLeft: `${10 + entry.depth * 12}px` }}
                onClick={() => {
                  void renditionRef.current?.display(entry.href)
                  setTocOpen(false)
                }}
              >
                {entry.label}
              </button>
            ))}
          </nav>
        )}
        <div className="book-reader__stage book-reader__stage--epub" ref={stageRef}>
          {error ? <p className="book-reader__error">{error}</p> : busy ? <p className="book-reader__status">正在解析 EPUB…</p> : null}
          <div className="book-reader__epub" ref={hostRef} />
          <div className="book-reader__highlights">
            {marks.map((box) => (
              <button
                key={box.id}
                type="button"
                className={`book-reader__mark book-reader__mark--${box.highlight.color || 'gold'}`}
                style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                title={box.highlight.quote.slice(0, 60)}
                onClick={() => onHighlightClickRef.current(box.highlight)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
