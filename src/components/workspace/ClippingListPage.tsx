import { useCallback, useEffect, useState } from 'react'
import type { ClippingBridge } from '../../data/clippingBridge'
import type { WebClipping } from '../../types/clipping'
import { clippingHost, clippingTitle } from '../../types/clipping'
import { IconExternal, IconGlobe, IconNote, IconRefresh, IconTrash } from './icons'

interface Props {
  clippings: ClippingBridge
  onOpenNote: (noteId: string) => void
  onOpenUrl: (url: string) => void
  /** 让左栏计数也跟着变（删掉一条摘录之后不该还显示旧数字）。 */
  onChanged?: () => void
}

interface Loaded {
  items: WebClipping[]
  error: string | null
  loading: boolean
}

const EMPTY: WebClipping[] = []

/**
 * 「我的摘录」：从网页上摘下来的段落。
 *
 * 这些是**本地副本**：网页改版、原页面 404 都不影响这里看到的内容；
 * 反过来，"回到原网页"只是打开那个地址，不承诺还能看到同一段文字。
 */
export function ClippingListPage({ clippings, onOpenNote, onOpenUrl, onChanged }: Props) {
  const [state, setState] = useState<Loaded>({ items: EMPTY, error: null, loading: true })
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(() => {
    clippings.list().then(
      (items) => setState({ items, error: null, loading: false }),
      (reason: unknown) => setState({ items: EMPTY, error: message(reason), loading: false }),
    )
  }, [clippings])

  useEffect(() => {
    reload()
  }, [reload])

  const toNote = (clipping: WebClipping) => {
    setBusyId(clipping.id)
    clippings.toNote(clipping.id).then(
      (result) => {
        setBusyId(null)
        reload()
        onChanged?.()
        // 已有笔记就直接打开，新建的也一样——用户点「整理成笔记」后想看到正文。
        onOpenNote(result.noteId)
      },
      (reason: unknown) => { setBusyId(null); setState((previous) => ({ ...previous, error: message(reason) })) },
    )
  }

  const remove = (clipping: WebClipping) => {
    const confirmed = window.confirm('删除这条摘录？\n\n它会进回收站，关联的笔记不会被删除。')
    if (!confirmed) return
    setBusyId(clipping.id)
    clippings.remove(clipping.id).then(
      () => { setBusyId(null); reload(); onChanged?.() },
      (reason: unknown) => { setBusyId(null); setState((previous) => ({ ...previous, error: message(reason) })) },
    )
  }

  return (
    <div className="annotation-page">
      <header className="annotation-page__head">
        <p className="annotation-page__kind"><IconGlobe size={13} />我的摘录</p>
        <h1>网页摘录</h1>
        <p className="annotation-page__meta">
          {state.loading ? '正在读取书库…' : `${state.items.length} 条摘录 · 正文保存在本地，原网页改了也不影响`}
          <button className="annotation-page__refresh" onClick={reload} title="刷新列表">
            <IconRefresh size={13} />刷新
          </button>
        </p>
      </header>

      {state.error && <p className="annotation-page__error">{state.error}</p>}

      {!state.loading && state.items.length === 0 && !state.error && (
        <p className="annotation-page__empty">
          还没有摘录。在右侧网页里选中一段文字，点底部的「保存摘录」——选中的文字由主进程读取，
          网页本身不需要装任何脚本。
        </p>
      )}

      <ul className="annotation-list">
        {state.items.map((clipping) => (
          <li key={clipping.id} className="annotation-item">
            <p className="annotation-item__quote">“{clipping.quote}”</p>
            <p className="annotation-item__meta">
              <IconGlobe size={12} />{clippingTitle(clipping)}
              <span aria-hidden="true">·</span>
              {clippingHost(clipping.url)}
              <span aria-hidden="true">·</span>
              {formatTime(clipping.capturedAt)}
            </p>
            {clipping.userNote.trim() && <p className="annotation-item__note">附注：{clipping.userNote}</p>}
            <div className="annotation-item__actions">
              <button onClick={() => toNote(clipping)} disabled={busyId === clipping.id} title={clipping.noteId ? '打开整理好的那篇笔记' : '把摘录变成一篇可编辑的笔记'}>
                <IconNote size={12} />{clipping.noteId ? '查看笔记' : '整理成笔记'}
              </button>
              <button onClick={() => onOpenUrl(clipping.url)} title="在右侧网页里打开原始地址（内容可能已经变了）">
                <IconExternal size={12} />打开原网页
              </button>
              <button onClick={() => remove(clipping)} disabled={busyId === clipping.id} className="is-danger" title="把这条摘录放进回收站">
                <IconTrash size={12} />删除
              </button>
            </div>
          </li>
        ))}
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
