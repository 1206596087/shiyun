import { registerMaintenanceIpc } from './maintenanceIpc.ts'
import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron'
import { fileResponse } from './fileResponse.ts'
import { join } from 'node:path'
import { registerAnnotationIpc } from './annotationIpc.ts'
import { registerGraphIpc } from './graphIpc.ts'
import { registerLibraryIpc } from './libraryIpc.ts'
import { disposeResearchView } from './researchView.ts'
import { registerResearchIpc } from './researchIpc.ts'
import { closeLibrary, initLibrary, resolveBookFile } from './libraryService.ts'
import { installCrashHandlers, logLine, watchWindow } from './logging.ts'

let mainWindow: BrowserWindow | null = null

/**
 * 数据目录固定为 `%APPDATA%\shiyun`，不跟随 productName（打包后 app.getName() 会变成「诗云」）。
 * 理由：开发模式、安装版、以后的自动更新必须读写同一个书库；用户的书不能因为换了一个
 * 启动方式就"消失"。升级安装也不动这个目录，卸载时同样不删（见 AGENTS §8）。
 */
app.setPath('userData', process.env.SHIYUN_DATA_DIR || join(app.getPath('appData'), 'shiyun'))

/**
 * 书籍文件通过自定义协议交给渲染进程，而不是让渲染层拿到绝对路径：
 * 渲染层只知道 `shiyun-book://book/<id>`，越权路径一律 404。
 */
const BOOK_SCHEME = 'shiyun-book'

protocol.registerSchemesAsPrivileged([
  {
    scheme: BOOK_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
])

// 只在生产（file://）加载时注入 CSP。开发模式注入会挡住 Vite 的内联 HMR 客户端。
function installContentSecurityPolicy() {
  if (process.env.ELECTRON_RENDERER_URL) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          // `shiyun-book:` 是本地书籍协议（PDF.js 取文件、EPUB.js 取资源都要用到）；
          // `blob:`/`data:` 给 EPUB 的 iframe 与图片。界面字体只用系统字体，不再放行 Google Fonts。
          "default-src 'self'; script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "font-src 'self' data: blob: shiyun-book:; " +
            "img-src 'self' data: blob: shiyun-book:; connect-src 'self' blob: data: shiyun-book:; " +
            "frame-src 'self' blob: data: shiyun-book:; child-src 'self' blob: data: shiyun-book:; " +
            // EPUB.js 会在没有脚本权限的 srcdoc iframe 里写 <base>（源文件所在目录），
            // 因此 base-uri 必须放行 file:；iframe 已禁用脚本，放开基址不影响脚本执行面。
            "worker-src 'self' blob:; object-src 'none'; base-uri 'self' file: blob:; frame-ancestors 'none'",
        ],
      },
    })
  })
}

/** 书籍文件服务：支持 Range（PDF.js 会按需取片段），并按扩展名给 MIME。 */
function registerBookProtocol() {
  protocol.handle(BOOK_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'book' || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    // 形如 shiyun-book://book/<id>/source.<ext>：第一段是书籍 ID，其余段只允许指向该书的源文件。
    const segments = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
    const bookId = segments[0] ?? ''
    const resolved = bookId ? resolveBookFile(bookId) : null
    if (!resolved) return new Response('Book not found', { status: 404 })

    const requested = segments.slice(1).join('/')
    const fileName = `source.${resolved.format}`
    if (requested && requested !== fileName) {
      // EPUB 的容器内资源由 EPUB.js 在内存里解包，不会走这个协议；其余路径一律拒绝，避免目录穿越。
      return new Response('Not found', { status: 404 })
    }

    return fileResponse(resolved.filePath, request, resolved.format === 'pdf' ? 'application/pdf' : 'application/epub+zip')
  })
}

function isTrustedSender(url: string) {
  const developmentUrl = process.env.ELECTRON_RENDERER_URL
  if (developmentUrl) return url.startsWith(developmentUrl)
  return url.startsWith('file://')
}

function assertTrustedSender(url: string) {
  if (!isTrustedSender(url)) throw new Error('Rejected IPC call from an untrusted renderer')
}

function registerIpc() {
  registerMaintenanceIpc(assertTrustedSender)
  registerLibraryIpc(assertTrustedSender)
  registerAnnotationIpc(assertTrustedSender)
  registerGraphIpc(assertTrustedSender)
  registerResearchIpc((url) => {
    assertTrustedSender(url ?? '')
    return true
  }, () => mainWindow)

  ipcMain.handle('app:get-runtime-info', (event) => {
    assertTrustedSender(event.senderFrame?.url ?? '')
    return { platform: process.platform, version: app.getVersion(), electron: process.versions.electron }
  })

  ipcMain.handle('shell:open-external', async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url ?? '')
    if (typeof value !== 'string') throw new TypeError('Expected a URL string')
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs may be opened externally')
    await shell.openExternal(url.toString())
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: '诗云 SHIYUN',
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#01020a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  watchWindow(mainWindow)
  mainWindow.on('closed', () => {
    disposeResearchView()
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedSender(url)) event.preventDefault()
  })

  const developmentUrl = process.env.ELECTRON_RENDERER_URL
  if (developmentUrl) void mainWindow.loadURL(developmentUrl)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  installCrashHandlers()
  logLine('[startup]', `electron ${process.versions.electron} node ${process.versions.node} userData ${app.getPath('userData')}`)
  // 书库打不开就不要开窗口：半迁移的库上继续写，比拒绝启动危险得多。
  try {
    initLibrary()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('书库无法打开', `${message}\n\n可以从 %APPDATA%\\shiyun\\backups 手动恢复一份备份后再启动。`)
    app.exit(1)
    return
  }

  registerIpc()
  installContentSecurityPolicy()
  registerBookProtocol()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  closeLibrary()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
