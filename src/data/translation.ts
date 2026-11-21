/**
 * 翻译能力（阶段一）。
 *
 * 这一层只做两件事：说明「翻译会把文字发到哪里」，以及产出一个可以打开的地址。
 * 现在只有「外部网页翻译」是真的可用；本地模型与用户自己的 API Key 留了位置，
 * 但 `available()` 一律返回 false——在真接上之前，界面不会假装它们能用。
 */

export type TranslationProviderId = 'external-web' | 'local' | 'user-api'

export interface TranslationRequest {
  text: string
  targetLang: string
  sourceLang?: string
}

export type TranslationResult =
  | { ok: true; url: string; notice: string }
  | { ok: false; reason: string }

export interface TranslationProvider {
  id: TranslationProviderId
  label: string
  /** 是否会把这批文字发送到第三方服务。界面必须据此提示用户。 */
  sendsTextOverNetwork: boolean
  available: () => boolean
  translate: (request: TranslationRequest) => Promise<TranslationResult>
}

const EXTERNAL_NOTICE = '所选文字会作为查询参数发送到 Bing Translator（第三方服务）。'
const MAX_TEXT = 1200

export function externalTranslationUrl(request: TranslationRequest): string {
  const params = new URLSearchParams({
    text: request.text.slice(0, MAX_TEXT),
    from: request.sourceLang ?? 'auto',
    to: request.targetLang,
  })
  return `https://www.bing.com/translator?${params.toString()}`
}

const externalWeb: TranslationProvider = {
  id: 'external-web',
  label: '外部网页翻译（Bing Translator）',
  sendsTextOverNetwork: true,
  available: () => true,
  translate: async (request) => {
    const text = request.text.trim()
    if (!text) return { ok: false, reason: '没有选中文字。' }
    return { ok: true, url: externalTranslationUrl({ ...request, text }), notice: EXTERNAL_NOTICE }
  },
}

/** 本地模型：需要随包分发的模型文件，M7 之后再做，这里只占位。 */
const local: TranslationProvider = {
  id: 'local',
  label: '本地模型（尚未接入）',
  sendsTextOverNetwork: false,
  available: () => false,
  translate: async () => ({ ok: false, reason: '本地翻译模型还没有接入，当前只能用外部网页翻译。' }),
}

/** 用户自己的 API Key：要先把 Key 存进系统凭据存储，这里只占位。 */
const userApi: TranslationProvider = {
  id: 'user-api',
  label: '你的 API Key（尚未接入）',
  sendsTextOverNetwork: true,
  available: () => false,
  translate: async () => ({ ok: false, reason: '还没有做 API Key 管理，当前只能用外部网页翻译。' }),
}

const PROVIDERS: TranslationProvider[] = [externalWeb, local, userApi]

export function listTranslationProviders(): TranslationProvider[] {
  return [...PROVIDERS]
}

/** 选默认 provider：能用的第一个；都不能用时仍然返回外部网页翻译（它会给出明确失败原因）。 */
export function getTranslationProvider(id?: TranslationProviderId): TranslationProvider {
  if (id) {
    const found = PROVIDERS.find((provider) => provider.id === id)
    if (found) return found
  }
  return PROVIDERS.find((provider) => provider.available()) ?? externalWeb
}
