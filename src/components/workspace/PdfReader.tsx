import { useCallback, useEffect, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampPage, clampZoom } from '../../types/reader'
import type { Highlight, TextSelectionAnchor } from '../../types/annotation'
import { buildContext, normalizeQuote, normalizeRects } from '../../types/annotation'
import { horizontalScale, layoutTextSpans } from './pdfTextLayer'
import { IconBook, IconList } from './icons'

GlobalWorkerOptions.workerSrc = workerUrl

// 中文 PDF 往往使用 CID 字体，必须提供 cmaps；内置标准字体也一样（由 npm run assets 复制到 public/）。
const CMAP_URL = '/pdfjs/cmaps/'
const STANDARD_FONT_URL = '/pdfjs/standard_fonts/'
/** 单条划线最长存 2000 字，超长多半是整页误选 */
const MAX_QUOTE = 2000

export interface PdfOutlineEntry {
  title: string
  page: number | null
  depth: number
}

interface Props {
  url: string
  initialPage: number | null
  initialZoom: number
  /** 来自外部（划线列表「打开原文」）的跳页请求；token 变化即触发一次。 */
  focus: { page: number; token: number } | null
  highlights: Highlight[]
  /** 翻页 / 缩放后回报，调用方负责去抖持久化。 */
  onProgress: (page: number, zoom: number, total: number) => void
  onPageCount: (total: number) => void
  onSelect: (selection: TextSelectionAnchor) => void
  onHighlightClick: (highlight: Highlight) => void
}

