import type { ResearchBounds, ResearchState, ResearchUserAgentMode } from '../types/research.ts'

/**
 * 研究栏的渲染侧桥接。
 *
 * 桌面版：真正干活的是主进程里的 `WebContentsView`，这里只上报矩形和导航意图。
 * 浏览器版（`npm run dev:web`）：没有主进程，返回 `null`，界面会显示「需要桌面版」的说明，
 * 而不是假装有个浏览器。
 */

export type ResearchMode = 'desktop' | 'demo'

export interface ResearchBridge {
  mode: ResearchMode
  ensure: () => Promise<ResearchState | null>
  createTab: (url?: string) => Promise<ResearchState | null>
  closeTab: (tabId: string) => Promise<ResearchState | null>
  activateTab: (tabId: string) => Promise<ResearchState | null>
  setBounds: (bounds: ResearchBounds) => Promise<ResearchState | null>
  setVisible: (visible: boolean) => Promise<ResearchState | null>
  navigate: (url: string) => Promise<ResearchState | null>
  back: () => Promise<ResearchState | null>
  forward: () => Promise<ResearchState | null>
  reload: () => Promise<ResearchState | null>
  setZoom: (zoom: number) => Promise<ResearchState | null>
  setUserAgentMode: (mode: ResearchUserAgentMode, compact: boolean) => Promise<ResearchState | null>
  selectedText: () => Promise<{ text: string; title: string; url: string } | null>
  getState: () => Promise<ResearchState | null>
  onState: (listener: (state: ResearchState) => void) => () => void
}

const noop = async () => null

const demoBridge: ResearchBridge = {
  mode: 'demo',
  ensure: noop,
  createTab: noop,
  closeTab: noop,
  activateTab: noop,
  setBounds: noop,
  setVisible: noop,
  navigate: noop,
  back: noop,
  forward: noop,
  reload: noop,
  setZoom: noop,
  setUserAgentMode: noop,
  selectedText: noop,
  getState: noop,
  onState: () => () => undefined,
}

export function getResearchBridge(): ResearchBridge {
  const api = window.shiyunDesktop?.research
  if (!api) return demoBridge
  return { mode: 'desktop', ...api }
}
