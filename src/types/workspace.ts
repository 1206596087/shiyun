export type WorkspaceTabKind = 'book' | 'note' | 'highlights' | 'notes' | 'clippings'

export interface WorkspaceTab {
  id: string
  kind: WorkspaceTabKind
  title: string
  dirty?: boolean
}

export interface WorkspaceUiState {
  leftWidth: number
  rightWidth: number
  rightVisible: boolean
  activeTabId: string | null
  tabs: WorkspaceTab[]
  expandedFolderIds: string[]
  selectedFolderId: string | null
  noteDraft: string
}

export const DEFAULT_WORKSPACE_UI: WorkspaceUiState = {
  leftWidth: 236,
  rightWidth: 360,
  rightVisible: true,
  activeTabId: 'book-biostatistics',
  tabs: [{ id: 'book-biostatistics', kind: 'book', title: '生物统计学.pdf' }],
  expandedFolderIds: ['folder-medicine', 'folder-statistics'],
  selectedFolderId: 'folder-statistics',
  noteDraft: '为什么在罕见结局下，OR 会近似 RR？\n\n记录推导过程，并关联到上方划线。',
}

/**
 * 银河 → 书房的跳转目标（验收 D）。
 *
 * token 每次跳转都变，书房据此判断"这是一次新的跳转"，
 * 否则连续双击同一颗星不会有任何反应。
 */
export interface WorkspaceOpenTarget {
  token: number
  kind: 'book' | 'highlight' | 'note'
  bookId?: string
  page?: number
  cfi?: string
  noteId?: string
}
