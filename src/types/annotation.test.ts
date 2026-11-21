import { describe, expect, it } from 'vitest'
import {
  buildContext,
  describeLocator,
  normalizeQuote,
  normalizeRects,
  parseRects,
  plainTextFromTiptap,
  readableNoteTitle,
} from './annotation.ts'

describe('normalizeQuote', () => {
  it('折叠换行与多余空白', () => {
    expect(normalizeQuote('  优势比（OR）\n  和相对危险度 ')).toBe('优势比（OR） 和相对危险度')
  })

  it('纯空白返回空串', () => {
    expect(normalizeQuote(' \n\t ')).toBe('')
  })
})

describe('buildContext', () => {
  it('截出前后各 40 字', () => {
    const pageText = `${'甲'.repeat(50)}目标句${'乙'.repeat(50)}`
    const context = buildContext(pageText, '目标句')
    expect(context.prefix).toHaveLength(40)
    expect(context.suffix).toHaveLength(40)
    expect(context.prefix?.endsWith('甲')).toBe(true)
    expect(context.suffix?.startsWith('乙')).toBe(true)
  })

  it('找不到原文时不编造前后文', () => {
    expect(buildContext('完全无关的正文', '目标句')).toEqual({ prefix: null, suffix: null })
  })

  it('原文在开头/结尾时对应的一侧为 null', () => {
    const context = buildContext('目标句后面的话', '目标句')
    expect(context.prefix).toBeNull()
    expect(context.suffix).toBe('后面的话')
  })
})

describe('normalizeRects', () => {
  it('换算成页面相对坐标并保留 4 位小数', () => {
    const rects = normalizeRects([{ left: 150, top: 200, width: 300, height: 30 }], {
      left: 100,
      top: 100,
      width: 1000,
      height: 1000,
    })
    expect(rects).toEqual([{ left: 0.05, top: 0.1, width: 0.3, height: 0.03 }])
  })

  it('页面尺寸为 0 时返回空数组，不产出错坐标', () => {
    expect(
      normalizeRects([{ left: 10, top: 10, width: 10, height: 10 }], { left: 0, top: 0, width: 0, height: 0 }),
    ).toEqual([])
  })

  it('超出页面的矩形被夹到 0–1', () => {
    const rects = normalizeRects([{ left: -50, top: 990, width: 2000, height: 40 }], {
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
    })
    expect(rects[0].left).toBe(0)
    expect(rects[0].width).toBe(1)
    expect(rects[0].top).toBe(0.99)
  })
})

describe('parseRects', () => {
  it('坏 JSON 与非法字段降级为 null', () => {
    expect(parseRects('not json')).toBeNull()
    expect(parseRects('{"left":0.1}')).toBeNull()
    expect(parseRects('[{"left":"x","top":0,"width":1,"height":1}]')).toBeNull()
  })

  it('过滤非法项但保留合法项', () => {
    const parsed = parseRects('[{"left":0.1,"top":0.1,"width":0.2,"height":0.02},{"width":1}]')
    expect(parsed).toHaveLength(1)
  })
})

describe('readableNoteTitle', () => {
  it('优先用显式标题', () => {
    expect(readableNoteTitle('我的标题', '正文第一行')).toBe('我的标题')
  })

  it('没有标题时取正文首行，过长截断', () => {
    expect(readableNoteTitle('', '\n\n正文第一行\n第二行')).toBe('正文第一行')
    expect(readableNoteTitle('', 'x'.repeat(50))).toHaveLength(41)
  })

  it('正文也空时用兜底文案', () => {
    expect(readableNoteTitle('  ', '  ')).toBe('未命名笔记')
  })
})

describe('plainTextFromTiptap', () => {
  it('把段落与标题拼成带换行的纯文本', () => {
    const body = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: '第三章' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '回归模型。' }] },
      ],
    })
    expect(plainTextFromTiptap(body)).toBe('第三章\n回归模型。')
  })

  it('非 JSON 输入原样返回，空输入返回空串', () => {
    expect(plainTextFromTiptap('纯文本笔记')).toBe('纯文本笔记')
    expect(plainTextFromTiptap('')).toBe('')
  })

  it('把行内、块级和化学公式的 LaTeX 纳入搜索纯文本', () => {
    const body = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: '质能关系 ' },
          { type: 'formulaInline', attrs: { latex: 'E=mc^2', formulaKind: 'math' } },
        ] },
        { type: 'formulaBlock', attrs: { latex: '\\ce{2H2 + O2 -> 2H2O}', formulaKind: 'chemistry' } },
      ],
    })
    expect(plainTextFromTiptap(body)).toBe('质能关系 E=mc^2\n\\ce{2H2 + O2 -> 2H2O}')
  })
})

describe('describeLocator', () => {
  it('PDF 用页码，EPUB 用 CFI 前缀', () => {
    expect(describeLocator({ locatorType: 'pdf_page', page: 3, cfi: null })).toBe('第 3 页')
    expect(describeLocator({ locatorType: 'epub_cfi', page: null, cfi: 'epubcfi(/6/4!/4/2/1:0)' })).toContain(
      'epubcfi',
    )
  })
})
