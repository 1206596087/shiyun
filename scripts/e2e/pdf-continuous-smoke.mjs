import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, relative } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dataDir = process.env.SHIYUN_DATA_DIR
const fixture = process.env.SHIYUN_PDF_FIXTURE
const port = Number(process.env.SHIYUN_CDP_PORT || 9338)
if (!dataDir?.includes('shiyun-desktop-validation') || !fixture) {
  throw new Error('Use an isolated shiyun-desktop-validation data directory and SHIYUN_PDF_FIXTURE')
}

const bookId = `book-${randomUUID()}`
const bookDir = join(dataDir, 'books', bookId)
const target = join(bookDir, 'source.pdf')
await mkdir(bookDir, { recursive: true })
await copyFile(fixture, target)
const bytes = await import('node:fs/promises').then(({ readFile }) => readFile(target))
const db = new DatabaseSync(join(dataDir, 'shiyun.db'))
const now = new Date().toISOString()
db.prepare(`INSERT INTO books
  (id, folder_id, title, author, format, file_path, file_hash, file_size, sort_order, created_at, updated_at)
  VALUES (?, NULL, ?, ?, 'pdf', ?, ?, ?, 0, ?, ?)`)
  .run(bookId, '连续阅读验证', '诗云自动验证', relative(dataDir, target).replaceAll('\\', '/'), createHash('sha256').update(bytes).digest('hex'), bytes.length, now, now)
db.close()

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const appTarget = targets.find((item) => item.url.startsWith('file:'))
if (!appTarget) throw new Error(`No application target on ${port}`)
const socket = new WebSocket(appTarget.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let counter = 0
const pending = new Map()
socket.onmessage = (event) => {
  const data = JSON.parse(event.data)
  const waiter = pending.get(data.id)
  if (!waiter) return
  pending.delete(data.id)
  if (data.error) waiter.reject(data.error)
  else waiter.resolve(data.result)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++counter
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
const waitFor = async (expression, timeout = 10000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out: ${expression}`)
}

try {
  await evaluate(`localStorage.removeItem('shiyun-pdf-continuous-experiment-v1')`)
  await evaluate(`location.search = '?space=workspace'`)
  await new Promise((resolve) => setTimeout(resolve, 500))
  await waitFor(`Boolean(document.querySelector('.workspace-space.is-active'))`)
  await evaluate(`window.dispatchEvent(new Event('shiyun-library-changed'))`)
  await new Promise((resolve) => setTimeout(resolve, 500))
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.ws-row--book')].find((item) => item.textContent.includes('连续阅读验证'));
    if (!row) return false;
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return true;
  })()`)
  await waitFor(`Boolean(document.querySelector('.book-reader__canvas'))`, 15000)
  const initial = await evaluate(`({
    toggle: [...document.querySelectorAll('button')].find((item) => item.textContent.includes('单页阅读'))?.textContent,
    canvases: document.querySelectorAll('.book-reader__canvas').length,
    shells: document.querySelectorAll('.book-reader__continuous-shell').length
  })`)
  if (initial.toggle !== '单页阅读' || initial.canvases !== 1 || initial.shells !== 0) {
    throw new Error(`Single-page default failed: ${JSON.stringify(initial)}`)
  }
  await evaluate(`[...document.querySelectorAll('button')].find((item) => item.textContent.includes('单页阅读'))?.click()`)
  await waitFor(`document.querySelectorAll('.book-reader__continuous-shell').length >= 4`)
  const firstWindow = await evaluate(`document.querySelectorAll('.book-reader__page--continuous').length`)
  if (firstWindow !== 2) throw new Error(`Expected two rendered boundary pages, got ${firstWindow}`)
  await evaluate(`document.querySelector('.book-reader__pages button:last-of-type')?.click()`)
  await waitFor(`document.querySelectorAll('.book-reader__page--continuous').length === 3`)
  await new Promise((resolve) => setTimeout(resolve, 800))
  const result = await evaluate(`({
    mode: document.querySelector('.book-reader__continuous-toggle')?.textContent,
    currentPage: document.querySelector('.book-reader__pages input')?.value,
    shells: document.querySelectorAll('.book-reader__continuous-shell').length,
    renderedPages: document.querySelectorAll('.book-reader__page--continuous').length,
    canvases: document.querySelectorAll('.book-reader__canvas').length,
    textLayers: document.querySelectorAll('.book-reader__text-layer').length,
    workspaceClass: document.querySelector('.workspace-space')?.className,
    galaxyClass: document.querySelector('.galaxy-space')?.className,
    scrollTop: document.querySelector('.book-reader__stage')?.scrollTop,
    visiblePage: (() => {
      const stageTop = document.querySelector('.book-reader__stage')?.getBoundingClientRect().top ?? 0;
      return [...document.querySelectorAll('.book-reader__continuous-shell')]
        .map((item) => ({ page: Number(item.dataset.page), distance: Math.abs(item.getBoundingClientRect().top - stageTop) }))
        .sort((a, b) => a.distance - b.distance)[0]?.page;
    })()
  })`)
  if (result.visiblePage !== 2) throw new Error(`Page navigation did not scroll to page 2: ${JSON.stringify(result)}`)
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(dataDir, 'pdf-continuous.png'), Buffer.from(screenshot.data, 'base64'))
  console.log(JSON.stringify(result, null, 2))
} finally {
  socket.close()
}
