import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconBack, IconExternal, IconForward, IconGlobe, IconRefresh, IconSearch } from './icons'
import { getResearchBridge } from '../../data/researchBridge'
import { displayUrl, toNavigableUrl } from '../../data/researchUrl'
import { EMPTY_RESEARCH_STATE, type ResearchBounds, type ResearchState } from '../../types/research'

interface Props {
  /** 书房是否是当前空间：切到银河时必须把网页藏起来，否则它会浮在银河上面。 */
  active: boolean
  /** 右栏是否显示（用户可以在布局设置里隐藏）。 */
  visible: boolean
  /** 打开研究栏时预填的搜索词（例如当前选中的划线主题）。 */
  initialQuery?: string
}

/**
 * 右栏的网页研究栏（M6）。
 *
 * 真正的网页由主进程的 `WebContentsView` 渲染，它不是 DOM 节点，
 * 所以这里的 `.research-view` 只是一个位置占位：用 ResizeObserver 把矩形报给主进程，
 * 主进程把原生视图摆上去。浏览器模式没有主进程，只能诚实地写明「需要桌面版」。
 */
export function ResearchSidebar({ active, visible, initialQuery }: Props) {
  const bridge = useMemo(() => getResearchBridge(), [])
  const slotRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<ResearchState>(EMPTY_RESEARCH_STATE)
  const [draft, setDraft] = useState(initialQuery ?? '')

  const report = useCallback(() => {
    if (bridge.mode !== 'desktop') return
    const slot = slotRef.current
    if (!slot) return
    const rect = slot.getBoundingClientRect()
    const bounds: ResearchBounds = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    }
    void bridge.setBounds(bounds)
  }, [bridge])

  useEffect(() => {
    if (bridge.mode !== 'desktop') return
    let cancelled = false
    void bridge.ensure().then((next) => {
      if (!cancelled && next) setState(next)
    })
    const unsubscribe = bridge.onState((next) => setState(next))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [bridge])

  // 位置同步：窗口缩放、拖栏宽、右栏显隐、切空间都会改变矩形。
  useEffect(() => {
    if (bridge.mode !== 'desktop') return
    const slot = slotRef.current
    if (!slot) return
    const observer = new ResizeObserver(() => report())
    observer.observe(slot)
    window.addEventListener('resize', report)
    report()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [bridge, report])

  const shown = active && visible

  useEffect(() => {
    if (bridge.mode !== 'desktop') return
    void bridge.setVisible(shown).then((next) => {
      if (next) setState(next)
    })
    if (shown) {
      // 显示之后再量一次，避免布局动画结束时尺寸还没落定
      const timer = setTimeout(report, 60)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [bridge, shown, report])

  const go = () => {
    const url = toNavigableUrl(draft)
    setDraft(displayUrl(url))
    void bridge.navigate(url).then((next) => {
      if (next) setState(next)
    })
  }

  const demo = bridge.mode !== 'desktop'

  return (
    <aside className="research-sidebar" aria-label="网页研究">
      <div className="research-nav">
        <button
          type="button"
          aria-label="后退"
          title={state.canGoBack ? '后退' : '没有上一页'}
          disabled={demo || !state.canGoBack}
          onClick={() => void bridge.back().then((next) => next && setState(next))}
        >
          <IconBack size={15} />
        </button>
        <button
          type="button"
          aria-label="前进"
          title={state.canGoForward ? '前进' : '没有下一页'}
          disabled={demo || !state.canGoForward}
          onClick={() => void bridge.forward().then((next) => next && setState(next))}
        >
          <IconForward size={15} />
        </button>
        <button
          type="button"
          aria-label="刷新"
          title={demo ? '需要桌面版' : '刷新网页'}
          disabled={demo || !state.url}
          onClick={() => void bridge.reload().then((next) => next && setState(next))}
        >
          <IconRefresh size={15} />
        </button>
        <p className="research-nav__title" title={state.title || state.url}>
          <IconGlobe size={14} />
          {state.title || (state.url ? displayUrl(state.url) : '网页研究')}
        </p>
      </div>

      <div className="research-input">
        <input
          value={draft}
          placeholder={demo ? '桌面版可搜索关键词或输入网址' : '搜索关键词或输入网址'}
          aria-label="网页研究地址栏"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !demo) go()
          }}
          disabled={demo}
        />
        <button type="button" onClick={go} title={demo ? '需要桌面版' : '打开'} aria-label="打开" disabled={demo}>
          <IconSearch size={15} />
        </button>
      </div>

      {state.error && <p className="research-error">{state.error}</p>}

      <div className="research-view" ref={slotRef} aria-hidden={demo}>
        {demo && (
          <div className="research-view__demo">
            <h3>右侧网页在桌面版里是真实网页</h3>
            <p>浏览器模式没有主进程，也就没有 <code>WebContentsView</code>，这里不会假装加载网页。</p>
            <p className="research-copy--muted">
              桌面版（<code>npm run dev</code>）里这一块是独立的浏览器视图：地址栏、前进后退、刷新都可用，权限（摄像头、麦克风、定位、通知、下载）默认全部拒绝。
            </p>
            <button type="button" onClick={() => void window.shiyunDesktop?.openExternal(toNavigableUrl(initialQuery ?? 'OR 与 RR 的区别 流行病学'))}>
              <IconExternal size={14} />在系统浏览器里搜索
            </button>
          </div>
        )}
      </div>

      <div className="research-footer">
        <button
          type="button"
          onClick={() => {
            const target = state.url || toNavigableUrl(initialQuery ?? 'OR 与 RR 的区别 流行病学')
            if (window.shiyunDesktop) void window.shiyunDesktop.openExternal(target)
            else window.open(target, '_blank', 'noopener,noreferrer')
          }}
          title="在系统默认浏览器中打开当前网页"
        >
          <IconExternal size={14} />外部浏览器打开
        </button>
      </div>
    </aside>
  )
}
