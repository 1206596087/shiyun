import { ipcMain, type BrowserWindow } from 'electron'
import {
  ensureResearchView,
  navigateResearch,
  researchBack,
  researchForward,
  researchReload,
  researchState,
  setResearchBounds,
  setResearchVisible,
  type ResearchBounds,
} from './researchView.ts'

type AssertTrusted = (url: string | undefined) => boolean

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 渲染进程报上来的矩形一律夹到窗口内容区，避免把网页画到标题栏外面去。 */
function parseBounds(value: unknown, win: BrowserWindow): ResearchBounds | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const x = asNumber(record.x)
  const y = asNumber(record.y)
  const width = asNumber(record.width)
  const height = asNumber(record.height)
  if (x === null || y === null || width === null || height === null) return null
  const [contentWidth, contentHeight] = win.getContentSize()
  const left = Math.max(0, Math.min(x, contentWidth))
  const top = Math.max(0, Math.min(y, contentHeight))
  return {
    x: left,
    y: top,
    width: Math.max(0, Math.min(width, contentWidth - left)),
    height: Math.max(0, Math.min(height, contentHeight - top)),
  }
}

/**
 * 研究栏的 IPC。只有「摆哪儿、显示与否、去哪个网址、前进后退刷新」这几件事，
 * 渲染进程拿不到 webContents，也不能给视图塞任意脚本（没有 preload、没有 executeJavaScript 通道）。
 */
export function registerResearchIpc(assertTrusted: AssertTrusted, getWindow: () => BrowserWindow | null): void {
  const withWindow = <T>(handler: (win: BrowserWindow) => T, fallback: T): T => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return fallback
    return handler(win)
  }

  ipcMain.handle('research:ensure', (event) => {
    if (!assertTrusted(event.senderFrame?.url)) return null
    return withWindow((win) => {
      ensureResearchView(win)
      return researchState()
    }, null)
  })

  ipcMain.handle('research:setBounds', (event, payload: unknown) => {
    if (!assertTrusted(event.senderFrame?.url)) return null
    return withWindow((win) => {
      const bounds = parseBounds(payload, win)
      if (!bounds) return researchState()
      ensureResearchView(win)
      return setResearchBounds(bounds)
    }, null)
  })

  ipcMain.handle('research:setVisible', (event, payload: unknown) => {
    if (!assertTrusted(event.senderFrame?.url)) return null
    const next = payload === true
    return withWindow((win) => {
      ensureResearchView(win)
      return setResearchVisible(next)
    }, null)
  })

  ipcMain.handle('research:navigate', (event, payload: unknown) => {
    if (!assertTrusted(event.senderFrame?.url)) return null
    if (typeof payload !== 'string' || payload.length === 0) return researchState()
    return withWindow((win) => {
      ensureResearchView(win)
      return navigateResearch(payload)
    }, null)
  })

  ipcMain.handle('research:back', (event) => {
    if (!assertTrusted(event.senderFrame?.url)) return null
    return withWindow((win) => {
      ensureResearchView(win)
      return researchBack()
    }, null)
  })

  ipcMain.handle('research:forward', (event) => {
    if (!assertTrusted(event.senderFrame?.url)) return null
    return withWindow((win) => {
      ensureResearchView(win)
      return researchForward()
    }, null)
  })

  ipcMain.handle('research:reload', (event) => {
    if (!assertTrusted(event.senderFrame?.url)) return null
    return withWindow((win) => {
      ensureResearchView(win)
      return researchReload()
    }, null)
  })

  ipcMain.handle('research:state', (event) => {
    if (!assertTrusted(event.senderFrame?.url)) return null
    return withWindow((win) => {
      ensureResearchView(win)
      return researchState()
    }, null)
  })
}
