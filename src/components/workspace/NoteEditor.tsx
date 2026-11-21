import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { AnnotationBridge } from '../../data/annotationBridge'
import type { Highlight, Note } from '../../types/annotation'
import { describeLocator, readableNoteTitle } from '../../types/annotation'
import { IconBook, IconHighlight, IconLink, IconNote, IconPlus } from './icons'

interface Props {
  noteId: string
  annotations: AnnotationBridge
  /** 打开某条划线所在的原文（跳到页 / CFI） */
  onOpenSource: (highlight: Highlight) => void
  onTitleChange?: (title: string) => void
}

interface Loaded {
  noteId: string
  note: Note | null
  linked: Highlight[]
  error: string | null
}

const AUTOSAVE_MS = 600

/** TipTap 富文本笔记页：正文自动保存，下方列出关联的划线（多对多，双向可查）。 */
export function NoteEditor({ noteId, annotations, onOpenSource, onTitleChange }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ noteId: '', note: null, linked: [], error: null })
  const note = loaded.noteId === noteId ? loaded.note : null
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [candidates, setCandidates] = useState<Highlight[]>([])

  const noteRef = useRef<Note | null>(null)
  const titleRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ title?: string; body?: string; bodyText?: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([annotations.getNote(noteId), annotations.highlightsForNote(noteId)]).then(
      ([next, linked]) => {
        if (cancelled) return
        setLoaded({ noteId, note: next, linked, error: next ? null : '这篇笔记不存在，可能已经被删除。' })
        noteRef.current = next
        setTitle(next?.title ?? '')
        titleRef.current = next?.title ?? ''
      },
      (reason: unknown) => {
        if (cancelled) return
        setLoaded({
          noteId,
          note: null,
          linked: [],
          error: reason instanceof Error ? reason.message : '无法读取这篇笔记',
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [annotations, noteId])

  const savingRef = useRef<Promise<void>>(Promise.resolve())
  const flush = useCallback(() => {
    const patch = pendingRef.current
    if (!patch) return savingRef.current
    pendingRef.current = null
    setStatus('saving')
    const saving = savingRef.current.then(async () => {
      const updated = await annotations.updateNote(noteId, patch)
      noteRef.current = updated
      setStatus('saved')
    })
    savingRef.current = saving.catch(() => {
      pendingRef.current = { ...patch, ...pendingRef.current }
      setStatus('idle')
    })
    return saving
  }, [annotations, noteId])

  const schedule = useCallback(
    (patch: { title?: string; body?: string; bodyText?: string }) => {
      pendingRef.current = { ...pendingRef.current, ...patch }
      setStatus('saving')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void flush().catch(() => undefined)
      }, AUTOSAVE_MS)
    },
    [flush],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      void flush().catch(() => undefined)
    }
  }, [flush])

  // 编辑器初始化在内容就绪之后：TipTap 的 useEditor 只在挂载时读一次 content。
  if (!note) {
    return (
      <div className="note-page">
        <p className="book-reader__status">{loaded.error ?? '正在打开笔记…'}</p>
      </div>
    )
  }

  return (
    <NoteEditorBody
      key={noteId}
      noteId={noteId}
      note={note}
      linked={loaded.linked}
      annotations={annotations}
      title={title}
      status={status}
      candidates={candidates}
      onLoadCandidates={() => {
        void annotations.listAllHighlights().then(setCandidates)
      }}
      onTitle={(value) => {
        setTitle(value)
        titleRef.current = value
        onTitleChange?.(readableNoteTitle(value, noteRef.current?.bodyText ?? ''))
        schedule({ title: value })
      }}
      onChange={(body, bodyText) => schedule({ body, bodyText })}
      onOpenSource={onOpenSource}
      onDelete={async () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        try {
          await savingRef.current
          await flush()
          await annotations.deleteNote(noteId)
          setLoaded({ noteId, note: null, linked: [], error: '已移至回收站，可从「设置与回收站」恢复，正文和划线关联均保留。' })
          window.dispatchEvent(new Event('shiyun-library-changed'))
        } catch (error) { window.alert(String(error)) }
      }}
      onRun={(action) => {
        if (!note) return
        void action(note)
      }}
      reloadLink={async () => {
        const linked = await annotations.highlightsForNote(noteId)
        setLoaded((current) => ({ ...current, linked }))
      }}
    />
  )
}

interface BodyProps {
  onDelete: () => Promise<void>
  noteId: string
  note: Note
  linked: Highlight[]
  annotations: AnnotationBridge
  title: string
  status: 'idle' | 'saving' | 'saved'
  candidates: Highlight[]
  onLoadCandidates: () => void
  onTitle: (value: string) => void
  onChange: (body: string, bodyText: string) => void
  onOpenSource: (highlight: Highlight) => void
  onRun: (action: (note: Note) => void) => void
  reloadLink: () => Promise<void>
}

