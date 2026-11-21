import { describe, expect, it } from 'vitest'
import { normalizeResearchSession, parseResearchSession, serializeResearchSession } from './researchSession.ts'
import { EMPTY_RESEARCH_SESSION, MAX_RESEARCH_TABS } from '../types/research.ts'

const tab = (id: string, url = 'https://example.com/', extra: Record<string, unknown> = {}) => ({ id, url, ...extra })

describe('normalizeResearchSession', () => {
  it('把坏输入退化成空会话，而不是抛错', () => {
    expect(normalizeResearchSession(null).session).toEqual(EMPTY_RESEARCH_SESSION)
    expect(normalizeResearchSession('nope').session.tabs).toEqual([])
    expect(parseResearchSession('{ 这不是 json').session).toEqual(EMPTY_RESEARCH_SESSION)
  })

  it('保留合法标签，并补齐缺省字段', () => {
    const { session } = normalizeResearchSession({ tabs: [tab('a')], activeTabId: 'a' })
    expect(session.tabs).toEqual([{ id: 'a', url: 'https://example.com/', title: '', zoom: 1, userAgentMode: 'auto' }])
    expect(session.activeTabId).toBe('a')
  })

  it('丢掉非 http(s)、空地址与重复 id 的标签，其余照留', () => {
    const { session, droppedTabs } = normalizeResearchSession({
      tabs: [
        tab('a', 'https://example.com/'),
        tab('b', 'file:///C:/secret.txt'),
        tab('c', ''),
        tab('a', 'https://duplicate.example/'),
        tab('d', 'about:blank'),
        tab('e', 'http://example.org/page'),
      ],
      activeTabId: 'a',
    })
    expect(session.tabs.map((item) => item.id)).toEqual(['a', 'e'])
    expect(droppedTabs).toBe(4)
  })

  it('收起越界的缩放与不认识的 UA 模式', () => {
    const { session } = normalizeResearchSession({
      tabs: [tab('a', 'https://example.com/', { zoom: 99, userAgentMode: 'nonsense' }), tab('b', 'https://b.example/', { zoom: 0.1, userAgentMode: 'mobile' })],
      activeTabId: 'b',
    })
    expect(session.tabs.map((item) => [item.zoom, item.userAgentMode])).toEqual([[2, 'auto'], [0.5, 'mobile']])
  })

  it('当前标签不存在时退回到第一个标签', () => {
    expect(normalizeResearchSession({ tabs: [tab('a'), tab('b')], activeTabId: 'gone' }).session.activeTabId).toBe('a')
    expect(normalizeResearchSession({ tabs: [], activeTabId: 'a' }).session.activeTabId).toBeNull()
  })

  it('超过上限时保留前 N 个标签并计数', () => {
    const tabs = Array.from({ length: MAX_RESEARCH_TABS + 3 }, (_value, index) => tab(`t${index}`, `https://e${index}.example/`))
    const { session, droppedTabs } = normalizeResearchSession({ tabs })
    expect(session.tabs).toHaveLength(MAX_RESEARCH_TABS)
    expect(droppedTabs).toBe(3)
    expect(session.tabs[0]?.id).toBe('t0')
  })
})

describe('serialize / parse', () => {
  it('往返之后内容一致（标题过长会被截断）', () => {
    const longTitle = '标'.repeat(400)
    const original = {
      version: 1,
      tabs: [{ id: 'a', url: 'https://example.com/x', title: longTitle, zoom: 1.3, userAgentMode: 'desktop' as const }],
      activeTabId: 'a',
    }
    const parsed = parseResearchSession(serializeResearchSession(original))
    expect(parsed.session.tabs[0]?.url).toBe('https://example.com/x')
    expect(parsed.session.tabs[0]?.title).toHaveLength(200)
    expect(parsed.session.tabs[0]?.zoom).toBe(1.3)
    expect(parsed.session.activeTabId).toBe('a')
  })

  it('序列化不写入表单或 DOM 之类的字段（只保留白名单）', () => {
    const text = serializeResearchSession({
      version: 1,
      tabs: [{ id: 'a', url: 'https://example.com/', title: 't', zoom: 1, userAgentMode: 'auto', ...{ password: 'secret' } } as never],
      activeTabId: 'a',
    })
    expect(text).not.toContain('secret')
    expect(text).not.toContain('password')
  })
})
