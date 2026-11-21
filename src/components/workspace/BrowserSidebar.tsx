import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconBack, IconExternal, IconForward, IconGlobe, IconRefresh, IconSearch } from './icons'
import { getResearchBridge } from '../../data/researchBridge'
import { getClippingBridge } from '../../data/clippingBridge'
import { displayUrl, toNavigableUrl } from '../../data/researchUrl'
import type { ResearchRequest } from '../../data/selectionActions'
import { getTranslationProvider } from '../../data/translation'
import {
  EMPTY_RESEARCH_STATE,
  resolveResearchMobileMode,
  type ResearchBounds,
  type ResearchState,
  type ResearchUserAgentMode,
} from '../../types/research'

export type ResearchLayout = 'compact' | 'expanded' | 'immersive'

interface Props {
  active: boolean
  visible: boolean
  layout: ResearchLayout
  onLayoutChange: (layout: ResearchLayout) => void
  request?: (ResearchRequest & { token: number }) | null
  initialQuery?: string
}

export function ResearchSidebar({ active, visible, layout, onLayoutChange, request, initialQuery }: Props) {
  const bridge = useMemo(() => getResearchBridge(), [])
  const clippings = useMemo(() => getClippingBridge(), [])
  const slotRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [state, setState] = useState<ResearchState>(EMPTY_RESEARCH_STATE)
  const [draft, setDraft] = useState(initialQuery ?? '')
  const [notice, setNotice] = useState('')

  const report = useCallback(() => {
    if (bridge.mode !== 'desktop') return
    const rect = slotRef.current?.getBoundingClientRect()
    if (!rect) return
    const bounds: ResearchBounds = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    void bridge.setBounds(bounds)
  }, [bridge])

  useEffect(() => {
    if (bridge.mode !== 'desktop') return
    let cancelled = false
    void bridge.ensure().then((next) => {
      if (!cancelled && next) { setState(next); setDraft(next.url ? displayUrl(next.url) : '') }
    })
    const unsubscribe = bridge.onState((next) => {
      setState(next)
      if (document.activeElement !== inputRef.current) setDraft(next.url ? displayUrl(next.url) : '')
    })
    return () => { cancelled = true; unsubscribe() }
  }, [bridge])

  useEffect(() => {
    if (bridge.mode !== 'desktop') return
    const slot = slotRef.current
    if (!slot) return
    const observer = new ResizeObserver(report)
    observer.observe(slot)
    window.addEventListener('resize', report)
    report()
    return () => { observer.disconnect(); window.removeEventListener('resize', report) }
  }, [bridge, report, layout])

  const shown = active && visible
  useEffect(() => {
    if (bridge.mode !== 'desktop') return
    void bridge.setVisible(shown).then((next) => next && setState(next))
    if (!shown) return
    const timer = setTimeout(report, 80)
    return () => clearTimeout(timer)
  }, [bridge, shown, report])

  useEffect(() => {
    if (bridge.mode !== 'desktop' || !request?.url) return
    const action = request.newTab ? bridge.createTab(request.url) : bridge.navigate(request.url)
    void action.then((next) => next && setState(next))
  }, [bridge, request])

  const go = () => {
    const url = toNavigableUrl(draft)
    void bridge.navigate(url).then((next) => next && setState(next))
  }

  const handleWebSelection = async (action: 'translate' | 'note' | 'copy') => {
    if (action === 'note') {
      // 摘录必须落成真正的 WebClipping 实体（阶段一），而不是伪装成一篇笔记：
      // 网页改版之后，这条摘录仍然能在「我的摘录」里读到原文。
      const saved = await clippings.captureSelection()
      if (!saved) {
        setNotice(clippings.mode === 'desktop'
          ? '请先在网页中选中文字，再点「保存摘录」。'
          : '浏览器预览取不到网页选区，请用桌面版。')
        return
      }
      setNotice('已保存到「我的摘录」，可以去中栏整理成笔记。')
      window.dispatchEvent(new Event('shiyun-library-changed'))
      return
    }
    const selection = await bridge.selectedText()
    if (!selection) { setNotice('请先在网页中选中文字。'); return }
    if (action === 'translate') {
      const provider = getTranslationProvider()
      const result = await provider.translate({ text: selection.text, targetLang: 'zh-Hans' })
      if (!result.ok) { setNotice(result.reason); return }
      setNotice(result.notice)
      const next = await bridge.createTab(result.url); if (next) setState(next)
    } else {
      await navigator.clipboard.writeText(selection.text); setNotice('已复制网页选中文字。')
    }
  }

  const demo = bridge.mode !== 'desktop'
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId)
  const zoom = activeTab?.zoom ?? 1
  const compact = layout === 'compact'

  useEffect(() => {
    if (bridge.mode !== 'desktop' || !activeTab) return
    const desiredMobile = resolveResearchMobileMode(activeTab.userAgentMode, compact)
    if (desiredMobile === activeTab.mobileMode) return
    void bridge.setUserAgentMode(activeTab.userAgentMode, compact).then((next) => next && setState(next))
  }, [activeTab, bridge, compact])

  const cycleUserAgent = () => {
    if (!activeTab) return
    const next: ResearchUserAgentMode = activeTab.userAgentMode === 'auto'
      ? 'mobile'
      : activeTab.userAgentMode === 'mobile' ? 'desktop' : 'auto'
    void bridge.setUserAgentMode(next, compact).then((value) => value && setState(value))
  }

  return (
    <aside className={`research-sidebar is-${layout}`} aria-label="网页研究">
      <div className="research-tabs" role="tablist" aria-label="网页标签">
        {state.tabs.map((tab) => (
          <div key={tab.id} role="tab" aria-selected={tab.id === state.activeTabId}
            className={`research-tab${tab.id === state.activeTabId ? ' is-active' : ''}`}>
            <button className="research-tab__activate"
              onClick={() => { setDraft(tab.url ? displayUrl(tab.url) : ''); void bridge.activateTab(tab.id).then((next) => next && setState(next)) }}>
              <span>{tab.loading ? '加载中…' : tab.title || '新标签页'}</span>
            </button>
            <button className="research-tab__close" aria-label={`关闭 ${tab.title || '标签页'}`}
              onClick={() => void bridge.closeTab(tab.id).then((next) => next && setState(next))}>×</button>
          </div>
        ))}
        <button className="research-tab__new" aria-label="新建网页标签" title="新建标签" disabled={demo}
          onClick={() => void bridge.createTab().then((next) => next && setState(next))}>＋</button>
      </div>

      <div className="research-nav">
        <button aria-label="后退" disabled={demo || !state.canGoBack} onClick={() => void bridge.back().then((next) => next && setState(next))}><IconBack size={15} /></button>
        <button aria-label="前进" disabled={demo || !state.canGoForward} onClick={() => void bridge.forward().then((next) => next && setState(next))}><IconForward size={15} /></button>
        <button aria-label="刷新" disabled={demo || !state.url} onClick={() => void bridge.reload().then((next) => next && setState(next))}><IconRefresh size={15} /></button>
        <p className="research-nav__title" title={state.title || state.url}><IconGlobe size={14} />{state.title || '网页研究'}</p>
      </div>

      <div className="research-input">
        <input ref={inputRef} value={draft} placeholder="搜索关键词或输入网址" aria-label="网页研究地址栏" disabled={demo}
          onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !demo) go() }} />
        <button onClick={go} aria-label="打开" disabled={demo}><IconSearch size={15} /></button>
      </div>

      <div className="research-layout-tools" aria-label="网页布局与缩放">
        {(['compact', 'expanded', 'immersive'] as const).map((item) => (
          <button key={item} className={layout === item ? 'is-on' : ''} onClick={() => onLayoutChange(item)}>
            {item === 'compact' ? '紧凑' : item === 'expanded' ? '扩展' : '沉浸'}
          </button>
        ))}
        <span />
        <button disabled={demo} onClick={() => void bridge.setZoom(zoom - 0.1)}>−</button>
        <small>{Math.round(zoom * 100)}%</small>
        <button disabled={demo} onClick={() => void bridge.setZoom(zoom + 0.1)}>＋</button>
        <button disabled={demo} onClick={() => void bridge.setZoom(1)}>重置</button>
        <button
          className={activeTab?.mobileMode ? 'is-on' : ''}
          disabled={demo || !activeTab}
          onClick={cycleUserAgent}
          title="自动：紧凑栏使用手机网页，扩展/沉浸使用桌面网页；点击可逐标签覆盖"
        >
          {activeTab?.userAgentMode === 'mobile'
            ? '手机网页'
            : activeTab?.userAgentMode === 'desktop'
              ? '桌面网页'
              : `自动·${activeTab?.mobileMode ? '手机' : '桌面'}`}
        </button>
      </div>

      {(state.error || notice) && <p className="research-error" role="status">{state.error || notice}</p>}
      <div className="research-view" ref={slotRef} aria-hidden={demo}>
        {(demo || !state.url) && <div className="research-view__demo">
          <h3>{demo ? '桌面版可使用真实网页研究' : '新标签页'}</h3>
          <p>{demo ? '浏览器预览没有 Electron 网页视图。' : '在上方输入网址或关键词开始研究。'}</p>
        </div>}
      </div>

      <div className="research-selection-actions">
        <button disabled={demo || !state.url} onClick={() => void handleWebSelection('translate')}>翻译选中</button>
        <button disabled={demo || !state.url} onClick={() => void handleWebSelection('note')}>保存摘录</button>
        <button disabled={demo || !state.url} onClick={() => void handleWebSelection('copy')}>复制</button>
        <button onClick={() => {
          const target = state.url || toNavigableUrl(initialQuery ?? '')
          if (window.shiyunDesktop) void window.shiyunDesktop.openExternal(target)
          else window.open(target, '_blank', 'noopener,noreferrer')
        }}><IconExternal size={14} />外部打开</button>
      </div>
    </aside>
  )
}
