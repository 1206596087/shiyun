import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const executable = resolve('release/win-unpacked/诗云.exe')
if (!existsSync(executable)) throw new Error(`Packaged executable not found: ${executable}`)

const requests = []
const server = createServer((request, response) => {
  if (request.url?.startsWith('/ua')) {
    requests.push({ url: request.url, userAgent: request.headers['user-agent'] ?? '' })
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  response.end('<!doctype html><meta name="viewport" content="width=device-width"><title>诗云 UA 验证</title><p>research view</p>')
})
await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
const serverAddress = server.address()
if (!serverAddress || typeof serverAddress === 'string') throw new Error('Failed to start UA fixture server')

const dataDir = await mkdtemp(join(tmpdir(), 'shiyun-research-validation-'))
const cdpPort = 9340
const desktop = spawn(executable, [`--remote-debugging-port=${cdpPort}`], {
  cwd: dirname(executable),
  env: { ...process.env, SHIYUN_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let stderr = ''
desktop.stderr.on('data', (chunk) => { stderr += chunk.toString() })

const waitFor = async (predicate, label, attempts = 80) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await predicate()
    if (value) return value
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150))
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
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
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

  await evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('进入书房')))?.click()`)
  await waitFor(() => evaluate(`Boolean(document.querySelector('.research-layout-tools'))`), 'workspace research controls')

  await evaluate(`(async () => {
    const api = window.shiyunDesktop.research;
    await api.ensure();
    await api.setBounds({x:40,y:120,width:360,height:520});
    await api.setVisible(true);
    await api.setUserAgentMode('auto', true);
    await api.navigate('http://127.0.0.1:${serverAddress.port}/ua?phase=compact');
  })()`)
  await waitFor(() => requests.find((item) => item.url.includes('phase=compact')), 'compact mobile request')
  const compact = requests.findLast((item) => item.url.includes('phase=compact'))
  if (!/Mobile|Android/i.test(compact.userAgent)) throw new Error(`Compact mode did not use a mobile UA: ${compact.userAgent}`)

  await evaluate(`([...document.querySelectorAll('.research-layout-tools button')].find((button) => button.textContent?.trim() === '扩展'))?.click()`)
  await waitFor(() => requests.filter((item) => item.url.includes('phase=compact')).some((item) => !/Mobile|Android/i.test(item.userAgent)), 'expanded desktop reload')

  await waitFor(() => evaluate(`Boolean([...document.querySelectorAll('.research-layout-tools button')].find((button) => button.textContent?.includes('自动·桌面')))`), 'auto desktop state')
  await evaluate(`([...document.querySelectorAll('.research-layout-tools button')].find((button) => button.textContent?.includes('自动·桌面')))?.click()`)
  await waitFor(() => requests.filter((item) => item.url.includes('phase=compact')).length >= 3, 'manual mobile reload')
  const manualMobile = requests.filter((item) => item.url.includes('phase=compact')).at(-1)
  if (!/Mobile|Android/i.test(manualMobile.userAgent)) throw new Error(`Manual mobile mode was not preserved: ${manualMobile.userAgent}`)

  const state = await evaluate(`window.shiyunDesktop.research.getState()`)
  const active = state.tabs.find((tab) => tab.id === state.activeTabId)
  if (active.userAgentMode !== 'mobile' || active.mobileMode !== true) throw new Error(`Unexpected active tab state: ${JSON.stringify(active)}`)
  console.log(JSON.stringify({ executable, dataDir, compactUserAgent: compact.userAgent, manualMobileUserAgent: manualMobile.userAgent, state: { userAgentMode: active.userAgentMode, mobileMode: active.mobileMode } }, null, 2))
} finally {
  socket?.close()
  desktop.kill()
  server.close()
}
