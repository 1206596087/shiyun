import { DEFAULT_WORKSPACE_UI, type WorkspaceTab, type WorkspaceTabKind, type WorkspaceUiState } from '../../types/workspace'

export const LEFT_MIN = 196
export const LEFT_MAX = 360
export const RIGHT_MIN = 264
export const RIGHT_MAX = 440

const TAB_KINDS: WorkspaceTabKind[] = ['book', 'note']

export function clampWidth(side: 'left' | 'right', value: number) {
  if (side === 'left') return clamp(value, LEFT_MIN, LEFT_MAX)
  return clamp(value, RIGHT_MIN, RIGHT_MAX)
}

/**
 * 把 localStorage / 旧版本留下的任意值收敛成合法的书房 UI 状态。
 * 坏字段逐项回退到默认值，而不是整个状态报废 —— 用户不该因为一个
 * 损坏的宽度字段而丢掉全部标签页。
 */
export function sanitizeWorkspaceUi(saved: unknown): WorkspaceUiState {
  const fallback = DEFAULT_WORKSPACE_UI
  if (!isRecord(saved)) return { ...fallback, tabs: [...fallback.tabs] }

  const tabs = sanitizeTabs(saved.tabs)
  const activeTabId = typeof saved.activeTabId === 'string' && tabs.some((tab) => tab.id === saved.activeTabId)
    ? saved.activeTabId
    : tabs[0]?.id ?? null

  return {
    leftWidth: isFiniteNumber(saved.leftWidth) ? clampWidth('left', saved.leftWidth) : fallback.leftWidth,
    rightWidth: isFiniteNumber(saved.rightWidth) ? clampWidth('right', saved.rightWidth) : fallback.rightWidth,
    rightVisible: typeof saved.rightVisible === 'boolean' ? saved.rightVisible : fallback.rightVisible,
    activeTabId,
    tabs,
    expandedFolderIds: stringArray(saved.expandedFolderIds) ?? fallback.expandedFolderIds,
    selectedFolderId: typeof saved.selectedFolderId === 'string' ? saved.selectedFolderId : null,
    noteDraft: typeof saved.noteDraft === 'string' ? saved.noteDraft : fallback.noteDraft,
  }
}

function sanitizeTabs(input: unknown): WorkspaceTab[] {
  const list = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const tabs: WorkspaceTab[] = []

  for (const item of list) {
    if (!isRecord(item)) continue
    const { id, title, kind, dirty } = item
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    if (typeof title !== 'string' || !title) continue
    if (typeof kind !== 'string' || !TAB_KINDS.includes(kind as WorkspaceTabKind)) continue
    seen.add(id)
    tabs.push({ id, title, kind: kind as WorkspaceTabKind, ...(dirty === true ? { dirty: true } : {}) })
  }

  return tabs.length > 0 ? tabs : [...DEFAULT_WORKSPACE_UI.tabs]
}

function stringArray(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null
  return input.filter((item): item is string => typeof item === 'string')
}

function isFiniteNumber(input: unknown): input is number {
  return typeof input === 'number' && Number.isFinite(input)
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
