import { ipcMain } from 'electron'
import { knowledgeGraph, pinGraphNode, unpinGraphNode } from './libraryService.ts'

type TrustCheck = (url: string) => void

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new TypeError('参数必须是对象')
  return value as Record<string, unknown>
}

function asString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`参数 ${key} 必须是非空字符串`)
  return value
}

function asNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`参数 ${key} 必须是有限数字`)
  return value
}

/**
 * 银河图的 IPC 入口。
 *
 * 只允许「读整张图」和「固定/取消固定某颗星」两类操作：
 * 节点与连线永远由书库投影出来，渲染进程不能直接往银河里塞知识。
 */
export function registerGraphIpc(assertTrusted: TrustCheck) {
  ipcMain.handle('graph:load', (event) => {
    assertTrusted(event.senderFrame?.url ?? '')
    return knowledgeGraph()
  })

  ipcMain.handle('graph:pin', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    const record = asRecord(payload)
    return pinGraphNode(asString(record, 'nodeId'), {
      x: asNumber(record, 'x'),
      y: asNumber(record, 'y'),
      z: asNumber(record, 'z'),
    })
  })

  ipcMain.handle('graph:unpin', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    unpinGraphNode(asString(asRecord(payload), 'nodeId'))
    return true
  })
}
