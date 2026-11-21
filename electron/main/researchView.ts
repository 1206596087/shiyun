import { BrowserWindow, WebContentsView, session, shell } from 'electron'

/**
 * 右栏研究用的真实网页视图（M6）。
 *
 * 为什么必须放在主进程：`WebContentsView` 不是 DOM 元素，渲染进程没法给它排队、
 * 也没法用 CSS 定位它。所以渲染进程只负责把一个矩形报上来，主进程把视图摆在那儿。
 *
 * 安全基线：
 * - 独立分区 `persist:research`，和书库页面不共享 Cookie 与 LocalStorage；
 * - 不注入 preload、`sandbox: true`、`nodeIntegration: false`；
 * - 所有权限请求默认拒绝，下载默认拒绝，`window.open` 一律转系统浏览器；
 * - 只允许 http/https 导航（`file:`、`shiyun-book:` 一律拒绝）。
 */

export interface ResearchBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ResearchState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  visible: boolean
  error: string | null
}

const PARTITION = 'persist:research'
const MIN_SIZE = 40

let view: WebContentsView | null = null
let host: BrowserWindow | null = null
let bounds: ResearchBounds = { x: 0, y: 0, width: 0, height: 0 }
let visible = false
let error: string | null = null
let attached = false

/** 研究栏网页收到的导航只认 http/https，其余交给系统浏览器或直接拒绝。 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function researchSession() {
  const target = session.fromPartition(PARTITION)
  if (!attached) {
    attached = true
    target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    target.setPermissionCheckHandler(() => false)
    target.on('will-download', (event) => {
      event.preventDefault()
    })
  }
  return target
}

function pushState(): void {
  if (!view || view.webContents.isDestroyed()) return
  const contents = view.webContents
  const state: ResearchState = {
    url: contents.getURL(),
    title: contents.getTitle(),
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    visible,
    error,
  }
  host?.webContents.send('research:state', state)
}

function syncBounds(): void {
  if (!view) return
  const hidden = !visible || bounds.width < MIN_SIZE || bounds.height < MIN_SIZE
  view.setBounds(hidden ? { x: 0, y: 0, width: 0, height: 0 } : {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  })
}

/** 取（必要时创建）研究栏视图；创建后立即挂到窗口上，默认尺寸为 0 所以不可见。 */
export function ensureResearchView(win: BrowserWindow): WebContentsView {
  if (view && host === win && !view.webContents.isDestroyed()) return view
  disposeResearchView()
  host = win
  view = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })
  researchSession()
  win.contentView.addChildView(view)
  syncBounds()

  const contents = view.webContents
  contents.on('did-start-loading', () => {
    error = null
    pushState()
  })
  contents.on('did-stop-loading', () => pushState())
  contents.on('did-navigate', () => pushState())
  contents.on('did-navigate-in-page', () => pushState())
  contents.on('page-title-updated', () => pushState())
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return // -3 是主动取消，不算错误
    error = `无法打开 ${url || '该网页'}（${description || code}）`
    pushState()
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (!isHttpUrl(url)) {
      event.preventDefault()
      if (isHttpUrl(url) === false) error = '只能打开 http/https 网页'
      pushState()
    }
  })
  contents.on('render-process-gone', () => {
    error = '网页进程已退出，点刷新可以重新加载'
    pushState()
  })
  return view
}

export function setResearchBounds(next: ResearchBounds): ResearchState {
  bounds = next
  syncBounds()
  pushState()
  return researchState()
}

export function setResearchVisible(next: boolean): ResearchState {
  visible = next
  syncBounds()
  pushState()
  return researchState()
}

export function navigateResearch(url: string): ResearchState {
  if (!view) return researchState()
  if (!isHttpUrl(url)) {
    error = '只能打开 http/https 网页'
    pushState()
    return researchState()
  }
  error = null
  void view.webContents.loadURL(url)
  return researchState()
}

export function researchBack(): ResearchState {
  const history = view?.webContents.navigationHistory
  if (history?.canGoBack()) history.goBack()
  return researchState()
}

export function researchForward(): ResearchState {
  const history = view?.webContents.navigationHistory
  if (history?.canGoForward()) history.goForward()
  return researchState()
}

export function researchReload(): ResearchState {
  error = null
  view?.webContents.reload()
  return researchState()
}

export function researchState(): ResearchState {
  if (!view || view.webContents.isDestroyed()) {
    return { url: '', title: '', loading: false, canGoBack: false, canGoForward: false, visible, error }
  }
  const contents = view.webContents
  return {
    url: contents.getURL(),
    title: contents.getTitle(),
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    visible,
    error,
  }
}

/** 窗口关闭或重建时清理，避免留下孤儿 webContents。 */
export function disposeResearchView(): void {
  if (view && !view.webContents.isDestroyed()) {
    try {
      host?.contentView.removeChildView(view)
    } catch {
      // 窗口已经销毁，忽略
    }
    view.webContents.close()
  }
  view = null
  host = null
  bounds = { x: 0, y: 0, width: 0, height: 0 }
  visible = false
  error = null
}
