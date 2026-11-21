import { contextBridge, ipcRenderer } from 'electron'
import type { ImportReport, LibraryNodeKind, LibraryTree } from '../../src/types/library.ts'
import type { BookSource, ReadingState, SaveReadingStatePayload } from '../../src/types/reader.ts'

export interface LibraryMeta {
  dataDir: string
  dbFile: string
  backups: number
  lastBackupAt: string | null
  prototypeImportedAt: string | null
}

export interface PrototypeImportResult {
  books: number
  notes: number
  highlights: number
  links: number
  tree: LibraryTree
}

/** 渲染进程唯一能碰到的"数据库"：全部是 IPC 调用，没有连接对象、没有 SQL。 */
export interface ShiyunLibraryApi {
  listTree: () => Promise<LibraryTree>
  createFolder: (name: string, parentId: string | null) => Promise<LibraryTree>
  renameNode: (kind: LibraryNodeKind, id: string, name: string) => Promise<LibraryTree>
  moveNode: (kind: LibraryNodeKind, id: string, targetFolderId: string | null) => Promise<LibraryTree>
  deleteFolder: (id: string) => Promise<LibraryTree>
  deleteBook: (id: string) => Promise<LibraryTree>
  restoreBook: (id: string) => Promise<LibraryTree>
  importBook: (folderId: string | null) => Promise<ImportReport | null>
  importPrototype: (graph: unknown) => Promise<PrototypeImportResult>
  getMeta: () => Promise<LibraryMeta>
  /** 阅读器：拿到自定义协议地址与上次进度；没有可读源文件时 url 为空字符串。 */
  bookSource: (bookId: string) => Promise<BookSource | null>
  getReadingState: (bookId: string) => Promise<ReadingState>
  saveReadingState: (bookId: string, patch: SaveReadingStatePayload) => Promise<ReadingState>
  setPageCount: (bookId: string, pageCount: number) => Promise<ReadingState>
}

export interface ShiyunDesktopApi {
  getRuntimeInfo: () => Promise<{ platform: string; version: string; electron: string }>
  openExternal: (url: string) => Promise<void>
  library: ShiyunLibraryApi
}

const library: ShiyunLibraryApi = {
  listTree: () => ipcRenderer.invoke('library:listTree'),
  createFolder: (name, parentId) => ipcRenderer.invoke('library:createFolder', { name, parentId }),
  renameNode: (kind, id, name) => ipcRenderer.invoke('library:renameNode', { kind, id, name }),
  moveNode: (kind, id, targetFolderId) => ipcRenderer.invoke('library:moveNode', { kind, id, targetFolderId }),
  deleteFolder: (id) => ipcRenderer.invoke('library:deleteFolder', { id }),
  deleteBook: (id) => ipcRenderer.invoke('library:deleteBook', { id }),
  restoreBook: (id) => ipcRenderer.invoke('library:restoreBook', { id }),
  importBook: (folderId) => ipcRenderer.invoke('library:importBook', { folderId }),
  importPrototype: (graph) => ipcRenderer.invoke('library:importPrototype', graph),
  getMeta: () => ipcRenderer.invoke('library:getMeta'),
  bookSource: (bookId) => ipcRenderer.invoke('library:bookSource', { bookId }),
  getReadingState: (bookId) => ipcRenderer.invoke('reading:getState', { bookId }),
  saveReadingState: (bookId, patch) => ipcRenderer.invoke('reading:saveState', { bookId, ...patch }),
  setPageCount: (bookId, pageCount) => ipcRenderer.invoke('reading:setPageCount', { bookId, pageCount }),
}

const desktopApi: ShiyunDesktopApi = {
  getRuntimeInfo: () => ipcRenderer.invoke('app:get-runtime-info'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  library,
}

contextBridge.exposeInMainWorld('shiyunDesktop', desktopApi)
