import {
  isPersistableResearchUrl,
  MAX_RESEARCH_TABS,
  RESEARCH_SESSION_VERSION,
  type ResearchSession,
  type ResearchSessionTab,
  type ResearchUserAgentMode,
} from '../types/research.ts'

/**
 * 浏览器会话的归一化（纯函数，无 IO）。
 *
 * 这个文件同时被渲染进程和主进程引用（主进程读盘前先归一化一次），
 * 所以内部相对导入必须带 `.ts` 后缀——和 `graphProjection.ts` 一样的原因。
 *
 * 设计原则：**坏数据只丢坏的那一条，不丢整份会话**。文件损坏、字段缺失、
 * 多出一个不认识的 UA 模式，都不该让用户丢掉全部标签。
 */

export interface NormalizedSession {
  session: ResearchSession
  droppedTabs: number
  repaired: boolean
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const TITLE_LIMIT = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asUserAgentMode(value: unknown): ResearchUserAgentMode | null {
  return value === 'auto' || value === 'mobile' || value === 'desktop' ? value : null
}

function asZoom(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 10) / 10
}

export function normalizeResearchSession(raw: unknown, maxTabs = MAX_RESEARCH_TABS): NormalizedSession {
  const repaired = true
  if (!isRecord(raw)) {
    return { session: { version: RESEARCH_SESSION_VERSION, tabs: [], activeTabId: null }, droppedTabs: 0, repaired }
  }
  const rawTabs = Array.isArray(raw.tabs) ? raw.tabs : []
  const tabs: ResearchSessionTab[] = []
  let droppedTabs = 0
  const seen = new Set<string>()

  for (const entry of rawTabs) {
    const candidate = isRecord(entry) ? entry : null
    const id = candidate && typeof candidate.id === 'string' ? candidate.id.trim() : ''
    const url = candidate && typeof candidate.url === 'string' ? candidate.url.trim() : ''
    if (!candidate || !id || !url || !isPersistableResearchUrl(url) || seen.has(id)) {
      droppedTabs += 1
      continue
    }
    seen.add(id)
    tabs.push({
      id,
      url,
      title: typeof candidate.title === 'string' ? candidate.title.trim().slice(0, TITLE_LIMIT) : '',
      zoom: asZoom(candidate.zoom) ?? 1,
      userAgentMode: asUserAgentMode(candidate.userAgentMode) ?? 'auto',
    })
  }

  // 超出上限时保留最前面的标签：它们通常是用户最早、最稳定的那些。
  if (tabs.length > maxTabs) {
    droppedTabs += tabs.length - maxTabs
    tabs.length = maxTabs
  }

  const requestedActive = typeof raw.activeTabId === 'string' ? raw.activeTabId : null
  const activeTabId = requestedActive && tabs.some((tab) => tab.id === requestedActive)
    ? requestedActive
    : tabs[0]?.id ?? null

  return { session: { version: RESEARCH_SESSION_VERSION, tabs, activeTabId }, droppedTabs, repaired }
}

export function parseResearchSession(text: string): NormalizedSession {
  try {
    return normalizeResearchSession(JSON.parse(text))
  } catch {
    return { session: { version: RESEARCH_SESSION_VERSION, tabs: [], activeTabId: null }, droppedTabs: 0, repaired: true }
  }
}

export function serializeResearchSession(session: ResearchSession): string {
  return JSON.stringify({
    version: RESEARCH_SESSION_VERSION,
    tabs: session.tabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      zoom: tab.zoom,
      userAgentMode: tab.userAgentMode,
    })),
    activeTabId: session.activeTabId,
  }, null, 2)
}
