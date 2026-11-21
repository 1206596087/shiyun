/**
 * 书库的跨进程类型契约。
 *
 * 主进程（SQLite）与渲染进程（IPC）共用这一份定义，避免两边对"什么是书/文件夹"
 * 各有一套说法。这里只有类型，没有运行时依赖，可以被 electron/ 与 src/ 同时导入。
 */

export type BookFormat = 'pdf' | 'epub'

export interface LibraryBook {
  kind: 'book'
  id: string
  title: string
  author: string | null
  format: BookFormat
  folderId: string | null
  pageCount: number | null
  fileSize: number | null
  lastOpenedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LibraryFolder {
  kind: 'folder'
  id: string
  name: string
  parentId: string | null
  children: LibraryTreeNode[]
}

export type LibraryTreeNode = LibraryFolder | LibraryBook

export interface LibraryCounts {
  books: number
  folders: number
  highlights: number
  notes: number
  /** 网页摘录的数量（阶段一起进左栏「我的摘录」）。 */
  clippings: number
  links: number
}

export interface LibraryTree {
  /** 根级文件夹，已按 sort_order / 名称排序。 */
  folders: LibraryFolder[]
  /** 未归类的书（folder_id 为 NULL）。 */
  uncategorized: LibraryBook[]
  counts: LibraryCounts
  /** 数据库文件所在目录，用于界面上如实展示"数据存在哪"。 */
  dataDir: string
}

export type LibraryNodeKind = 'folder' | 'book'

export interface ImportReport {
  imported: number
  skipped: number
  tree: LibraryTree
}
