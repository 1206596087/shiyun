import type { MaintenanceApi } from '../../src/types/maintenance.ts'
import { contextBridge, ipcRenderer } from 'electron'
import type { ImportReport, LibraryNodeKind, LibraryTree } from '../../src/types/library.ts'
import type { BookSource, ReadingState, SaveReadingStatePayload } from '../../src/types/reader.ts'
import type {
  CreateHighlightInput,
  CreateNoteInput,
  Highlight,
  Note,
  UpdateNoteInput,
} from '../../src/types/annotation.ts'
import type { KnowledgeGraphData } from '../../src/types/knowledge.ts'
import type { ResearchBounds, ResearchState } from '../../src/types/research.ts'

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

/** 划线与笔记：一条划线可挂多篇笔记，一篇笔记也可引多条划线（多对多）。 */
export interface ShiyunAnnotationApi {
  listForBook: (bookId: string) => Promise<Highlight[]>
  listAllHighlights: () => Promise<Highlight[]>
  createHighlight: (input: CreateHighlightInput) => Promise<Highlight>
  deleteHighlight: (highlightId: string) => Promise<void>
  notesForHighlight: (highlightId: string) => Promise<Note[]>
  highlightsForNote: (noteId: string) => Promise<Highlight[]>
  searchNotes: (query: string) => Promise<Note[]>
  listNotes: () => Promise<Note[]>
  getNote: (noteId: string) => Promise<Note | null>
  createNote: (input: CreateNoteInput) => Promise<Note>
  updateNote: (noteId: string, patch: UpdateNoteInput) => Promise<Note>
  deleteNote: (noteId: string) => Promise<void>
  link: (highlightId: string, noteId: string) => Promise<void>
  unlink: (highlightId: string, noteId: string) => Promise<void>
}

/** 银河图：只读整张图 + 固定/取消固定单颗星的位置。 */
export interface ShiyunGraphApi {
  load: () => Promise<KnowledgeGraphData>
  pin: (nodeId: string, position: { x: number; y: number; z: number }) => Promise<{ nodeId: string; x: number; y: number; z: number }>
  unpin: (nodeId: string) => Promise<boolean>
}

/** 研究栏（M6）：只上报矩形与导航意图，真正的 WebContentsView 在主进程里。 */
export interface ShiyunResearchApi {
  ensure: () => Promise<ResearchState | null>
  createTab: (url?: string) => Promise<ResearchState | null>
  closeTab: (tabId: string) => Promise<ResearchState | null>
  activateTab: (tabId: string) => Promise<ResearchState | null>
  setBounds: (bounds: ResearchBounds) => Promise<ResearchState | null>
  setVisible: (visible: boolean) => Promise<ResearchState | null>
  navigate: (url: string) => Promise<ResearchState | null>
  back: () => Promise<ResearchState | null>
  forward: () => Promise<ResearchState | null>
  reload: () => Promise<ResearchState | null>
  setZoom: (zoom: number) => Promise<ResearchState | null>
  selectedText: () => Promise<{ text: string; title: string; url: string } | null>
  getState: () => Promise<ResearchState | null>
  /** 主进程推来的导航状态（加载完成、标题变化、出错）。返回取消订阅函数。 */
  onState: (listener: (state: ResearchState) => void) => () => void
}

export interface ShiyunDesktopApi {
  maintenance: MaintenanceApi
  getRuntimeInfo: () => Promise<{ platform: string; version: string; electron: string }>
  openExternal: (url: string) => Promise<void>
  library: ShiyunLibraryApi
  annotations: ShiyunAnnotationApi
  graph: ShiyunGraphApi
  research: ShiyunResearchApi
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

const annotations: ShiyunAnnotationApi = {
  listForBook: (bookId) => ipcRenderer.invoke('annotation:listForBook', { bookId }),
  listAllHighlights: () => ipcRenderer.invoke('annotation:listAllHighlights'),
  createHighlight: (input) => ipcRenderer.invoke('annotation:createHighlight', input),
  deleteHighlight: (highlightId) => ipcRenderer.invoke('annotation:deleteHighlight', { highlightId }),
  notesForHighlight: (highlightId) => ipcRenderer.invoke('annotation:notesForHighlight', { highlightId }),
  highlightsForNote: (noteId) => ipcRenderer.invoke('annotation:highlightsForNote', { noteId }),
  searchNotes: (query) => ipcRenderer.invoke('annotation:searchNotes', query),
  listNotes: () => ipcRenderer.invoke('annotation:listNotes'),
  getNote: (noteId) => ipcRenderer.invoke('annotation:getNote', { noteId }),
  createNote: (input) => ipcRenderer.invoke('annotation:createNote', input),
  updateNote: (noteId, patch) => ipcRenderer.invoke('annotation:updateNote', { noteId, patch }),
  deleteNote: (noteId) => ipcRenderer.invoke('annotation:deleteNote', { noteId }),
  link: (highlightId, noteId) => ipcRenderer.invoke('annotation:link', { highlightId, noteId }),
  unlink: (highlightId, noteId) => ipcRenderer.invoke('annotation:unlink', { highlightId, noteId }),
}

const graph: ShiyunGraphApi = {
  load: () => ipcRenderer.invoke('graph:load'),
  pin: (nodeId, position) => ipcRenderer.invoke('graph:pin', { nodeId, ...position }),
  unpin: (nodeId) => ipcRenderer.invoke('graph:unpin', { nodeId }),
}

const research: ShiyunResearchApi = {
  ensure: () => ipcRenderer.invoke('research:ensure'),
  createTab: (url) => ipcRenderer.invoke('research:createTab', url),
  closeTab: (tabId) => ipcRenderer.invoke('research:closeTab', tabId),
  activateTab: (tabId) => ipcRenderer.invoke('research:activateTab', tabId),
  setBounds: (bounds) => ipcRenderer.invoke('research:setBounds', bounds),
  setVisible: (visible) => ipcRenderer.invoke('research:setVisible', visible),
  navigate: (url) => ipcRenderer.invoke('research:navigate', url),
  back: () => ipcRenderer.invoke('research:back'),
  forward: () => ipcRenderer.invoke('research:forward'),
  reload: () => ipcRenderer.invoke('research:reload'),
  setZoom: (zoom) => ipcRenderer.invoke('research:setZoom', zoom),
  selectedText: () => ipcRenderer.invoke('research:selectedText'),
  getState: () => ipcRenderer.invoke('research:state'),
  onState: (listener) => {
    const handler = (_event: unknown, state: ResearchState) => listener(state)
    ipcRenderer.on('research:state', handler)
    return () => {
      ipcRenderer.removeListener('research:state', handler)
    }
  },
}

const desktopApi: ShiyunDesktopApi = {
  maintenance: {
    exportBundle: () => ipcRenderer.invoke('maintenance:exportBundle'),
    status: () => ipcRenderer.invoke('maintenance:status'),
    trash: () => ipcRenderer.invoke('maintenance:trash'),
    restore: (kind, id) => ipcRenderer.invoke('maintenance:restore', kind, id),
    openDirectory: (kind) => ipcRenderer.invoke('maintenance:openDirectory', kind),
    backup: () => ipcRenderer.invoke('maintenance:backup'),
  },
  getRuntimeInfo: () => ipcRenderer.invoke('app:get-runtime-info'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  library,
  annotations,
  graph,
  research,
}

contextBridge.exposeInMainWorld('shiyunDesktop', desktopApi)
