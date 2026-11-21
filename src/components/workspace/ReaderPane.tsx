import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryBridge } from '../../data/libraryBridge'
import type { BookSource, SaveReadingStatePayload } from '../../types/reader'
import { EpubReader } from './EpubReader'
import { PdfReader } from './PdfReader'
import { IconBook } from './icons'

interface Props {
  bookId: string
  title: string
  bridge: LibraryBridge
}

/** 真实书籍的阅读页：取源文件 → 按格式挂 PDF.js / EPUB.js → 去抖保存阅读进度。 */
export function ReaderPane({ bookId, title, bridge }: Props) {
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

  if (source.format === 'pdf') {
    return (
      <PdfReader
        url={source.url}
        initialPage={source.state.page}
        initialZoom={source.state.zoom}
        onProgress={handlePdfProgress}
        onPageCount={handlePageCount}
      />
    )
  }

  return (
    <EpubReader
      url={source.url}
      initialCfi={source.state.cfi}
      initialZoom={source.state.zoom}
      onProgress={handleEpubProgress}
    />
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
