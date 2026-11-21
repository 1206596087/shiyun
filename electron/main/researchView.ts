import { BrowserWindow, WebContentsView, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { resolveResearchMobileMode, toMobileUserAgent, type ResearchState, type ResearchTabState, type ResearchUserAgentMode } from '../../src/types/research.ts'

export interface ResearchBounds { x: number; y: number; width: number; height: number }

const PARTITION = 'persist:research'
const MIN_SIZE = 40
const MAX_TABS = 12

interface ResearchTab {
  id: string
  view: WebContentsView
  error: string | null
  zoom: number
  userAgentMode: ResearchUserAgentMode
  mobileMode: boolean
  desktopUserAgent: string
}

let host: BrowserWindow | null = null
let tabs: ResearchTab[] = []
let activeTabId: string | null = null
let bounds: ResearchBounds = { x: 0, y: 0, width: 0, height: 0 }
let visible = false
let sessionSecured = false

function isHttpUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:' } catch { return false }
}

function secureSession() {
  const target = session.fromPartition(PARTITION)
  if (!sessionSecured) {
    sessionSecured = true
    target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    target.setPermissionCheckHandler(() => false)
    target.on('will-download', (event) => event.preventDefault())
  }
}

function activeTab(): ResearchTab | null {
  return tabs.find((tab) => tab.id === activeTabId) ?? null
}

function toState(tab: ResearchTab): ResearchTabState {
  const contents = tab.view.webContents
  const url = contents.getURL()
  return {
    id: tab.id, url,
    title: contents.getTitle() || (url && isHttpUrl(url) ? new URL(url).hostname : '新标签页'),
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    error: tab.error, zoom: tab.zoom, userAgentMode: tab.userAgentMode, mobileMode: tab.mobileMode,
  }
}

export function researchState(): ResearchState {
  const active = activeTab()
  const current = active ? toState(active) : null
  return {
    tabs: tabs.map(toState), activeTabId,
    url: current?.url ?? '', title: current?.title ?? '', loading: current?.loading ?? false,
    canGoBack: current?.canGoBack ?? false, canGoForward: current?.canGoForward ?? false,
    visible, error: current?.error ?? null,
  }
}

function pushState(): void { host?.webContents.send('research:state', researchState()) }

function syncBounds(): void {
  const hidden = !visible || bounds.width < MIN_SIZE || bounds.height < MIN_SIZE
  for (const tab of tabs) {
    const shown = !hidden && tab.id === activeTabId
    tab.view.setBounds(shown ? {
      x: Math.round(bounds.x), y: Math.round(bounds.y),
      width: Math.round(bounds.width), height: Math.round(bounds.height),
    } : { x: 0, y: 0, width: 0, height: 0 })
  }
}

function wireTab(tab: ResearchTab): void {
  const contents = tab.view.webContents
  contents.on('did-start-loading', () => { tab.error = null; pushState() })
  contents.on('did-stop-loading', pushState)
  contents.on('did-navigate', pushState)
  contents.on('did-navigate-in-page', pushState)
  contents.on('page-title-updated', pushState)
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return
    tab.error = `无法打开 ${url || '该网页'}（${description || code}）`
    pushState()
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) createResearchTab(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (isHttpUrl(url)) return
    event.preventDefault(); tab.error = '只能打开 http/https 网页'; pushState()
  })
  contents.on('render-process-gone', () => {
    tab.error = '网页进程已退出，点刷新可以重新加载'; pushState()
  })
}

function makeTab(): ResearchTab {
  if (!host) throw new Error('研究窗口尚未初始化')
  const view = new WebContentsView({ webPreferences: {
    partition: PARTITION, sandbox: true, contextIsolation: true,
    nodeIntegration: false, webSecurity: true, spellcheck: false,
  } })
  secureSession()
  host.contentView.addChildView(view)
  const tab: ResearchTab = {
    id: `research-${randomUUID()}`,
    view,
    error: null,
    zoom: 1,
    userAgentMode: 'auto',
    mobileMode: false,
    desktopUserAgent: view.webContents.getUserAgent(),
  }
  tabs.push(tab); activeTabId = tab.id; wireTab(tab); syncBounds()
  return tab
}

