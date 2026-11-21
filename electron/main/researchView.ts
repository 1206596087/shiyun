import { BrowserWindow, WebContentsView, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { readResearchSession, writeResearchSession } from './researchStore.ts'
import {
  isPersistableResearchUrl,
  MAX_RESEARCH_TABS,
  resolveResearchMobileMode,
  toMobileUserAgent,
  type ResearchSession,
  type ResearchState,
  type ResearchTabState,
  type ResearchUserAgentMode,
} from '../../src/types/research.ts'

export interface ResearchBounds { x: number; y: number; width: number; height: number }

const PARTITION = 'persist:research'
const MIN_SIZE = 40
const PERSIST_DEBOUNCE_MS = 500

/**
 * 一个标签。`view` 可以是 null——这是阶段一引入的「懒加载」：
 * 恢复出来的标签只保留 URL/标题，用户切到它时才真正创建 WebContentsView，
 * 这样「一次开了 10 个网页」不会在启动时同时占 10 份渲染进程。
 */
interface ResearchTab {
  id: string
  view: WebContentsView | null
  url: string
  title: string
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
let sessionFile: string | null = null
let persistTimer: NodeJS.Timeout | null = null
let restored = false

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

function titleFor(tab: ResearchTab): string {
  if (tab.title) return tab.title
  return tab.url && isHttpUrl(tab.url) ? new URL(tab.url).hostname : '新标签页'
}

function toState(tab: ResearchTab): ResearchTabState {
  if (!tab.view) {
    // 懒加载的标签没有 webContents，用记录的 URL/标题占位，别假装正在加载。
    return {
      id: tab.id, url: tab.url, title: titleFor(tab), loading: false,
      canGoBack: false, canGoForward: false, error: tab.error,
      zoom: tab.zoom, userAgentMode: tab.userAgentMode, mobileMode: tab.mobileMode,
    }
  }
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

/** 只导持久化该存的东西：URL、标题、顺序、当前标签、缩放、UA 模式。 */
function persistableSession(): ResearchSession {
  const persisted = tabs
    .filter((tab) => isPersistableResearchUrl(tab.view?.webContents.getURL() || tab.url))
    .map((tab) => ({
      id: tab.id,
      url: tab.view?.webContents.getURL() || tab.url,
      title: tab.view?.webContents.getTitle() || tab.title,
      zoom: tab.zoom,
      userAgentMode: tab.userAgentMode,
    }))
  const stillHasActive = activeTabId !== null && persisted.some((tab) => tab.id === activeTabId)
  return {
    version: 1,
    tabs: persisted,
    activeTabId: stillHasActive ? activeTabId : persisted[0]?.id ?? null,
  }
}

function flushSession(): void {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
  if (!sessionFile) return
  writeResearchSession(sessionFile, persistableSession())
}

function persistSoon(): void {
  if (!sessionFile) return
  if (persistTimer) clearTimeout(persistTimer)
  // 去抖：拖动、连续翻页时不要每个事件都写盘。
  persistTimer = setTimeout(() => { persistTimer = null; flushSession() }, PERSIST_DEBOUNCE_MS)
}

function pushState(): void { host?.webContents.send('research:state', researchState()); persistSoon() }

function syncBounds(): void {
  const hidden = !visible || bounds.width < MIN_SIZE || bounds.height < MIN_SIZE
  for (const tab of tabs) {
    if (!tab.view) continue
    const shown = !hidden && tab.id === activeTabId
    tab.view.setBounds(shown ? {
      x: Math.round(bounds.x), y: Math.round(bounds.y),
      width: Math.round(bounds.width), height: Math.round(bounds.height),
    } : { x: 0, y: 0, width: 0, height: 0 })
  }
}

function wireTab(tab: ResearchTab, view: WebContentsView): void {
  const contents = view.webContents
  contents.on('did-start-loading', () => { tab.error = null; pushState() })
  contents.on('did-stop-loading', pushState)
  contents.on('did-navigate', (_event, url) => { tab.url = url; pushState() })
  contents.on('did-navigate-in-page', (_event, url) => { tab.url = url; pushState() })
  contents.on('page-title-updated', (_event, title) => { tab.title = title; pushState() })
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

function blankTab(url = ''): ResearchTab {
  return {
    id: `research-${randomUUID()}`,
    view: null,
    url: isHttpUrl(url) ? url : '',
    title: '',
    error: null,
    zoom: 1,
    userAgentMode: 'auto',
    mobileMode: false,
    desktopUserAgent: '',
  }
}

/** 真正创建 webContents（幂等）：切到这个标签时才调用。 */
function ensureTabView(tab: ResearchTab): WebContentsView {
  if (tab.view) return tab.view
  if (!host) throw new Error('研究窗口尚未初始化')
  const view = new WebContentsView({ webPreferences: {
    partition: PARTITION, sandbox: true, contextIsolation: true,
    nodeIntegration: false, webSecurity: true, spellcheck: false,
  } })
  secureSession()
  host.contentView.addChildView(view)
  tab.view = view
  tab.desktopUserAgent = view.webContents.getUserAgent()
  const mobile = resolveResearchMobileMode(tab.userAgentMode, tab.mobileMode)
  tab.mobileMode = mobile
  if (mobile) view.webContents.setUserAgent(toMobileUserAgent(tab.desktopUserAgent))
  view.webContents.setZoomFactor(tab.zoom)
  wireTab(tab, view)
  if (tab.url) void view.webContents.loadURL(tab.url).catch(() => { /* did-fail-load 会回报 */ })
  return view
}

function makeTab(url?: string): ResearchTab {
  const tab = blankTab(url ?? '')
  tabs.push(tab); activeTabId = tab.id
  return tab
}

/** 从 research-session.json 恢复标签（懒加载，不立刻起渲染进程）。 */
function restoreSession(): number {
  if (restored || !sessionFile) return 0
  restored = true
  const loaded = readResearchSession(sessionFile)
  if (!loaded.session.tabs.length) return 0
  tabs = loaded.session.tabs.map((entry) => ({
    ...blankTab(entry.url),
    id: entry.id,
    title: entry.title,
    zoom: entry.zoom,
    userAgentMode: entry.userAgentMode,
  }))
  activeTabId = loaded.session.activeTabId ?? tabs[0]?.id ?? null
  return tabs.length
}

/** 由主进程在启动时告知会话文件位置（用户数据目录下的 research-session.json）。 */
export function configureResearchSession(file: string): void {
  sessionFile = file
}

/**
 * 启动时就把上次的标签读进内存（但不创建 WebContentsView）。
 * 先恢复、后渲染，界面上第一次打开研究栏就能看到这些标签，而不是空白页。
 */
export function restoreResearchSession(): number {
  return restoreSession()
}

export function ensureResearchView(win: BrowserWindow): WebContentsView {
  if (host !== win || win.isDestroyed()) { disposeResearchView(); host = win }
  restoreSession()
  if (tabs.length === 0) makeTab()
  if (tabs.length > MAX_RESEARCH_TABS) tabs = tabs.slice(0, MAX_RESEARCH_TABS)
  const tab = activeTab() ?? makeTab()
  return ensureTabView(tab)
}

export function createResearchTab(url?: string): ResearchState {
  if (!host) return researchState()
  if (tabs.length >= MAX_RESEARCH_TABS) {
    const current = activeTab(); if (current) current.error = `最多同时打开 ${MAX_RESEARCH_TABS} 个网页标签`
    pushState(); return researchState()
  }
  const tab = makeTab(url)
  const view = ensureTabView(tab)
  if (url && isHttpUrl(url)) void view.webContents.loadURL(url)
  syncBounds(); pushState(); return researchState()
}

export function activateResearchTab(tabId: string): ResearchState {
  if (tabs.some((tab) => tab.id === tabId)) activeTabId = tabId
  const tab = activeTab()
  if (tab && visible) ensureTabView(tab)
  syncBounds(); pushState(); return researchState()
}

export function closeResearchTab(tabId: string): ResearchState {
  const index = tabs.findIndex((tab) => tab.id === tabId)
  if (index < 0) return researchState()
  const [tab] = tabs.splice(index, 1)
  if (tab.view) {
    try { host?.contentView.removeChildView(tab.view) } catch { /* host already gone */ }
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
  }
  if (activeTabId === tabId) activeTabId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null
  if (tabs.length === 0 && host && !host.isDestroyed()) makeTab()
  syncBounds(); pushState(); return researchState()
}

export function setResearchBounds(next: ResearchBounds): ResearchState { bounds = next; syncBounds(); pushState(); return researchState() }

export function setResearchVisible(next: boolean): ResearchState {
  visible = next
  // 只有真正显示时才创建渲染进程：隐藏的标签继续睡。
  const tab = activeTab()
  if (next && tab) ensureTabView(tab)
  syncBounds(); pushState(); return researchState()
}

export function navigateResearch(url: string): ResearchState {
  const tab = activeTab(); if (!tab) return researchState()
  if (!isHttpUrl(url)) { tab.error = '只能打开 http/https 网页'; pushState(); return researchState() }
  tab.error = null
  tab.url = url
  const view = ensureTabView(tab)
  void view.webContents.loadURL(url)
  syncBounds(); pushState(); return researchState()
}

export function researchBack(): ResearchState {
  const tab = activeTab()
  if (tab?.view) { const h = tab.view.webContents.navigationHistory; if (h.canGoBack()) h.goBack() }
  return researchState()
}

export function researchForward(): ResearchState {
  const tab = activeTab()
  if (tab?.view) { const h = tab.view.webContents.navigationHistory; if (h.canGoForward()) h.goForward() }
  return researchState()
}

export function researchReload(): ResearchState {
  const tab = activeTab()
  if (tab) { tab.error = null; if (tab.view) tab.view.webContents.reload(); else ensureTabView(tab) }
  return researchState()
}

export function setResearchZoom(value: number): ResearchState {
  const tab = activeTab(); if (!tab) return researchState()
  tab.zoom = Math.max(0.5, Math.min(2, Math.round(value * 10) / 10))
  tab.view?.webContents.setZoomFactor(tab.zoom)
  pushState(); return researchState()
}

export function setResearchUserAgentMode(mode: ResearchUserAgentMode, compact: boolean): ResearchState {
  const tab = activeTab()
  if (!tab) return researchState()
  const mobile = resolveResearchMobileMode(mode, compact)
  const changed = tab.mobileMode !== mobile
  tab.userAgentMode = mode
  tab.mobileMode = mobile
  if (tab.view) {
    const desktop = tab.desktopUserAgent || tab.view.webContents.getUserAgent()
    tab.view.webContents.setUserAgent(mobile ? toMobileUserAgent(desktop) : desktop)
    if (changed && isHttpUrl(tab.view.webContents.getURL())) tab.view.webContents.reload()
  }
  pushState()
  return researchState()
}

export async function selectedResearchText(): Promise<{ text: string; title: string; url: string } | null> {
  const tab = activeTab(); if (!tab) return null
  const view = ensureTabView(tab)
  const text = await view.webContents.executeJavaScript('window.getSelection()?.toString() || ""', true)
  if (typeof text !== 'string' || !text.trim()) return null
  return { text: text.trim().slice(0, 5000), title: view.webContents.getTitle(), url: view.webContents.getURL() }
}

/** 退出前同步落盘：去抖定时器可能还没到点。 */
export function flushResearchSession(): void {
  flushSession()
}

export function disposeResearchView(): void {
  flushSession()
  for (const tab of tabs) {
    if (!tab.view) continue
    try { host?.contentView.removeChildView(tab.view) } catch { /* host already gone */ }
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
  }
  tabs = []; activeTabId = null; host = null; visible = false
  bounds = { x: 0, y: 0, width: 0, height: 0 }
  restored = false
}
