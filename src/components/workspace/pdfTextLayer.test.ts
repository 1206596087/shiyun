import { describe, expect, it } from 'vitest'
import { horizontalScale, layoutTextSpans, multiplyTransform } from './pdfTextLayer'

/** 一倍缩放、无旋转的视口矩阵。 */
const IDENTITY = [1, 0, 0, 1, 0, 0]

describe('multiplyTransform', () => {
  it('单位矩阵相乘保持不变', () => {
    expect(multiplyTransform(IDENTITY, [1, 0, 0, 1, 12, 34])).toEqual([1, 0, 0, 1, 12, 34])
  })

  it('平移矩阵叠加', () => {
    const result = multiplyTransform([1, 0, 0, 1, 10, 20], [1, 0, 0, 1, 5, 5])
    expect(result[4]).toBe(15)
    expect(result[5]).toBe(25)
  })
})

describe('layoutTextSpans', () => {
  it('把 PDF 坐标换算成 CSS 位置，top 取基线减去字号', () => {
    const [layout] = layoutTextSpans([{ str: '第三章', width: 60, transform: [12, 0, 0, 12, 100, 200] }], IDENTITY, 1)
    expect(layout.text).toBe('第三章')
    expect(layout.left).toBe(100)
    expect(layout.top).toBe(188)
    expect(layout.fontSize).toBe(12)
    expect(layout.angle).toBe(0)
    expect(layout.width).toBe(60)
  })

  it('缩放会同时作用到位置、字号与宽度', () => {
    const [layout] = layoutTextSpans([{ str: '正文', width: 50, transform: [10, 0, 0, 10, 20, 40] }], [2, 0, 0, 2, 0, 0], 2)
    expect(layout.left).toBe(40)
    expect(layout.top).toBe(60)
    expect(layout.fontSize).toBe(20)
    expect(layout.width).toBe(100)
  })

  it('空白项与零字号项被丢弃', () => {
    const layouts = layoutTextSpans(
      [
        { str: '   ', width: 10, transform: [12, 0, 0, 12, 0, 0] },
        { str: '', width: 10, transform: [12, 0, 0, 12, 0, 0] },
        { str: '有效', width: 10, transform: [0, 0, 0, 0, 0, 0] },
      ],
      IDENTITY,
      1,
    )
    expect(layouts).toHaveLength(0)
  })

  it('旋转页保持角度', () => {
    const [layout] = layoutTextSpans([{ str: 'Rotated', width: 40, transform: [12, 0, 0, 12, 0, 0] }], [0, 1, -1, 0, 0, 0], 1)
    expect(layout.angle).toBeCloseTo(Math.PI / 2)
  })
})

describe('horizontalScale', () => {
  it('按目标宽度缩放', () => {
    expect(horizontalScale(50, 100)).toBe(2)
  })

  it('测量失败或极端值时不缩放', () => {
    expect(horizontalScale(0, 100)).toBe(1)
    expect(horizontalScale(50, 0)).toBe(1)
    expect(horizontalScale(50, 100000)).toBe(1)
    expect(horizontalScale(Number.NaN, 10)).toBe(1)
  })
})
