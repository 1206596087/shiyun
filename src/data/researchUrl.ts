/**
 * 研究栏的地址解析：用户可能输入网址，也可能只是想搜一句话。
 *
 * 纯函数、无副作用，方便在 Vitest 里断言（也不让渲染层直接拼 URL 后再去猜）。
 */

/** 搜素走 Bing：不需要登录、不用处理 Google 的 Cookie 同意页。 */
export const SEARCH_ENDPOINT = 'https://www.bing.com/search'
export const HOME_URL = 'https://www.bing.com/'

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const HOST_LIKE = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/

/** 只允许 http/https：书库里的 `shiyun-book:` 或 `file:` 不允许出现在研究栏。 */
export function isAllowedResearchUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 把输入框里的文字变成可加载的 URL：
 * - 带 `http(s)://` 直接使用；
 * - 像域名（`example.com/a`）补成 `https://`；
 * - 其他一律当成搜索词，交给 Bing。
 * 空输入返回主页。
 */
export function toNavigableUrl(raw: string): string {
  const input = raw.trim()
  if (!input) return HOME_URL
  if (SCHEME.test(input)) return isAllowedResearchUrl(input) ? input : buildSearchUrl(input)
  if (HOST_LIKE.test(input) && !input.includes(' ')) return `https://${input}`
  return buildSearchUrl(input)
}

export function buildSearchUrl(term: string): string {
  return `${SEARCH_ENDPOINT}?q=${encodeURIComponent(term.trim())}`
}

/** 地址栏里展示的简短形式（去掉协议与末尾斜杠），便于阅读。 */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}
