import { describe, expect, it } from 'vitest'
import { externalTranslationUrl, getTranslationProvider, listTranslationProviders } from './translation.ts'

describe('translation providers', () => {
  it('默认选中外部网页翻译，并明确说明会联网', () => {
    const provider = getTranslationProvider()
    expect(provider.id).toBe('external-web')
    expect(provider.available()).toBe(true)
    expect(provider.sendsTextOverNetwork).toBe(true)
  })

  it('本地模型与用户 API Key 目前不可用（不假装能用）', () => {
    const providers = listTranslationProviders()
    expect(providers.find((item) => item.id === 'local')?.available()).toBe(false)
    expect(providers.find((item) => item.id === 'user-api')?.available()).toBe(false)
  })

  it('外部网页翻译只把选中文字带进地址，不夹带别的字段', async () => {
    const provider = getTranslationProvider('external-web')
    const result = await provider.translate({ text: '  优势比  ', targetLang: 'zh-Hans' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const url = new URL(result.url)
    expect(url.hostname).toBe('www.bing.com')
    expect(url.searchParams.get('text')).toBe('优势比')
    expect(url.searchParams.get('to')).toBe('zh-Hans')
    expect(result.notice).toContain('Bing Translator')
  })

  it('空选区给出可读的失败原因', async () => {
    const result = await getTranslationProvider('external-web').translate({ text: '   ', targetLang: 'zh-Hans' })
    expect(result).toEqual({ ok: false, reason: '没有选中文字。' })
  })

  it('超长文字会被截断，不会把整章塞进 URL', () => {
    const url = new URL(externalTranslationUrl({ text: 'x'.repeat(5000), targetLang: 'zh-Hans' }))
    expect(url.searchParams.get('text')?.length).toBe(1200)
  })
})