export function PdfReader(props: Props) {
  const { url, initialPage, initialZoom, focus, highlights, onProgress, onPageCount } = props
  const [loaded, setLoaded] = useState<{ url: string; doc: PDFDocumentProxy | null; error: string | null }>({
    url: '',
    doc: null,
    error: null,
  })
  const [page, setPage] = useState(() => Math.max(1, initialPage ?? 1))
  const [total, setTotal] = useState(0)
  const [zoom, setZoom] = useState(() => clampZoom(initialZoom))
  const [outline, setOutline] = useState<PdfOutlineEntry[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [pageBox, setPageBox] = useState<{ width: number; height: number }>({ width: 0, height: 0 })

  // 载入状态从 state 派生：换书后旧文档立刻失效，不需要在 effect 里同步置空。
  const doc = loaded.url === url ? loaded.doc : null
  const error = loaded.url === url ? loaded.error : null
  const busy = loaded.url !== url

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const [stageWidth, setStageWidth] = useState(0)
  // 只留 cancel 与 promise 两个成员，避免把 pdfjs 的 RenderTask 类型泄漏到组件状态里
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<void> } | null>(null)
  // 当前页的文本内容留着给划线截前后文用，避免每次选择都重新拉一遍
  const pageTextRef = useRef('')

  // 外部跳页请求（划线列表 / 笔记里的关联划线）与本地翻页共用一个页码：
  // 用 token 比较大小得出该显示哪一页，纯派生，不在 effect 里改 state。
  const [seenFocus, setSeenFocus] = useState(0)
  const focusPage = focus && focus.token > seenFocus ? clampPage(focus.page, total || null) : null
  const displayPage = focusPage ?? page

  // 打开文档
  useEffect(() => {
    let cancelled = false
    const task = getDocument({ url, cMapUrl: CMAP_URL, cMapPacked: true, standardFontDataUrl: STANDARD_FONT_URL })
    task.promise.then(
      async (next) => {
        if (cancelled) return
        setLoaded({ url, doc: next, error: null })
        setTotal(next.numPages)
        setPage((current) => clampPage(current, next.numPages))
        onPageCount(next.numPages)
        try {
          const raw = await next.getOutline()
          if (cancelled || !raw) return
          const entries: PdfOutlineEntry[] = []
          const walk = async (items: Awaited<ReturnType<typeof next.getOutline>>, depth: number) => {
            for (const item of items ?? []) {
              let target: number | null = null
              if (typeof item.dest === 'string') {
                const resolved = await next.getDestination(item.dest).catch(() => null)
                if (resolved && typeof resolved[0] === 'object') {
                  target = (await next.getPageIndex(resolved[0]).catch(() => -1)) + 1 || null
                }
              } else if (Array.isArray(item.dest) && typeof item.dest[0] === 'object') {
                target = (await next.getPageIndex(item.dest[0]).catch(() => -1)) + 1 || null
              }
              entries.push({ title: item.title, page: target, depth })
              if (item.items?.length) await walk(item.items, depth + 1)
            }
          }
          await walk(raw, 0)
          if (!cancelled) setOutline(entries)
        } catch {
          if (!cancelled) setOutline([])
        }
      },
      (reason: unknown) => {
        if (cancelled) return
        setLoaded({ url, doc: null, error: reason instanceof Error ? reason.message : '无法打开这份 PDF' })
      },
    )
    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [url, onPageCount])

  // 测量可用宽度（缩放按「适合宽度 × zoom」计算）
  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setStageWidth(width)
    })
    observer.observe(element)
    setStageWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  // 渲染当前页：画布 + 可选中文本层（没有文本层就没法用真实选区划线）
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    const run = async () => {
      // 同一张 canvas 不能同时跑两个 render 任务：先把上一轮彻底收尾，否则新任务会直接被拒
      const previous = renderTaskRef.current
      if (previous) {
        previous.cancel()
        await previous.promise.catch(() => undefined)
      }
      const proxy: PDFPageProxy = await doc.getPage(displayPage)
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const base = proxy.getViewport({ scale: 1 })
      const available = Math.max(320, stageWidth - 56)
      const fit = available / base.width
      const viewport = proxy.getViewport({ scale: fit * zoom })
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      setPageBox({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) })
      const context = canvas.getContext('2d')
      if (!context) return
      const task = proxy.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      })
      renderTaskRef.current = task
      await task.promise.catch((reason: unknown) => {
        if (!cancelled) console.error('[PdfReader] render failed', reason)
      })
      if (cancelled) return

      const textContent = await proxy.getTextContent()
      if (cancelled) return
      const items = textContent.items.flatMap((item) => ('str' in item ? [item as { str: string; width: number; transform: number[] }] : []))
      pageTextRef.current = items
        .map((item) => item.str)
        .join(' ')
        .slice(0, 20000)

      const container = textLayerRef.current
      if (!container) return
      container.replaceChildren()
      container.style.width = `${Math.floor(viewport.width)}px`
      container.style.height = `${Math.floor(viewport.height)}px`
      // 自己排文本层（见 pdfTextLayer.ts）：pdfjs 的 TextLayer 在 Electron 里会挂住不返回
      const layouts = layoutTextSpans(items, viewport.transform, viewport.scale)
      const spans: HTMLSpanElement[] = []
      for (const layout of layouts) {
        const span = document.createElement('span')
        span.textContent = layout.text
        span.style.left = `${layout.left}px`
        span.style.top = `${layout.top}px`
        span.style.fontSize = `${layout.fontSize}px`
        if (layout.angle) span.style.transform = `rotate(${layout.angle}rad)`
        container.append(span)
        spans.push(span)
      }
      // 第二遍量自然宽度，按 PDF 给的目标宽度做横向拉伸，让透明文字压在真字上
      spans.forEach((span, index) => {
        const layout = layouts[index]
        const rotate = layout.angle ? `rotate(${layout.angle}rad) ` : ''
        const scale = horizontalScale(span.getBoundingClientRect().width, layout.width)
        if (rotate || scale !== 1) span.style.transform = `${rotate}scaleX(${scale})`
      })
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [doc, displayPage, zoom, stageWidth])

  // 进度回报
  useEffect(() => {
    if (!doc || total === 0) return
    onProgress(displayPage, zoom, total)
  }, [doc, displayPage, zoom, total, onProgress])

  // 选区 → 划线入口。只在选中的文字落在文本层里时才认，避免把工具栏文字也划了。
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const handle = () => {
      const selection = window.getSelection()
      const text = normalizeQuote(selection?.toString() ?? '')
      const container = textLayerRef.current
      if (!selection || selection.rangeCount === 0 || !text || text.length < 2 || !container) {
        return
      }
      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) return
      const box = container.getBoundingClientRect()
      const rawRects = Array.from(range.getClientRects()).map((rect) => ({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }))
      const rects = normalizeRects(rawRects, { left: box.left, top: box.top, width: box.width, height: box.height })
      const last = rawRects[rawRects.length - 1]
      const context = buildContext(pageTextRef.current, text)
      props.onSelect({
        quote: text.slice(0, MAX_QUOTE),
        prefix: context.prefix,
        suffix: context.suffix,
        rects: rects.length > 0 ? rects : null,
        page: displayPage,
        cfi: null,
        anchor: last
          ? { x: last.left + last.width / 2, y: last.top }
          : { x: box.left + box.width / 2, y: box.top },
      })
    }
    stage.addEventListener('mouseup', handle)
    stage.addEventListener('touchend', handle)
    return () => {
      stage.removeEventListener('mouseup', handle)
      stage.removeEventListener('touchend', handle)
    }
  }, [props, displayPage])

  // 翻页即接管页码：把外部 focus 的 token 记账为「已处理」，之后由本地 page 主导。
  const goTo = useCallback(
    (next: number) => {
      setSeenFocus(focus?.token ?? 0)
      setPage(clampPage(next, total || null))
    },
    [focus, total],
  )

  const changeZoom = useCallback((next: number) => {
    setZoom((current) => clampZoom(Number((current + next).toFixed(2))))
  }, [])

  const pageHighlights = highlights.filter(
    (highlight) => highlight.locatorType === 'pdf_page' && highlight.page === displayPage,
  )

  return (
    <div className="book-reader">
      <div className="book-reader__bar">
        <button
          className={`ws-chip ${tocOpen ? 'is-on' : ''}`}
          onClick={() => setTocOpen((open) => !open)}
          disabled={outline.length === 0}
          title={outline.length === 0 ? '这份 PDF 没有内嵌目录' : '显示目录'}
          aria-pressed={tocOpen}
        >
          <IconList size={14} />目录
        </button>
        <div className="book-reader__pages">
          <button onClick={() => goTo(displayPage - 1)} disabled={displayPage <= 1} title="上一页">‹</button>
          <input
            aria-label="页码"
            value={displayPage}
            inputMode="numeric"
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value.replace(/[^\d]/g, ''), 10)
              if (Number.isFinite(parsed)) goTo(parsed)
            }}
          />
          <span>/ {total || '—'}</span>
          <button onClick={() => goTo(displayPage + 1)} disabled={total === 0 || displayPage >= total} title="下一页">›</button>
        </div>
        <div className="book-reader__zoom">
          <button onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} title="缩小">−</button>
          <button className="book-reader__zoom-value" onClick={() => setZoom(1)} title="重置为 100%">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} title="放大">＋</button>
        </div>
      </div>

      <div className="book-reader__main">
        {tocOpen && outline.length > 0 && (
          <nav className="book-reader__toc" aria-label="目录">
            <p className="book-reader__toc-title"><IconBook size={13} />目录</p>
            {outline.map((entry, index) => (
              <button
                key={`${entry.title}-${index}`}
                className="book-reader__toc-item"
                style={{ paddingLeft: `${10 + entry.depth * 12}px` }}
                disabled={entry.page === null}
                onClick={() => {
                  if (entry.page) goTo(entry.page)
                  setTocOpen(false)
                }}
              >
                {entry.title}
              </button>
            ))}
          </nav>
        )}
        <div className="book-reader__stage" ref={stageRef}>
          {error ? (
            <p className="book-reader__error">{error}</p>
          ) : (
            <>
              {busy && <p className="book-reader__status">正在解析 PDF…</p>}
              <div
                className="book-reader__page"
                style={pageBox.width > 0 ? { width: pageBox.width, height: pageBox.height } : undefined}
              >
              <canvas ref={canvasRef} className="book-reader__canvas" />
              <div className="book-reader__text-layer textLayer" ref={textLayerRef} />
              <div className="book-reader__highlights" aria-hidden={false}>
                {pageHighlights.map((highlight) =>
                  (highlight.rects ?? []).map((rect, index) => (
                    <button
                      key={`${highlight.id}-${index}`}
                      type="button"
                      className={`book-reader__mark book-reader__mark--${highlight.color}`}
                      style={{
                        left: `${rect.left * 100}%`,
                        top: `${rect.top * 100}%`,
                        width: `${rect.width * 100}%`,
                        height: `${rect.height * 100}%`,
                      }}
                      title={`${highlight.quote.slice(0, 40)}${highlight.noteCount > 0 ? `（${highlight.noteCount} 篇笔记）` : ''}`}
                      aria-label={`划线：${highlight.quote.slice(0, 30)}`}
                      onClick={() => props.onHighlightClick(highlight)}
                    />
                  )),
                )}
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
