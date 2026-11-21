import { useEffect, useState } from 'react'
import type { MaintenanceStatus, TrashItem } from '../../types/maintenance'

export function MaintenancePanel({ onClose }: { onClose: () => void }) {
  const api = window.shiyunDesktop?.maintenance
  const [status, setStatus] = useState<MaintenanceStatus | null>(null)
  const [trash, setTrash] = useState<TrashItem[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    if (!api) return
    const [next, items] = await Promise.all([api.status(), api.trash()])
    setStatus(next)
    setTrash(items)
  }
  useEffect(() => {
    if (!api) return
    let cancelled = false
    Promise.all([api.status(), api.trash()]).then(([next, items]) => {
      if (!cancelled) { setStatus(next); setTrash(items) }
    }, (error: unknown) => { if (!cancelled) setMessage(String(error)) })
    return () => { cancelled = true }
  }, [api])
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setMessage('')
    try { await action(); await refresh(); window.dispatchEvent(new Event('shiyun-library-changed'));  setMessage('操作完成；书库列表可点击刷新更新。') }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return (
    <section className="ws-maintenance" role="dialog" aria-label="设置与回收站" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
      <header><h2>设置与回收站</h2><button onClick={onClose}>关闭</button></header>
      {!api && <p>浏览器演示模式无法访问本地书库。请使用桌面应用。</p>}
      {status && api && <>
        <p>数据目录：{status.dataDir}</p><p>日志目录：{status.logDir}</p>
        <p>数据库版本：{status.schemaVersion} · 最近备份：{status.lastBackupAt ? new Date(status.lastBackupAt).toLocaleString() : '暂无'}</p>
        <p>启动时检查自动备份，间隔 24 小时，保留最近 14 份数据库快照。</p>
        <button disabled={busy} onClick={() => void run(() => api.openDirectory('data'))}>打开数据目录</button>
        <button disabled={busy} onClick={() => void run(() => api.openDirectory('logs'))}>打开日志目录</button>
        <button disabled={busy} onClick={() => void run(() => api.backup())}>备份数据库</button>
        <button disabled={busy} onClick={() => void run(() => api.exportBundle())}>导出完整知识库</button>
        <button disabled title="0.7.0 接入">导入知识库（0.7.0 接入）</button>
        <h3>回收站</h3>
        {!trash.length && <p>回收站为空。</p>}
        <ul>{trash.map((item) => <li key={`${item.kind}:${item.id}`}>
          {item.kind === 'book' ? '书籍' : '笔记'} · {item.title || '未命名笔记'}
          <button disabled={busy} onClick={() => void run(() => api.restore(item.kind, item.id))}>恢复</button>
        </li>)}</ul>
      </>}
      <p role="status">{message}</p>
    </section>
  )
}
