/**
 * 研究栏（M6）的共享类型：渲染进程与 preload 都用这一份，
 * 免得两边各写一遍字段名（`researchView.ts` 里也有同名接口，那边是主进程内部实现用）。
 */

export interface ResearchBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ResearchState {
  tabs: ResearchTabState[]
  activeTabId: string | null
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  visible: boolean
  error: string | null
}

export interface ResearchTabState {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
  zoom: number
  userAgentMode: ResearchUserAgentMode
  mobileMode: boolean
}

export type ResearchUserAgentMode = 'auto' | 'mobile' | 'desktop'

/** 自动模式只在紧凑侧栏使用移动 UA；宽屏布局仍保留桌面网页。 */
export function resolveResearchMobileMode(mode: ResearchUserAgentMode, compact: boolean): boolean {
  if (mode === 'mobile') return true
  if (mode === 'desktop') return false
  return compact
}

/** 保留当前 Chromium 版本，只把 Electron 桌面标识变成常见 Android Mobile 标识。 */
export function toMobileUserAgent(desktopUserAgent: string): string {
  const withoutElectron = desktopUserAgent
    .replace(/\([^)]*\)/u, '(Linux; Android 14; Pixel 8)')
    .replace(/\sElectron\/[^\s]+/u, '')
  if (/\sMobile\s+Safari\//u.test(withoutElectron)) return withoutElectron
  if (/\sSafari\//u.test(withoutElectron)) return withoutElectron.replace(/\sSafari\//u, ' Mobile Safari/')
  return `${withoutElectron} Mobile`
}

export const EMPTY_RESEARCH_STATE: ResearchState = {
  tabs: [],
  activeTabId: null,
  url: '',
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  visible: false,
  error: null,
}

/**
 * 浏览器会话持久化（阶段一）。
 *
 * 只存「URL、标题、顺序、当前标签、缩放、UA 模式」——不存表单内容、不存密码、
 * 也不存任何 DOM 文本：网页正文永远由 Chromium 自己按 URL 重新拉取。
 */
export const MAX_RESEARCH_TABS = 12
export const RESEARCH_SESSION_VERSION = 1

export interface ResearchSessionTab {
  id: string
  url: string
  title: string
  zoom: number
  userAgentMode: ResearchUserAgentMode
}

export interface ResearchSession {
  version: number
  tabs: ResearchSessionTab[]
  activeTabId: string | null
}

export const EMPTY_RESEARCH_SESSION: ResearchSession = {
  version: RESEARCH_SESSION_VERSION,
  tabs: [],
  activeTabId: null,
}

/** 只有 http/https 的地址才值得恢复；`about:blank` 之类不落盘。 */
export function isPersistableResearchUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

