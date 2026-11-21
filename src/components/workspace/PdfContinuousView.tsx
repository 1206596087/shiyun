import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { Highlight, TextSelectionAnchor } from '../../types/annotation'
import { buildContext, normalizeQuote, normalizeRects } from '../../types/annotation'
import { pdfRenderWindow } from '../../types/reader'
import { horizontalScale, layoutTextSpans } from './pdfTextLayer'

const MAX_QUOTE = 2000
const DEFAULT_PAGE_RATIO = 1.414

interface Props {
  doc: PDFDocumentProxy
  currentPage: number
  total: number
  zoom: number
  stageWidth: number
  highlights: Highlight[]
  scrollRequest: { page: number; token: number } | null
  onCurrentPage: (page: number) => void
  onSelect: (selection: TextSelectionAnchor) => void
  onHighlightClick: (highlight: Highlight) => void
}

interface PageSurfaceProps {
  doc: PDFDocumentProxy
  pageNumber: number
  zoom: number
  stageWidth: number
  highlights: Highlight[]
  onSize: (page: number, size: { width: number; height: number }) => void
  onSelect: (selection: TextSelectionAnchor) => void
  onHighlightClick: (highlight: Highlight) => void
}

function PdfPageSurface(props: PageSurfaceProps) {
  const { doc, pageNumber, zoom, stageWidth, highlights, onSize, onSelect, onHighlightClick } = props
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const pageTextRef = useRef('')
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<void> } | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    const textLayer = textLayerRef.current
    const run = async () => {
      const proxy: PDFPageProxy = await doc.getPage(pageNumber)
      if (cancelled) return
      if (!canvas || !textLayer) return
      const base = proxy.getViewport({ scale: 1 })
      const available = Math.max(320, stageWidth - 56)
      const viewport = proxy.getViewport({ scale: (available / base.width) * zoom })
      const width = Math.floor(viewport.width)
      const height = Math.floor(viewport.height)
      setSize({ width, height })
      onSize(pageNumber, { width, height })

      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const context = canvas.getContext('2d')
      if (!context) return
      const task = proxy.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      })
      renderTaskRef.current = task
      await task.promise
      if (cancelled) return

      const textContent = await proxy.getTextContent()
      if (cancelled) return
      const items = textContent.items.flatMap((item) =>
        'str' in item ? [item as { str: string; width: number; transform: number[] }] : [],
      )
      pageTextRef.current = items.map((item) => item.str).join(' ').slice(0, 20000)
      textLayer.replaceChildren()
      textLayer.style.width = `${width}px`
      textLayer.style.height = `${height}px`
      const layouts = layoutTextSpans(items, viewport.transform, viewport.scale)
      const spans: HTMLSpanElement[] = []
      for (const layout of layouts) {
        const span = document.createElement('span')
        span.textContent = layout.text
        span.style.left = `${layout.left}px`
        span.style.top = `${layout.top}px`
        span.style.fontSize = `${layout.fontSize}px`
        if (layout.angle) span.style.transform = `rotate(${layout.angle}rad)`
        textLayer.append(span)
        spans.push(span)
      }
      spans.forEach((span, index) => {
        const layout = layouts[index]
        const rotate = layout.angle ? `rotate(${layout.angle}rad) ` : ''
        const scale = horizontalScale(span.getBoundingClientRect().width, layout.width)
        if (rotate || scale !== 1) span.style.transform = `${rotate}scaleX(${scale})`
      })
    }
    void run().catch((reason: unknown) => {
      if (!cancelled && (reason as { name?: string }).name !== 'RenderingCancelledException') {
        setError(reason instanceof Error ? reason.message : '页面渲染失败')
      }
    })
    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  }, [doc, onSize, pageNumber, stageWidth, zoom])

  useEffect(() => {
    const pageElement = pageRef.current
    if (!pageElement) return
    const handleSelection = () => {
      const selection = window.getSelection()
      const text = normalizeQuote(selection?.toString() ?? '')
      const textLayer = textLayerRef.current
      if (!selection || selection.rangeCount === 0 || text.length < 2 || !textLayer) return
      const range = selection.getRangeAt(0)
      if (!textLayer.contains(range.commonAncestorContainer)) return
      const box = textLayer.getBoundingClientRect()
      const rawRects = Array.from(range.getClientRects()).map((rect) => ({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }))
      const rects = normalizeRects(rawRects, box)
      const last = rawRects.at(-1)
      const context = buildContext(pageTextRef.current, text)
      onSelect({
        quote: text.slice(0, MAX_QUOTE),
        prefix: context.prefix,
        suffix: context.suffix,
        rects: rects.length > 0 ? rects : null,
        page: pageNumber,
        cfi: null,
        anchor: last
          ? { x: last.left + last.width / 2, y: last.top }
          : { x: box.left + box.width / 2, y: box.top },
      })
    }
    pageElement.addEventListener('mouseup', handleSelection)
    pageElement.addEventListener('touchend', handleSelection)
    return () => {
      pageElement.removeEventListener('mouseup', handleSelection)
      pageElement.removeEventListener('touchend', handleSelection)
    }
  }, [onSelect, pageNumber])

  return (
    <div
      ref={pageRef}
      className="book-reader__page book-reader__page--continuous"
      style={size.width > 0 ? { width: size.width, height: size.height } : undefined}
    >
      {error ? <p className="book-reader__error">第 {pageNumber} 页：{error}</p> : <>
        <canvas ref={canvasRef} className="book-reader__canvas" />
        <div className="book-reader__text-layer textLayer" ref={textLayerRef} />
        <div className="book-reader__highlights" aria-hidden={false}>
          {highlights.flatMap((highlight) => (highlight.rects ?? []).map((rect, index) => (
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
              onClick={() => onHighlightClick(highlight)}
            />
          )))}
        </div>
      </>}
    </div>
  )
}

