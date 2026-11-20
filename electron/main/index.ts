import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'

let mainWindow: BrowserWindow | null = null

function isTrustedSender(url: string) {
  const developmentUrl = process.env.ELECTRON_RENDERER_URL
  if (developmentUrl) return url.startsWith(developmentUrl)
  return url.startsWith('file://')
}

function assertTrustedSender(url: string) {
  if (!isTrustedSender(url)) throw new Error('Rejected IPC call from an untrusted renderer')
}

function registerIpc() {
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
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })
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
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
