import { describe, expect, it } from 'vitest'
import { resolveResearchMobileMode, toMobileUserAgent } from './research'

describe('resolveResearchMobileMode', () => {
  it('自动模式只在紧凑栏使用移动 UA', () => {
    expect(resolveResearchMobileMode('auto', true)).toBe(true)
    expect(resolveResearchMobileMode('auto', false)).toBe(false)
  })

  it('用户覆盖优先于布局', () => {
    expect(resolveResearchMobileMode('mobile', false)).toBe(true)
    expect(resolveResearchMobileMode('desktop', true)).toBe(false)
  })
})

describe('toMobileUserAgent', () => {
  it('保留 Chromium 版本并移除 Electron 桌面标识', () => {
    const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Electron/45.4.1 Safari/537.36'
    const mobile = toMobileUserAgent(desktop)
    expect(mobile).toContain('(Linux; Android 14; Pixel 8)')
    expect(mobile).toContain('Chrome/142.0.0.0')
    expect(mobile).toContain('Mobile Safari/537.36')
    expect(mobile).not.toContain('Electron/')
  })
})