export function PdfContinuousView(props: Props) {
  const { doc, currentPage, total, zoom, stageWidth, highlights, scrollRequest, onCurrentPage } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const [pageRatios, setPageRatios] = useState(() => new Map<number, number>())
  const renderedPages = useMemo(() => new Set(pdfRenderWindow(currentPage, total, 1)), [currentPage, total])
  const highlightsByPage = useMemo(() => {
    const grouped = new Map<number, Highlight[]>()
    for (const highlight of highlights) {
      if (highlight.locatorType !== 'pdf_page' || highlight.page === null) continue
      const pageHighlights = grouped.get(highlight.page) ?? []
      pageHighlights.push(highlight)
      grouped.set(highlight.page, pageHighlights)
    }
    return grouped
  }, [highlights])

  useEffect(() => {
    const container = containerRef.current
    const scroller = container?.parentElement
    if (!container || !scroller) return
    const update = () => {
      frameRef.current = null
      const rootTop = scroller.getBoundingClientRect().top
      let nearest = currentPage
      let nearestDistance = Number.POSITIVE_INFINITY
      for (const child of Array.from(container.children)) {
        const element = child as HTMLElement
        const pageNumber = Number(element.dataset.page)
        const distance = Math.abs(element.getBoundingClientRect().top - rootTop - 12)
        if (distance < nearestDistance) {
          nearest = pageNumber
          nearestDistance = distance
        }
      }
      if (nearest !== currentPage) onCurrentPage(nearest)
    }
    const handleScroll = () => {
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(update)
    }
    scroller.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', handleScroll)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [currentPage, onCurrentPage, total])

  useEffect(() => {
    if (!scrollRequest) return
    const container = containerRef.current
    const scroller = container?.parentElement
    const target = container?.querySelector<HTMLElement>(`[data-page="${scrollRequest.page}"]`)
    if (container && scroller && target) {
      // scrollIntoView 会在 Electron 中偶尔选中外层 workspace，而不是实际的阅读滚动容器。
      // 直接写目标容器的 scrollTop，页码/目录/外部定位因此走同一条确定路径。
      scroller.scrollTo({ top: target.offsetTop - container.offsetTop, behavior: 'auto' })
    }
    onCurrentPage(scrollRequest.page)
  }, [onCurrentPage, scrollRequest])

  const rememberSize = useCallback((pageNumber: number, size: { width: number; height: number }) => {
    const ratio = size.width > 0 ? size.height / size.width : DEFAULT_PAGE_RATIO
    setPageRatios((current) => {
      const previous = current.get(pageNumber)
      if (previous === ratio) return current
      const next = new Map(current)
      next.set(pageNumber, ratio)
      return next
    })
  }, [])

  const available = Math.max(320, stageWidth - 56) * zoom
  return (
    <div className="book-reader__continuous" ref={containerRef}>
      {Array.from({ length: total }, (_, index) => index + 1).map((pageNumber) => {
        const ratio = pageRatios.get(pageNumber) ?? DEFAULT_PAGE_RATIO
        const placeholder = { width: available, height: available * ratio }
        const pageHighlights = highlightsByPage.get(pageNumber) ?? []
        return (
          <section
            className={`book-reader__continuous-shell ${pageNumber === currentPage ? 'is-current' : ''}`}
            data-page={pageNumber}
            key={pageNumber}
            style={{ width: placeholder.width, height: placeholder.height }}
            aria-label={`第 ${pageNumber} 页`}
          >
            <span className="book-reader__continuous-number">{pageNumber}</span>
            {renderedPages.has(pageNumber) && (
              <PdfPageSurface
                doc={doc}
                pageNumber={pageNumber}
                zoom={zoom}
                stageWidth={stageWidth}
                highlights={pageHighlights}
                onSize={rememberSize}
                onSelect={props.onSelect}
                onHighlightClick={props.onHighlightClick}
              />
            )}
          </section>
        )
      })}
    </div>
  )
}
