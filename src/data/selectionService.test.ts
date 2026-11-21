import { describe, expect, it, vi } from 'vitest'
import { adaptNoteSelection, adaptReaderSelection, executeSelectionAction } from './selectionService'

describe('selection adapters', () => {
  it('保留 PDF 的稳定页码和上下文', () => {
    const selection = adaptReaderSelection('book-1', 'pdf', {
      quote: '极大似然估计', prefix: '通过', suffix: '求解参数', rects: null,
      page: 18, cfi: null, anchor: { x: 100, y: 200 },
    })
    expect(selection).toMatchObject({ source: 'pdf', sourceId: 'book-1', page: 18, text: '极大似然估计' })
  })

  it('为 EPUB 和笔记保留各自定位', () => {
    const epub = adaptReaderSelection('book-2', 'epub', {
      quote: 'logistic regression', prefix: null, suffix: null, rects: null,
      page: null, cfi: 'epubcfi(/6/4)', anchor: { x: 1, y: 2 },
    })
    const note = adaptNoteSelection('note-1', '  score test  ', { x: 3, y: 4 }, { from: 2, to: 12 })
    expect(epub.cfi).toBe('epubcfi(/6/4)')
    expect(note).toMatchObject({ source: 'note', text: 'score test', editorRange: { from: 2, to: 12 } })
  })
})

describe('executeSelectionAction', () => {
  it('复制留在本地，翻译只生成显式网络请求', async () => {
    const copyText = vi.fn(async () => undefined)
    const openResearch = vi.fn()
    const selection = adaptNoteSelection('note-1', '方差分析', { x: 0, y: 0 }, { from: 1, to: 5 })
    await executeSelectionAction('copy', selection, { copyText, openResearch })
    expect(copyText).toHaveBeenCalledWith('方差分析')
    expect(openResearch).not.toHaveBeenCalled()
    await executeSelectionAction('translate', selection, { copyText, openResearch })
    expect(openResearch.mock.calls[0]?.[0].url).toContain('translator')
  })
})
