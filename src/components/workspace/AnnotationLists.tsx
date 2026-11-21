import { useCallback, useEffect, useState } from 'react'
import type { AnnotationBridge } from '../../data/annotationBridge'
import type { Highlight, Note } from '../../types/annotation'
import { describeLocator, readableNoteTitle } from '../../types/annotation'
import { IconBook, IconHighlight, IconLink, IconNote, IconRefresh } from './icons'

interface HighlightProps {
  annotations: AnnotationBridge
  bookTitle: (bookId: string) => string
  onOpenSource: (highlight: Highlight) => void
  onCreateNote: (highlightId: string) => void
}

interface NoteProps {
  annotations: AnnotationBridge
  bookTitle: (bookId: string) => string
  onOpenNote: (noteId: string) => void
  onFocusHighlight: (highlight: Highlight) => void
}

interface Loaded<T> {
  items: T
  error: string | null
  loading: boolean
}

const EMPTY_HIGHLIGHTS: Highlight[] = []
const EMPTY_NOTES: Note[] = []

/** 「我的划线」：书库里所有划线，可按书追溯到原文，也能看到它挂了几篇笔记。 */
export function HighlightListPage({ annotations, bookTitle, onOpenSource, onCreateNote }: HighlightProps) {
  const [state, setState] = useState<Loaded<Highlight[]>>({ items: EMPTY_HIGHLIGHTS, error: null, loading: true })

  const reload = useCallback(() => {
    annotations.listAllHighlights().then(
      (items) => setState({ items, error: null, loading: false }),
      (reason: unknown) => setState({ items: EMPTY_HIGHLIGHTS, error: message(reason), loading: false }),
    )
  }, [annotations])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <div className="annotation-page">
      <header className="annotation-page__head">
        <p className="annotation-page__kind"><IconHighlight size={13} />我的划线</p>
        <h1>全部划线</h1>
        <p className="annotation-page__meta">
          {state.loading ? '正在读取书库…' : `${state.items.length} 条划线 · 划线只有页码或 CFI 才活得下去，不靠像素坐标`}
          <button className="annotation-page__refresh" onClick={reload} title="刷新列表">
            <IconRefresh size={13} />刷新
          </button>
        </p>
      </header>

      {state.error && <p className="annotation-page__error">{state.error}</p>}

      {!state.loading && state.items.length === 0 && !state.error && (
        <p className="annotation-page__empty">
          还没有划线。打开一本书，选中一句话，点「添加划线」—— 划线会立刻写进 SQLite，重启之后仍然在。
        </p>
      )}

      <ul className="annotation-list">
        {state.items.map((highlight) => (
          <li key={highlight.id} className="annotation-item">
            <p className="annotation-item__quote">“{highlight.quote}”</p>
            <p className="annotation-item__meta">
              <IconBook size={12} />{bookTitle(highlight.bookId)}
              <span aria-hidden="true">·</span>
              {describeLocator(highlight)}
              <span aria-hidden="true">·</span>
              {highlight.noteCount > 0 ? `${highlight.noteCount} 篇笔记` : '还没有笔记'}
            </p>
            <div className="annotation-item__actions">
              <button onClick={() => onOpenSource(highlight)} title="打开这条划线所在的页 / 章节">
                <IconBook size={12} />定位原文
              </button>
              <button
                onClick={() => onCreateNote(highlight.id)}
                title="从这条划线写一篇新笔记"
              >
                <IconNote size={12} />写笔记
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 「我的笔记」：所有笔记，显示标题来源（显式标题或正文首行）与关联划线。 */
export function NoteListPage({ annotations, bookTitle, onOpenNote, onFocusHighlight }: NoteProps) {
  const [state, setState] = useState<Loaded<Note[]>>({ items: EMPTY_NOTES, error: null, loading: true })
  const [linked, setLinked] = useState<Record<string, Highlight[]>>({})

  const reload = useCallback(() => {
    annotations.listNotes().then(
      (items) => {
        setState({ items, error: null, loading: false })
        void Promise.all(items.map((note) => annotations.highlightsForNote(note.id))).then((groups) => {
          const next: Record<string, Highlight[]> = {}
          items.forEach((note, index) => { next[note.id] = groups[index] ?? [] })
          setLinked(next)
        })
      },
      (reason: unknown) => setState({ items: EMPTY_NOTES, error: message(reason), loading: false }),
    )
  }, [annotations])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <div className="annotation-page">
      <header className="annotation-page__head">
        <p className="annotation-page__kind"><IconNote size={13} />我的笔记</p>
        <h1>全部笔记</h1>
        <p className="annotation-page__meta">
          {state.loading ? '正在读取书库…' : `${state.items.length} 篇笔记`}
          <button className="annotation-page__refresh" onClick={reload} title="刷新列表">
            <IconRefresh size={13} />刷新
          </button>
        </p>
      </header>

      {state.error && <p className="annotation-page__error">{state.error}</p>}

      {!state.loading && state.items.length === 0 && !state.error && (
        <p className="annotation-page__empty">
          还没有笔记。在阅读器里选中文字点「写笔记」，笔记会立刻和那条划线关联起来。
        </p>
      )}

      <ul className="annotation-list">
        {state.items.map((note) => {
          const highlights = linked[note.id] ?? []
          return (
            <li key={note.id} className="annotation-item">
              <button className="annotation-item__title" onClick={() => onOpenNote(note.id)}>
                {readableNoteTitle(note.title, note.bodyText)}
              </button>
              <p className="annotation-item__meta">
                <IconLink size={12} />
                {highlights.length > 0 ? `关联 ${highlights.length} 条划线` : '还没关联划线'}
                <span aria-hidden="true">·</span>
                {formatTime(note.updatedAt)}
              </p>
              {highlights.length > 0 && (
                <ul className="annotation-item__links">
                  {highlights.map((highlight) => (
                    <li key={highlight.id}>
                      <button onClick={() => onFocusHighlight(highlight)} title="跳到这条划线所在的位置">
                        “{highlight.quote.slice(0, 36)}” · {bookTitle(highlight.bookId)} · {describeLocator(highlight)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
