import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const executable = resolve('release/win-unpacked/诗云.exe')
if (!existsSync(executable)) throw new Error(`Packaged executable not found: ${executable}`)
const dataDir = await mkdtemp(join(tmpdir(), 'shiyun-note-validation-'))
const cdpPort = 9341
const desktop = spawn(executable, [`--remote-debugging-port=${cdpPort}`], {
  cwd: dirname(executable),
  env: { ...process.env, SHIYUN_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let stderr = ''
desktop.stderr.on('data', (chunk) => { stderr += chunk.toString() })

const waitFor = async (predicate, label, attempts = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await predicate()
    if (value) return value
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 120))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

let socket
try {
  const targets = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json`)
      return response.ok ? response.json() : null
    } catch { return null }
  }, `Electron CDP. ${stderr}`)
  const target = targets.find((item) => item.type === 'page' && item.url.startsWith('file:'))
  if (!target) throw new Error('Packaged renderer target was not found')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolvePromise, rejectPromise) => { socket.onopen = resolvePromise; socket.onerror = rejectPromise })
  let counter = 0
  const pending = new Map()
  const runtimeEvents = []
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown' || message.method === 'Runtime.consoleAPICalled') runtimeEvents.push(message)
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)))
    else waiter.resolve(message.result)
  }
  const send = (method, params = {}) => new Promise((resolvePromise, rejectPromise) => {
    const id = ++counter
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await send('Runtime.enable')

  const body = JSON.stringify({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: '公式验证：' }, { type: 'formulaInline', attrs: { latex: 'E=mc^2', formulaKind: 'math' } }] },
    { type: 'formulaBlock', attrs: { latex: '\\ce{2H2 + O2 -> 2H2O}', formulaKind: 'chemistry' } },
  ] })
  const note = await evaluate(`window.shiyunDesktop.annotations.createNote(${JSON.stringify({ title: '公式与符号验证', body })})`)
  if (!note.bodyText.includes('E=mc^2') || !note.bodyText.includes('2H2O')) throw new Error(`Formula LaTeX missing from search text: ${note.bodyText}`)

  await evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('进入书房')))?.click()`)
  await waitFor(() => evaluate(`Boolean([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('我的笔记')))`), 'workspace sidebar')
  await evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('我的笔记')))?.click()`)
  await waitFor(() => evaluate(`Boolean([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('公式与符号验证')))`), 'created note list item')
  await evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('公式与符号验证')))?.click()`)
  await waitFor(() => evaluate(`document.querySelectorAll('.note-formula').length === 2`), 'rendered formula nodes')
  await waitFor(() => evaluate(`document.querySelectorAll('.note-formula .katex').length === 2`), 'KaTeX output')

  await evaluate(`document.querySelector('.note-formula__edit')?.click()`)
  await waitFor(() => evaluate(`Boolean(document.querySelector('.formula-dialog'))`), 'formula dialog')
  const formulaTrace = []
  for (let attempt = 0; attempt < 15; attempt += 1) {
    formulaTrace.push(await evaluate(`({dialog:Boolean(document.querySelector('.formula-dialog')),field:Boolean(document.querySelector('.formula-dialog math-field')),text:document.querySelector('.formula-dialog__field')?.textContent,note:Boolean(document.querySelector('.note-page')),formulaCount:document.querySelectorAll('.note-formula').length})`))
    if (formulaTrace.at(-1).field) break
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }
  const mathLiveReady = await evaluate(`Boolean(document.querySelector('.formula-dialog math-field'))`)
  if (!mathLiveReady) throw new Error(`MathLive editor did not mount: ${JSON.stringify({ formulaTrace, runtimeEvents })}`)
  await evaluate(`document.querySelector('.formula-dialog header > button')?.click()`)
  await evaluate(`([...document.querySelectorAll('.note-format button')].find((button) => button.title?.includes('Emoji')))?.click()`)
  await waitFor(() => evaluate(`Boolean(document.querySelector('.emoji-dialog em-emoji-picker'))`), 'dynamically loaded Emoji Mart picker')

  console.log(JSON.stringify({ executable, dataDir, formulaNodes: 2, katexRendered: true, mathLiveLoadedOnEdit: true, emojiPickerLoadedOnDemand: true, bodyText: note.bodyText }, null, 2))
} finally {
  socket?.close()
  desktop.kill()
}
