import { buildContext, normalizeQuote } from './annotation.ts'

/**
 * 网页摘录（WebClipping）。
 *
 * 与划线不同：网页随时会变，摘录只承诺「本地有一份当时的文字 + 当时的地址与标题」，
 * 不承诺点一下就能回到网页里的精确位置。因此定位信息只保存 prefix / suffix
 * （用户摘录那一刻从页面里真实取到的上下文），而不是假造一个 xpath。
 */
export interface WebClipping {
  id: string
  quote: string
  pageTitle: string
  url: string
  capturedAt: string
  /** 摘录时刻页面上紧邻选区的前后文（主进程从真实 DOM 读出来的，可能为 null）。 */
  prefix: string | null
  suffix: string | null
  userNote: string
  /** 已经转成笔记时，指向 notes.id；删除笔记不会连带删掉摘录。 */
  noteId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateClippingInput {
  quote: string
  pageTitle?: string
  url: string
  prefix?: string | null
  suffix?: string | null
  userNote?: string
}

export interface UpdateClippingInput {
  userNote?: string
}

/** 单条摘录最多存 5000 字：够用了，也避免把整页误选进来撑爆数据库。 */
export const CLIPPING_QUOTE_LIMIT = 5000
export const CLIPPING_NOTE_LIMIT = 2000
export const CONTEXT_WINDOW = 40

/**
 * 只接受 http/https；返回规范化后的地址（去掉 hash，保留 query）。
 * 不合法就抛错——渲染进程不该把 `javascript:` 之类的东西写进摘录。
 */
export function normalizeClippingUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('摘录缺少来源地址')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('摘录来源地址不是合法 URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('只支持 http/https 网页摘录')
  parsed.hash = ''
  return parsed.toString()
}

export function clippingHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** 列表与银河里用的短标题：优先网页标题，其次域名，最后兜底。 */
export function clippingTitle(clipping: Pick<WebClipping, 'pageTitle' | 'url'>, limit = 26): string {
  const title = clipping.pageTitle.trim() || clippingHost(clipping.url) || '网页摘录'
  return title.length > limit ? `${title.slice(0, limit)}…` : title
}

/** 一行副标题：域名 · 摘录日期 · 字数。 */
export function clippingSummary(clipping: Pick<WebClipping, 'url' | 'capturedAt' | 'quote'>): string {
  const host = clippingHost(clipping.url)
  const date = clipping.capturedAt.slice(0, 10)
  const length = normalizeQuote(clipping.quote).length
  return [host, date, `${length} 字`].filter(Boolean).join(' · ')
}

/** 摘录时用页面正文补前后文；找不到就返回 null（不编造定位）。 */
export function clippingContext(pageText: string, quote: string, window = CONTEXT_WINDOW) {
  return buildContext(pageText, quote, window)
}
