import { app, dialog } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

let logFile: string | null = null

function ensureLogFile(): string {
  if (logFile) return logFile
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  logFile = join(dir, `main-${stamp}.log`)
  return logFile
}

/** 追加一行到 %APPDATA%\shiyun\logs\main-YYYY-MM-DD.log，写盘失败也不影响主流程。 */
export function logLine(scope: string, message: string): void {
  try {
    appendFileSync(ensureLogFile(), `[${new Date().toISOString()}] ${scope} ${message}\n`, 'utf8')
  } catch {
    // 日志写不进去就算了，绝不让它把应用带崩
  }
}

/**
 * 兜住主进程的未捕获异常：先落日志，再弹一个能看清原因的错误框，最后退出。
 * 静默崩溃是最难查的 bug，宁可让用户看到一句话。
 */
export function installCrashHandlers(): void {
  process.on('uncaughtException', (error) => {
    const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
    logLine('[uncaughtException]', detail)
    try {
      dialog.showErrorBox('诗云遇到了一个未处理的错误', `${error instanceof Error ? error.message : String(error)}\n\n日志已写入：${ensureLogFile()}`)
    } catch {
      // 应用已处于可疑状态，弹窗失败就不要继续抛
    }
    app.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    logLine('[unhandledRejection]', reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason))
  })
}

/** 渲染进程的崩溃与未响应：记录 + 尽量恢复，不直接退出。 */
export function watchWindow(win: Electron.BrowserWindow): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    logLine('[render-process-gone]', `${details.reason} exitCode=${details.exitCode}`)
  })
  win.webContents.on('unresponsive', () => {
    logLine('[unresponsive]', 'renderer stopped responding')
  })
}