function NoteEditorBody(props: BodyProps) {
  const { note, annotations } = props
  const [empty, setEmpty] = useState(note.bodyText.trim().length === 0)
  const editor = useEditor({
    extensions: [StarterKit],
    content: parseBody(note),
    editorProps: {
      attributes: {
        class: 'note-editor__surface',
        'aria-label': '笔记正文',
      },
    },
    onCreate: ({ editor: instance }) => {
      setEmpty(instance.isEmpty)
    },
    onUpdate: ({ editor: instance }) => {
      setEmpty(instance.isEmpty)
      props.onChange(JSON.stringify(instance.getJSON()), instance.getText())
    },
  })

  return (
    <div className="note-page">
      <div className="note-page__head">
        <p className="note-page__kind"><IconNote size={13} />笔记</p>
        <input
          className="note-editor__title"
          value={props.title}
          placeholder="给这篇笔记一个标题（可留空，用正文首行）"
          aria-label="笔记标题"
          onChange={(event) => props.onTitle(event.target.value)}
        />
        <p className="note-page__meta">
          {props.status === 'saving' ? '正在保存…' : props.status === 'saved' ? '已保存到书库' : '自动保存'}
          {props.linked.length > 0 ? ` · 关联 ${props.linked.length} 条划线` : ' · 还没有关联划线'}
        </p>
      </div>

      <div className="note-format" aria-label="格式工具栏">
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          aria-pressed={editor?.isActive('bold') ?? false}
          title="加粗"
        ><b>B</b></button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          aria-pressed={editor?.isActive('italic') ?? false}
          title="斜体"
        ><i>I</i></button>
        <button
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          aria-pressed={editor?.isActive('bulletList') ?? false}
          title="列表"
        >•</button>
        <button
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          aria-pressed={editor?.isActive('blockquote') ?? false}
          title="引用"
        >”</button>
        <button onClick={() => editor?.chain().focus().undo().run()} title="撤销">↺</button>
        <button onClick={() => editor?.chain().focus().redo().run()} title="重做">↻</button>
      </div>

      <div className="note-editor">
        <EditorContent editor={editor} />
        {empty && (
          <button
            type="button"
            className="note-editor__empty"
            onClick={() => editor?.chain().focus().run()}
          >
            从这里写起：先写一句结论，再回到上面的划线补证据。
          </button>
        )}
      </div>

      <section className="note-links" aria-label="关联的划线">
        <header className="note-links__head">
          <p className="note-links__title"><IconLink size={13} />关联的划线</p>
          <button className="note-links__add" onClick={props.onLoadCandidates}>
            <IconPlus size={13} />关联一条划线
          </button>
        </header>

        {props.linked.length === 0 ? (
          <p className="note-links__empty">
            还没有关联划线。在阅读器里选中文字点「写笔记」，或在「我的划线」里把这条笔记挂到某条划线上。
          </p>
        ) : (
          <ul className="note-links__list">
            {props.linked.map((highlight) => (
              <li key={highlight.id} className="note-links__item">
                <IconHighlight size={13} />
                <span className="note-links__quote">“{highlight.quote.slice(0, 60)}”</span>
                <span className="note-links__locator">{describeLocator(highlight)}</span>
                <button onClick={() => props.onOpenSource(highlight)} title="打开划线所在的原文">
                  <IconBook size={12} />原文
                </button>
                <button
                  className="is-danger"
                  title="解除这条关联（划线本身不会被删除）"
                  onClick={() => {
                    void annotations.unlink(highlight.id, props.noteId).then(props.reloadLink)
                  }}
                >
                  解除
                </button>
              </li>
            ))}
          </ul>
        )}

        {props.candidates.length > 0 && (
          <ul className="note-links__candidates">
            {props.candidates
              .filter((candidate) => !props.linked.some((item) => item.id === candidate.id))
              .slice(0, 6)
              .map((candidate) => (
                <li key={candidate.id}>
                  <button
                    onClick={() => {
                      void annotations.link(candidate.id, props.noteId).then(props.reloadLink)
                    }}
                    title={`关联到${describeLocator(candidate)}`}
                  >
                    <IconLink size={12} />“{candidate.quote.slice(0, 40)}”
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <footer className="note-page__foot">
        <button
          className="is-danger"
          onClick={() => {
            void props.onDelete()
          }}
        >
          移至回收站
        </button>
      </footer>
    </div>
  )
}

/** 老数据可能只有 bodyText：那就把它当成一个段落，不要丢内容。 */
function parseBody(note: Note): string | Record<string, unknown> {
  if (note.body.trim()) {
    try {
      return JSON.parse(note.body) as Record<string, unknown>
    } catch {
      return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: note.body }] }] }
    }
  }
  if (note.bodyText.trim()) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: note.bodyText }] }],
    }
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}
