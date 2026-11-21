// 阶段一 E2E：网页摘录 + 浏览器标签持久化。
//
// 用法（先跑一次 `npm run pack:offline`，脚本用打包后的 exe，避免 dev 模式干扰）：
//   node scripts/e2e/research.mjs
//
// 它做四件事：
//   1) 起一个本地 http 服务，页面里有一句可被选中的话；
//   2) 用独立 SHIYUN_DATA_DIR 启动应用，在右栏打开这个页面；
//   3) 选中第一段 → 调「保存摘录」→ 断言 SQLite 里真有这条摘录；
//   4) 退出再启动一次：标签页应该被恢复，摘录仍然在（这两条是阶段一的验收点）。
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 9333
const QUOTE = '优势比在罕见结局下近似相对危险度，这是一个可被摘录的句子。'

// 默认用 release/win-unpacked 的打包产物；如果那次打包输出到了别处，
// 用 SHIYUN_APP_EXE 指过去即可（例如 SHIYUN_APP_EXE=release-tmp\win-unpacked\诗云.exe）。
const exe = process.env.SHIYUN_APP_EXE ?? join(process.cwd(), 'release', 'win-unpacked', '诗云.exe')
const dataDir = mkdtempSync(join(tmpdir(), 'shiyun-e2e-'))
const failures = []

function check(name, condition, detail) {
  if (condition) { console.log(`  ok   ${name}`); return }
  failures.push(name)
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 轮询直到条件成立；网页加载与渲染都要时间，不能用一次性断言。 */
async function waitFor(probe, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await probe()
    if (last) return last
    await sleep(300)
  }
  return last
}

function startFixtureServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>摘录测试页</title></head>
<body style="font:16px/1.8 system-ui;padding:40px">
<h1 id="title">摘录测试页</h1>
<p id="para">${QUOTE}</p>
</body></html>`)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function targets() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      if (Array.isArray(list) && list.length) return list
    } catch { /* 还没起来 */ }
    await sleep(250)
  }
  throw new Error('CDP 没有在 15 秒内就绪')
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    let sequence = 0
    const pending = new Map()
    socket.onopen = () => resolve({
      evaluate: (expression) => new Promise((ok, fail) => {
        const id = ++sequence
        pending.set(id, { ok, fail })
        socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
      }),
      close: () => socket.close(),
    })
    socket.onerror = (event) => reject(new Error(`WebSocket 失败：${String(event)}`))
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      const entry = message.id ? pending.get(message.id) : null
      if (!entry) return
      pending.delete(message.id)
      if (message.error) entry.fail(new Error(JSON.stringify(message.error)))
      else if (message.result?.exceptionDetails) entry.fail(new Error(message.result.exceptionDetails.exception?.description ?? '页面脚本出错'))
      else entry.ok(message.result?.result?.value)
    }
  })
}

async function appPage(list) {
  const page = list.find((item) => item.type === 'page' && item.url.startsWith('file://'))
  if (!page) throw new Error('找不到应用主页面')
  return connect(page.webSocketDebuggerUrl)
}

async function researchTarget(list) {
  return list.find((item) => item.type === 'page' && item.url.includes('/fixture'))
}

async function launch() {
  // DSH 自己跑在 Electron 里，会给子进程带上 ELECTRON_RUN_AS_NODE=1；
  // 那会让诗云.exe 以纯 Node 运行（打印 node 版本后立刻退出），必须删掉。
  const env = { ...process.env, SHIYUN_DATA_DIR: dataDir }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(exe, [`--remote-debugging-port=${PORT}`], { env, stdio: 'ignore' })
  await targets()
  await sleep(1200)
  return child
}

async function main() {
  const server = await startFixtureServer()
  const fixture = `http://127.0.0.1:${server.address().port}/fixture`
  console.log(`fixture: ${fixture}`)
  console.log(`data dir: ${dataDir}`)

  // —— 第一次启动：进书房、打开网页、保存摘录 ——
  let child = await launch()
  let list = await targets()
  let app = await appPage(list)
  await app.evaluate("(() => { const button = document.querySelector('.workspace-entry-button'); button?.click(); return Boolean(button) })()")
  await sleep(900)
  const navigated = await app.evaluate(`window.shiyunDesktop.research.navigate(${JSON.stringify(fixture)})`)
  const loaded = await waitFor(async () => {
    const state = await app.evaluate('window.shiyunDesktop.research.getState()')
    return state?.tabs?.some((tab) => String(tab.url).includes('/fixture')) ? state : null
  })
  check('研究栏能导航到本地页面', Boolean(loaded), JSON.stringify(loaded?.url ?? navigated?.url ?? null))

  list = await targets()
  const page = await researchTarget(list)
  check('网页进程已加载 fixture 页', Boolean(page), list.map((item) => item.url).join(' | '))
  if (page) {
    const research = await connect(page.webSocketDebuggerUrl)
    await research.evaluate(`(() => { const para = document.getElementById('para'); const range = document.createRange(); range.selectNodeContents(para); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return selection.toString().slice(0, 20) })()`)
    research.close()
  }
  const captured = await app.evaluate('window.shiyunDesktop.clippings.captureSelection()')
  check('保存摘录拿到选区原文', captured?.quote?.includes('优势比'), JSON.stringify(captured?.quote ?? null))
  check('摘录记住了页面标题与地址', captured?.pageTitle === '摘录测试页' && String(captured?.url).includes('/fixture'))
  const afterCapture = await app.evaluate('window.shiyunDesktop.clippings.list()')
  check('摘录写进了书库', Array.isArray(afterCapture) && afterCapture.length === 1, `长度 ${afterCapture?.length}`)

  await app.evaluate('window.shiyunDesktop.research.getState()')
  await sleep(1600) // 等去抖的会话文件落盘
  app.close()
  child.kill()
  await sleep(2500)

  // —— 第二次启动：标签恢复、摘录仍在 ——
  child = await launch()
  list = await targets()
  app = await appPage(list)
  const restoredState = await waitFor(async () => {
    const state = await app.evaluate('window.shiyunDesktop.research.getState()')
    return state?.tabs?.some((tab) => String(tab.url).includes('/fixture')) ? state : null
  })
  check('重启后网页标签被恢复', Boolean(restoredState), JSON.stringify(restoredState?.tabs?.map((tab) => tab.url) ?? null))
  const clippings = await app.evaluate('window.shiyunDesktop.clippings.list()')
  check('重启后摘录仍然在', Array.isArray(clippings) && clippings.length === 1, `长度 ${clippings?.length}`)

  app.close()
  child.kill()
  await sleep(1500)
  server.close()
  rmSync(dataDir, { recursive: true, force: true })

  if (failures.length) {
    console.error(`\n${failures.length} 项失败：${failures.join('、')}`)
    process.exit(1)
  }
  console.log('\n全部通过')
}

await main()
