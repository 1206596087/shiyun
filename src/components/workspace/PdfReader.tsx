import { useCallback, useEffect, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampPage, clampZoom } from '../../types/reader'
import { IconBook, IconList } from './icons'

GlobalWorkerOptions.workerSrc = workerUrl

// 中文 PDF 往往使用 CID 字体，必须提供 cmaps；内置标准字体也一样（由 npm run assets 复制到 public/）。
const CMAP_URL = '/pdfjs/cmaps/'
const STANDARD_FONT_URL = '/pdfjs/standard_fonts/'

export interface PdfOutlineEntry {
  title: string
  page: number | null
  depth: number
}

interface Props {
  url: string
  initialPage: number | null
  initialZoom: number
  /** 翻页 / 缩放后回报，调用方负责去抖持久化。 */
  onProgress: (page: number, zoom: number, total: number) => void
  onPageCount: (total: number) => void
}

export function PdfReader({ url, initialPage, initialZoom, onProgress, onPageCount }: Props) {
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

  // 载入状态从 state 派生：换书后旧文档立刻失效，不需要在 effect 里同步置空。
  const doc = loaded.url === url ? loaded.doc : null
  const error = loaded.url === url ? loaded.error : null
  const busy = loaded.url !== url

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageWidth, setStageWidth] = useState(0)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)

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

  // 渲染当前页
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    const run = async () => {
      renderTaskRef.current?.cancel()
      const proxy: PDFPageProxy = await doc.getPage(page)
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
      const context = canvas.getContext('2d')
      if (!context) return
      const task = proxy.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      })
      renderTaskRef.current = task
      await task.promise.catch(() => undefined)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [doc, page, zoom, stageWidth])

  // 进度回报
  useEffect(() => {
    if (!doc || total === 0) return
    onProgress(page, zoom, total)
  }, [doc, page, zoom, total, onProgress])

  const goTo = useCallback(
    (next: number) => {
      setPage((current) => {
        const value = clampPage(next, total || null)
        if (value === current) return current
        return value
      })
    },
    [total],
  )

  const changeZoom = useCallback((next: number) => {
    setZoom((current) => clampZoom(Number((current + next).toFixed(2))))
  }, [])

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
          <button onClick={() => goTo(page - 1)} disabled={page <= 1} title="上一页">‹</button>
          <input
            aria-label="页码"
            value={page}
            inputMode="numeric"
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value.replace(/[^\d]/g, ''), 10)
              if (Number.isFinite(parsed)) goTo(parsed)
            }}
          />
          <span>/ {total || '—'}</span>
          <button onClick={() => goTo(page + 1)} disabled={total === 0 || page >= total} title="下一页">›</button>
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
          ) : busy ? (
            <p className="book-reader__status">正在解析 PDF…</p>
          ) : (
            <canvas ref={canvasRef} className="book-reader__canvas" />
          )}
        </div>
      </div>
    </div>
  )
}
