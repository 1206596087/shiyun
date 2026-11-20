import { describe, expect, it } from 'vitest'
import { LEFT_MAX, LEFT_MIN, RIGHT_MAX, RIGHT_MIN, clampWidth, sanitizeWorkspaceUi } from './workspaceLayout'
import { DEFAULT_WORKSPACE_UI } from '../../types/workspace'

describe('clampWidth', () => {
  it('把左栏宽度限制在 196–360', () => {
    expect(clampWidth('left', 120)).toBe(LEFT_MIN)
    expect(clampWidth('left', 999)).toBe(LEFT_MAX)
    expect(clampWidth('left', 250)).toBe(250)
  })

  it('把右栏宽度限制在 264–440', () => {
    expect(clampWidth('right', 10)).toBe(RIGHT_MIN)
    expect(clampWidth('right', 10000)).toBe(RIGHT_MAX)
    expect(clampWidth('right', 300)).toBe(300)
  })
})

describe('sanitizeWorkspaceUi', () => {
  it('空值回退到默认状态', () => {
    expect(sanitizeWorkspaceUi(null)).toEqual(DEFAULT_WORKSPACE_UI)
    expect(sanitizeWorkspaceUi(undefined)).toEqual(DEFAULT_WORKSPACE_UI)
    expect(sanitizeWorkspaceUi('不是对象')).toEqual(DEFAULT_WORKSPACE_UI)
  })

  it('保留合法字段，越界宽度被夹到范围内', () => {
    const result = sanitizeWorkspaceUi({
      leftWidth: 9999,
      rightWidth: 100,
      rightVisible: false,
      tabs: [{ id: 'book-biostatistics', kind: 'book', title: '生物统计学.pdf' }],
      activeTabId: 'book-biostatistics',
      expandedFolderIds: ['folder-medicine'],
      selectedFolderId: 'folder-medicine',
      noteDraft: '草稿',
    })

    expect(result.leftWidth).toBe(LEFT_MAX)
    expect(result.rightWidth).toBe(RIGHT_MIN)
    expect(result.rightVisible).toBe(false)
    expect(result.activeTabId).toBe('book-biostatistics')
    expect(result.expandedFolderIds).toEqual(['folder-medicine'])
    expect(result.selectedFolderId).toBe('folder-medicine')
    expect(result.noteDraft).toBe('草稿')
  })

  it('剔除非法标签，并在活动标签失效时回退到第一个标签', () => {
    const result = sanitizeWorkspaceUi({
      tabs: [
        { id: 'ok', kind: 'note', title: '有效笔记' },
        { id: 'bad-kind', kind: 'terminal', title: '不支持的标签类型' },
        { id: 'ok', kind: 'book', title: '重复 ID' },
        { id: '', kind: 'book', title: '空 ID' },
        { id: 'no-title', kind: 'book' },
        '字符串不是标签',
      ],
      activeTabId: 'not-exist',
    })

    expect(result.tabs).toEqual([{ id: 'ok', kind: 'note', title: '有效笔记' }])
    expect(result.activeTabId).toBe('ok')
  })

  it('所有标签都被剔除时回退到默认标签，不让书房变空', () => {
    const result = sanitizeWorkspaceUi({ tabs: [] })
    expect(result.tabs).toEqual(DEFAULT_WORKSPACE_UI.tabs)
    expect(result.activeTabId).toBe(DEFAULT_WORKSPACE_UI.tabs[0].id)
  })

  it('不因单个坏字段丢弃整份状态', () => {
    const result = sanitizeWorkspaceUi({
      leftWidth: '宽一点',
      tabs: [{ id: 'note-1', kind: 'note', title: '保留我' }],
      activeTabId: 'note-1',
    })

    expect(result.leftWidth).toBe(DEFAULT_WORKSPACE_UI.leftWidth)
    expect(result.tabs).toHaveLength(1)
    expect(result.activeTabId).toBe('note-1')
  })
})
