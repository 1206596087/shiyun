/** 阅读器契约：主进程与渲染进程共用（不含任何 electron 依赖）。 */

/** 与 `types/library.ts` 的 BookFormat 同义；此处内联以免两份 tsconfig 的模块解析规则打架。 */
export type ReaderFormat = 'pdf' | 'epub'

export interface ReadingState {
  bookId: string
  page: number | null
  cfi: string | null
  zoom: number
  scrollRatio: number | null
  updatedAt: string | null
}

export interface BookSource {
  bookId: string
  title: string
  format: ReaderFormat
  /** 渲染进程可直接 fetch 的自定义协议地址，形如 shiyun-book://book/<id> */
  url: string
  pageCount: number | null
  state: ReadingState
}

export interface SaveReadingStatePayload {
  page?: number | null
  cfi?: string | null
  zoom?: number
  scrollRatio?: number | null
}

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.1

/** 阅读进度与缩放都要夹在合法范围内：坏值一律回退，不能让界面变成 0 号页或 0.01 倍。 */
export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))
  return Math.round(clamped * 100) / 100
}

export function clampPage(value: number, pageCount: number | null): number {
  const upper = pageCount && pageCount > 0 ? pageCount : Number.MAX_SAFE_INTEGER
  if (!Number.isFinite(value)) return 1
  return Math.min(upper, Math.max(1, Math.round(value)))
}

export function sanitizeReadingState(bookId: string, saved: unknown): ReadingState {
  const empty: ReadingState = { bookId, page: null, cfi: null, zoom: 1, scrollRatio: null, updatedAt: null }
  if (!saved || typeof saved !== 'object') return empty
  const raw = saved as Record<string, unknown>
  const zoom = typeof raw.zoom === 'number' ? clampZoom(raw.zoom) : 1
  const page = typeof raw.page === 'number' && Number.isFinite(raw.page) ? Math.max(1, Math.round(raw.page)) : null
  const cfi = typeof raw.cfi === 'string' && raw.cfi.length > 0 ? raw.cfi : null
  const scrollRatio =
    typeof raw.scrollRatio === 'number' && Number.isFinite(raw.scrollRatio)
      ? Math.min(1, Math.max(0, raw.scrollRatio))
      : null
  return {
    bookId,
    page,
    cfi,
    zoom,
    scrollRatio,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  }
}
