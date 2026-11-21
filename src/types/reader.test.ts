import { describe, expect, it } from 'vitest'
import { ZOOM_MAX, ZOOM_MIN, clampPage, clampZoom, pdfRenderWindow, sanitizeReadingState } from './reader'

describe('clampZoom', () => {
  it('把越界值夹回合法区间', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN)
    expect(clampZoom(9)).toBe(ZOOM_MAX)
    expect(clampZoom(1.234)).toBe(1.23)
  })

  it('非法数字回退到 100%', () => {
    expect(clampZoom(Number.NaN)).toBe(1)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('clampPage', () => {
  it('页码至少为 1 且不超过总页数', () => {
    expect(clampPage(0, 120)).toBe(1)
    expect(clampPage(-8, 120)).toBe(1)
    expect(clampPage(999, 120)).toBe(120)
    expect(clampPage(12.6, 120)).toBe(13)
  })

  it('不知道总页数时只做下限保护', () => {
    expect(clampPage(37, null)).toBe(37)
    expect(clampPage(Number.NaN, null)).toBe(1)
    expect(clampPage(37, 0)).toBe(37)
  })
})

describe('pdfRenderWindow', () => {
  it('只返回当前页前后有限窗口', () => {
    expect(pdfRenderWindow(50, 100)).toEqual([49, 50, 51])
    expect(pdfRenderWindow(50, 100, 2)).toEqual([48, 49, 50, 51, 52])
  })

  it('在文档边界收窄并拒绝空文档', () => {
    expect(pdfRenderWindow(1, 3)).toEqual([1, 2])
    expect(pdfRenderWindow(3, 3)).toEqual([2, 3])
    expect(pdfRenderWindow(1, 0)).toEqual([])
  })
})

describe('sanitizeReadingState', () => {
  it('空值给出干净默认态', () => {
    expect(sanitizeReadingState('b1', null)).toEqual({
      bookId: 'b1',
      page: null,
      cfi: null,
      zoom: 1,
      scrollRatio: null,
      updatedAt: null,
    })
  })

  it('字段级回退：坏字段不连累好字段', () => {
    const state = sanitizeReadingState('b2', {
      page: 'not-a-number',
      cfi: 'epubcfi(/6/4[chap01]!/4/2)',
      zoom: 42,
      scrollRatio: -3,
      updatedAt: '2026-11-21T02:00:00.000Z',
    })
    expect(state).toEqual({
      bookId: 'b2',
      page: null,
      cfi: 'epubcfi(/6/4[chap01]!/4/2)',
      zoom: ZOOM_MAX,
      scrollRatio: 0,
      updatedAt: '2026-11-21T02:00:00.000Z',
    })
  })

  it('页码取整并保证不小于 1，空 CFI 视为没有定位', () => {
    const state = sanitizeReadingState('b3', { page: 4.7, cfi: '', zoom: '1.5' })
    expect(state.page).toBe(5)
    expect(state.cfi).toBeNull()
    expect(state.zoom).toBe(1)
  })
})
