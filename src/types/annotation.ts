/**
 * 划线（highlight）与笔记（note）的类型与纯函数。
 *
 * 设计约束（见 DATABASE_SCHEMA.md 第 3 节）：
 * - 划线不能只靠像素坐标定位：PDF 必须带页码，EPUB 必须带 CFI，像素矩形只是首屏快速重绘的缓存。
 * - 笔记是独立实体，删书不删笔记；划线↔笔记是多对多。
 */

export type LocatorType = 'pdf_page' | 'epub_cfi'

/** 归一化到页面宽高的 0–1 区间，换窗口尺寸/缩放时能重建高亮框 */
export interface HighlightRect {
  left: number
  top: number
  width: number
  height: number
}

export interface Highlight {
  id: string
  bookId: string
  locatorType: LocatorType
  page: number | null
  cfi: string | null
  quote: string
  prefix: string | null
  suffix: string | null
  rects: HighlightRect[] | null
  color: string
  noteCount: number
  createdAt: string
  updatedAt: string
}

export interface Note {
  id: string
  title: string
  /** TipTap 文档 JSON 字符串 */
  body: string
  /** 纯文本投影，供搜索与列表预览 */
  bodyText: string
  highlightIds: string[]
  createdAt: string
  updatedAt: string
}

export interface CreateHighlightInput {
  bookId: string
  locatorType: LocatorType
  page?: number | null
  cfi?: string | null
  quote: string
  prefix?: string | null
  suffix?: string | null
  rects?: HighlightRect[] | null
  color?: string
}

export interface CreateNoteInput {
  title?: string
  body?: string
  bodyText?: string
  /** 创建时就挂到某条划线上（从划线浮动工具栏「写笔记」入口来） */
  highlightId?: string | null
}

export interface UpdateNoteInput {
  title?: string
  body?: string
  bodyText?: string
}

/**
 * 阅读器里一次真实选区。页码/CFI 是权威定位，rects 只是首屏重绘用的缓存，
 * anchor 用来把浮动工具栏放到选区上方（视口坐标）。
 */
export interface TextSelectionAnchor {
  quote: string
  prefix: string | null
  suffix: string | null
  rects: HighlightRect[] | null
  page: number | null
  cfi: string | null
  anchor: { x: number; y: number }
}

export const DEFAULT_HIGHLIGHT_COLOR = 'gold'
export const HIGHLIGHT_COLORS = ['gold', 'rose', 'sage'] as const
export const CONTEXT_WINDOW = 40

/** 定位类型守卫：IPC 与解析旧数据时都要先确认来源格式，不能只信一个字符串 */
export function isLocatorType(value: unknown): value is LocatorType {
  return value === 'pdf_page' || value === 'epub_cfi'
}

/** 划线的原文统一去首尾空白、折叠内部空白，避免同一条划线因换行差异存成两份 */
export function normalizeQuote(text: string): string {
  return text.replace(/\s+/gu, ' ').trim()
}

/**
 * 从整页文本里截出被划文字的前后文，用于同页多处相同文本时消歧。
 * 找不到（例如文本层与选择文本有细微差异）时返回空前后文，不编造。
 */
export function buildContext(
  pageText: string,
  quote: string,
  windowSize: number = CONTEXT_WINDOW,
): { prefix: string | null; suffix: string | null } {
  const normalizedPage = normalizeQuote(pageText)
  const normalizedQuote = normalizeQuote(quote)
  if (!normalizedQuote) return { prefix: null, suffix: null }
  const index = normalizedPage.indexOf(normalizedQuote)
  if (index < 0) return { prefix: null, suffix: null }
  const prefix = normalizedPage.slice(Math.max(0, index - windowSize), index)
  const suffix = normalizedPage.slice(index + normalizedQuote.length, index + normalizedQuote.length + windowSize)
  return {
    prefix: prefix.length > 0 ? prefix : null,
    suffix: suffix.length > 0 ? suffix : null,
  }
}

/**
 * 把 DOM 里量到的像素矩形换算成页面相对坐标。页面尺寸为 0 或矩形无效时返回空数组，
 * 让调用方降级到「只有页码 + 原文」的定位方式，而不是存一堆错坐标。
 */
export function normalizeRects(
  rects: ReadonlyArray<{ left: number; top: number; width: number; height: number }>,
  page: { left: number; top: number; width: number; height: number },
  precision = 4,
): HighlightRect[] {
  if (page.width <= 0 || page.height <= 0) return []
  const factor = Math.pow(10, precision)
  const round = (value: number): number => Math.round(value * factor) / factor
  return rects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      left: round(clamp01((rect.left - page.left) / page.width)),
      top: round(clamp01((rect.top - page.top) / page.height)),
      width: round(clamp01(rect.width / page.width)),
      height: round(clamp01(rect.height / page.height)),
    }))
    .filter((rect) => rect.width > 0.001 && rect.height > 0.001)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** 反序列化 rect_json；坏数据一律降级为 null，不抛异常打断阅读 */
export function parseRects(raw: string | null): HighlightRect[] | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const rects: HighlightRect[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as Record<string, unknown>
      const left = record.left
      const top = record.top
      const width = record.width
      const height = record.height
      if (
        typeof left !== 'number' ||
        typeof top !== 'number' ||
        typeof width !== 'number' ||
        typeof height !== 'number'
      ) {
        continue
      }
      rects.push({ left: clamp01(left), top: clamp01(top), width: clamp01(width), height: clamp01(height) })
    }
    return rects.length > 0 ? rects : null
  } catch {
    return null
  }
}

/** 笔记列表里显示什么标题：显式标题 > 正文首行 > 兜底文案 */
export function readableNoteTitle(title: string, bodyText: string, fallback = '未命名笔记'): string {
  const explicit = title.trim()
  if (explicit) return explicit
  const firstLine = bodyText.split('\n').map((line) => line.trim()).find((line) => line.length > 0)
  if (!firstLine) return fallback
  return firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine
}

/** TipTap 的 JSON 文档 → 纯文本；用于 body_text 投影与搜索 */
export function plainTextFromTiptap(raw: string): string {
  if (!raw.trim()) return ''
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw.trim()
  }
  const chunks: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string') chunks.push(record.text)
    if (record.type === 'formulaInline' || record.type === 'formulaBlock') {
      const attrs = record.attrs
      if (typeof attrs === 'object' && attrs !== null) {
        const latex = (attrs as Record<string, unknown>).latex
        if (typeof latex === 'string' && latex.trim()) chunks.push(latex.trim())
      }
      if (record.type === 'formulaBlock') chunks.push('\n')
    }
    if (Array.isArray(record.content)) {
      for (const child of record.content) walk(child)
      if (record.type === 'paragraph' || record.type === 'heading') chunks.push('\n')
    }
  }
  walk(parsed)
  return chunks.join('').replace(/\n{3,}/gu, '\n\n').trim()
}

/** 一条划线的定位描述，给界面与日志用 */
export function describeLocator(highlight: Pick<Highlight, 'locatorType' | 'page' | 'cfi'>): string {
  if (highlight.locatorType === 'pdf_page') return highlight.page === null ? '页码未知' : `第 ${highlight.page} 页`
  return highlight.cfi ? `CFI ${highlight.cfi.slice(0, 24)}…` : 'CFI 未知'
}
