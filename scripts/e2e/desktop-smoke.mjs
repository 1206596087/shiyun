import { writeFile } from 'node:fs/promises'
const port = Number(process.env.SHIYUN_CDP_PORT || 9337)
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const target = targets.find(item => item.url.startsWith('file:'))
if (!target) throw new Error('Start Electron with an isolated SHIYUN_DATA_DIR and --remote-debugging-port=9337')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let counter = 0
const pending = new Map()
socket.onmessage = event => {
  const data = JSON.parse(event.data)
  const waiter = pending.get(data.id)
  if (!waiter) return
  pending.delete(data.id)
  if (data.error) waiter.reject(data.error)
  else waiter.resolve(data.result)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++counter; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
try {
  const status = await evaluate('window.shiyunDesktop.maintenance.status()')
  if (!status.dataDir.includes('shiyun-desktop-validation')) throw new Error('Refusing to mutate a non-test library')
  const result = await evaluate(`(async () => {
    const api = window.shiyunDesktop;
    const note = await api.annotations.createNote({title:'桌面验证',bodyText:'极大似然估计 logistic regression'});
    const hits = await api.annotations.searchNotes('极大似然');
    if (!hits.some(item=>item.id===note.id)) throw Error('Chinese FTS failed');
    await api.annotations.deleteNote(note.id);
    const trash = await api.maintenance.trash();
    if (!trash.some(item=>item.id===note.id)) throw Error('Trash missing note');
    await api.maintenance.restore('note',note.id);
    const restored = await api.annotations.getNote(note.id);
    if (restored.bodyText!==note.bodyText) throw Error('Recovery changed text');
    return {status:await api.maintenance.status(), restored:true, chineseSearch:true};
  })()`)
  await evaluate(`document.querySelector('.ws-return') ? [...document.querySelectorAll('button')].find(b=>b.textContent.includes('进入书房'))?.click() : null`)
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='设置与回收站')?.click()`)
  await new Promise(resolve => setTimeout(resolve, 1000))
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile('/tmp/shiyun-settings.png', Buffer.from(screenshot.data, 'base64'))
  console.log(JSON.stringify(result, null, 2))
} finally { socket.close() }
