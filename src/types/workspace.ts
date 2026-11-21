export type WorkspaceTabKind = 'book' | 'note' | 'highlights' | 'notes'

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
  rightWidth: 294,
  rightVisible: true,
  activeTabId: 'book-biostatistics',
  tabs: [{ id: 'book-biostatistics', kind: 'book', title: '生物统计学.pdf' }],
  expandedFolderIds: ['folder-medicine', 'folder-statistics'],
  selectedFolderId: 'folder-statistics',
  noteDraft: '为什么在罕见结局下，OR 会近似 RR？\n\n记录推导过程，并关联到上方划线。',
}
