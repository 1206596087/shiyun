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
