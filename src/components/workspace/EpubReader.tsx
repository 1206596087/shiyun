import { useCallback, useEffect, useRef, useState } from 'react'
import ePub, { type Book, type Rendition } from 'epubjs'
import type { NavItem } from 'epubjs/types/navigation'
import { IconBook, IconList } from './icons'

interface Props {
  url: string
  initialCfi: string | null
  initialZoom: number
  onProgress: (cfi: string, zoom: number, label: string) => void
}

interface TocEntry {
  label: string
  href: string
  depth: number
}

/** 稳定的空目录引用：避免每次渲染都产生新数组，把 ref 同步 effect 变成无限循环。 */
const EMPTY_TOC: TocEntry[] = []

function flattenToc(items: NavItem[], depth = 0, out: TocEntry[] = []): TocEntry[] {
  for (const item of items) {
    out.push({ label: item.label.trim(), href: item.href, depth })
    if (item.subitems?.length) flattenToc(item.subitems, depth + 1, out)
  }
  return out
}

export function EpubReader({ url, initialCfi, initialZoom, onProgress }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const [readyUrl, setReadyUrl] = useState('')
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null)
  const [tocState, setTocState] = useState<{ url: string; items: TocEntry[] }>({ url: '', items: [] })
  const [tocOpen, setTocOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [fontScale, setFontScale] = useState(() => Math.round(initialZoom * 100))

  // 载入状态按 url 派生：换书后旧状态自动失效，effect 里不需要同步重置。
  const toc = tocState.url === url ? tocState.items : EMPTY_TOC
  const error = failure && failure.url === url ? failure.message : null
  const busy = !error && readyUrl !== url

  const onProgressRef = useRef(onProgress)
  const tocRef = useRef<TocEntry[]>(toc)
  const fontScaleRef = useRef(fontScale)
  useEffect(() => {
    onProgressRef.current = onProgress
  }, [onProgress])
  useEffect(() => {
    tocRef.current = toc
  }, [toc])
  useEffect(() => {
    fontScaleRef.current = fontScale
  }, [fontScale])

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

    return () => {
      disposed = true
      window.removeEventListener('keydown', onKey)
      rendition.destroy()
      book.destroy()
      bookRef.current = null
      renditionRef.current = null
    }
  }, [url, initialCfi])

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontScale}%`)
  }, [fontScale])

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
        <div className="book-reader__stage book-reader__stage--epub">
          {error ? <p className="book-reader__error">{error}</p> : busy ? <p className="book-reader__status">正在解析 EPUB…</p> : null}
          <div className="book-reader__epub" ref={hostRef} />
        </div>
      </div>
    </div>
  )
}