export function ensureResearchView(win: BrowserWindow): WebContentsView {
  if (host !== win || win.isDestroyed()) { disposeResearchView(); host = win }
  return (activeTab() ?? makeTab()).view
}

export function createResearchTab(url?: string): ResearchState {
  if (!host) return researchState()
  if (tabs.length >= MAX_TABS) {
    const current = activeTab(); if (current) current.error = `最多同时打开 ${MAX_TABS} 个网页标签`
    pushState(); return researchState()
  }
  const tab = makeTab()
  if (url && isHttpUrl(url)) void tab.view.webContents.loadURL(url)
  syncBounds(); pushState(); return researchState()
}

export function activateResearchTab(tabId: string): ResearchState {
  if (tabs.some((tab) => tab.id === tabId)) activeTabId = tabId
  syncBounds(); pushState(); return researchState()
}

export function closeResearchTab(tabId: string): ResearchState {
  const index = tabs.findIndex((tab) => tab.id === tabId)
  if (index < 0) return researchState()
  const [tab] = tabs.splice(index, 1)
  try { host?.contentView.removeChildView(tab.view) } catch { /* host already gone */ }
  if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
  if (activeTabId === tabId) activeTabId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null
  if (tabs.length === 0 && host && !host.isDestroyed()) makeTab()
  syncBounds(); pushState(); return researchState()
}

export function setResearchBounds(next: ResearchBounds): ResearchState { bounds = next; syncBounds(); pushState(); return researchState() }
export function setResearchVisible(next: boolean): ResearchState { visible = next; syncBounds(); pushState(); return researchState() }

export function navigateResearch(url: string): ResearchState {
  const tab = activeTab(); if (!tab) return researchState()
  if (!isHttpUrl(url)) { tab.error = '只能打开 http/https 网页'; pushState(); return researchState() }
  tab.error = null; void tab.view.webContents.loadURL(url); return researchState()
}

export function researchBack(): ResearchState { const h = activeTab()?.view.webContents.navigationHistory; if (h?.canGoBack()) h.goBack(); return researchState() }
export function researchForward(): ResearchState { const h = activeTab()?.view.webContents.navigationHistory; if (h?.canGoForward()) h.goForward(); return researchState() }
export function researchReload(): ResearchState { const tab = activeTab(); if (tab) { tab.error = null; tab.view.webContents.reload() } return researchState() }

export function setResearchZoom(value: number): ResearchState {
  const tab = activeTab(); if (!tab) return researchState()
  tab.zoom = Math.max(0.5, Math.min(2, Math.round(value * 10) / 10))
  tab.view.webContents.setZoomFactor(tab.zoom); pushState(); return researchState()
}

export function setResearchUserAgentMode(mode: ResearchUserAgentMode, compact: boolean): ResearchState {
  const tab = activeTab()
  if (!tab) return researchState()
  const mobile = resolveResearchMobileMode(mode, compact)
  const changed = tab.mobileMode !== mobile
  tab.userAgentMode = mode
  tab.mobileMode = mobile
  tab.view.webContents.setUserAgent(mobile ? toMobileUserAgent(tab.desktopUserAgent) : tab.desktopUserAgent)
  if (changed && isHttpUrl(tab.view.webContents.getURL())) tab.view.webContents.reload()
  pushState()
  return researchState()
}

export async function selectedResearchText(): Promise<{ text: string; title: string; url: string } | null> {
  const tab = activeTab(); if (!tab) return null
  const text = await tab.view.webContents.executeJavaScript('window.getSelection()?.toString() || ""', true)
  if (typeof text !== 'string' || !text.trim()) return null
  return { text: text.trim().slice(0, 5000), title: tab.view.webContents.getTitle(), url: tab.view.webContents.getURL() }
}

export function disposeResearchView(): void {
  for (const tab of tabs) {
    try { host?.contentView.removeChildView(tab.view) } catch { /* host already gone */ }
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
  }
  tabs = []; activeTabId = null; host = null; visible = false
  bounds = { x: 0, y: 0, width: 0, height: 0 }
}
