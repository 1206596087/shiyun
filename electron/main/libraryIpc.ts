import { ipcMain } from 'electron'
import type { LibraryNodeKind } from '../../src/types/library.ts'
import {
  addFolder,
  importBooks,
  importPrototype,
  libraryMeta,
  libraryTree,
  moveLibraryNode,
  removeBook,
  removeFolder,
  renameLibraryNode,
  undeleteBook,
} from './libraryService.ts'

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

function asNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new TypeError(`参数 ${key} 必须是字符串或 null`)
  return value
}

function asKind(record: Record<string, unknown>): LibraryNodeKind {
  const value = record.kind
  if (value !== 'folder' && value !== 'book') throw new TypeError('参数 kind 必须是 folder 或 book')
  return value
}

/**
 * 书库的 IPC 入口。全部先校验调用来源（assertTrusted），再校验参数形状。
 * 渲染进程永远拿不到 DatabaseSync 对象，只能调用这些受限操作。
 */
export function registerLibraryIpc(assertTrusted: TrustCheck) {
  ipcMain.handle('library:listTree', (event) => {
    assertTrusted(event.senderFrame?.url ?? '')
    return libraryTree()
  })

  ipcMain.handle('library:createFolder', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    const record = asRecord(payload)
    return addFolder(asString(record, 'name'), asNullableString(record, 'parentId'))
  })

  ipcMain.handle('library:renameNode', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    const record = asRecord(payload)
    return renameLibraryNode(asKind(record), asString(record, 'id'), asString(record, 'name'))
  })

  ipcMain.handle('library:moveNode', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    const record = asRecord(payload)
    return moveLibraryNode(asKind(record), asString(record, 'id'), asNullableString(record, 'targetFolderId'))
  })

  ipcMain.handle('library:deleteFolder', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    return removeFolder(asString(asRecord(payload), 'id'))
  })

  ipcMain.handle('library:deleteBook', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    return removeBook(asString(asRecord(payload), 'id'))
  })

  ipcMain.handle('library:restoreBook', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    return undeleteBook(asString(asRecord(payload), 'id'))
  })

  ipcMain.handle('library:importBook', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    const record = payload === undefined ? {} : asRecord(payload)
    return importBooks(asNullableString(record, 'folderId'))
  })

  ipcMain.handle('library:importPrototype', (event, payload: unknown) => {
    assertTrusted(event.senderFrame?.url ?? '')
    return importPrototype(payload)
  })

  ipcMain.handle('library:getMeta', (event) => {
    assertTrusted(event.senderFrame?.url ?? '')
    return libraryMeta()
  })
}
