import { ipcMain } from 'electron'
import type { CreateClippingInput, UpdateClippingInput, WebClipping } from '../../src/types/clipping.ts'
import {
  clippingToNote,
  countClippings,
  createClipping,
  deleteClipping,
  getClipping,
  listClippings,
  listDeletedClippings,
  restoreClipping,
  updateClipping,
} from './db/clippings.ts'
import { requireLibrary } from './libraryService.ts'
import { selectedResearchText } from './researchView.ts'

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

function asOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new TypeError(`参数 ${key} 必须是字符串`)
  return value
}

function asCreateInput(value: unknown): CreateClippingInput {
  const record = asRecord(value)
  return {
    quote: asString(record, 'quote'),
    url: asString(record, 'url'),
    pageTitle: asOptionalString(record, 'pageTitle'),
    prefix: asOptionalString(record, 'prefix'),
    suffix: asOptionalString(record, 'suffix'),
    userNote: asOptionalString(record, 'userNote'),
  }
}

export interface ClippingIpcOptions {
  /** 测试与浏览器模式里换成假实现；正式运行时用 researchView 的真选区。 */
  readSelection?: () => Promise<{ text: string; title: string; url: string } | null>
}

export function registerClippingIpc(assertTrusted: TrustCheck, options: ClippingIpcOptions = {}): void {
  const readSelection = options.readSelection ?? selectedResearchText

  ipcMain.handle('clipping:list', (event): WebClipping[] => {
    assertTrusted(event.senderFrame?.url ?? '')
    return listClippings(requireLibrary().db)
  })

  ipcMain.handle('clipping:get', (event, payload: unknown): WebClipping | null => {
    assertTrusted(event.senderFrame?.url ?? '')
    const record = asRecord(payload)
    return getClipping(requireLibrary().db, asString(record, 'clippingId')) ?? null
  })

  ipcMain.handle('clipping:count', (event): number => {
    assertTrusted(event.senderFrame?.url ?? '')
    return countClippings(requireLibrary().db)
  })

  ipcMain.handle('clipping:create', (event, payload: unknown): WebClipping => {
    assertTrusted(event.senderFrame?.url ?? '')
    return createClipping(requireLibrary().db, asCreateInput(payload))
  })

  ipcMain.handle('clipping:update', (event, payload: unknown): WebClipping => {
    assertTrusted(event.senderFrame?.url ?? '')
    const record = asRecord(payload)
    const input: UpdateClippingInput = { userNote: asOptionalString(record, 'userNote') }
    return updateClipping(requireLibrary().db, asString(record, 'clippingId'), input)
  })

  ipcMain.handle('clipping:delete', (event, payload: unknown): boolean => {
    assertTrusted(event.senderFrame?.url ?? '')
    deleteClipping(requireLibrary().db, asString(asRecord(payload), 'clippingId'))
    return true
  })

  ipcMain.handle('clipping:restore', (event, payload: unknown): boolean => {
    assertTrusted(event.senderFrame?.url ?? '')
    restoreClipping(requireLibrary().db, asString(asRecord(payload), 'clippingId'))
    return true
  })

  ipcMain.handle('clipping:trash', (event): WebClipping[] => {
    assertTrusted(event.senderFrame?.url ?? '')
    return listDeletedClippings(requireLibrary().db)
  })

  ipcMain.handle('clipping:toNote', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    return clippingToNote(requireLibrary().db, asString(asRecord(payload), 'clippingId'))
  })

  /**
   * 「保存网页摘录」：选区只在主进程里读（网页视图没有 preload），
   * 渲染进程只能提出请求，拿不到也不该拿到整页内容。
   */
  ipcMain.handle('clipping:captureSelection', async (event, payload: unknown): Promise<WebClipping | null> => {
    assertTrusted(event.senderFrame?.url ?? '')
    const selected = await readSelection()
    if (!selected) return null
    const record = payload === undefined || payload === null ? {} : asRecord(payload)
    return createClipping(requireLibrary().db, {
      quote: selected.text,
      url: selected.url,
      pageTitle: selected.title,
      userNote: asOptionalString(record, 'userNote'),
    })
  })
}
