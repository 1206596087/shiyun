import { expect, it } from 'vitest'
import { researchSearchUrl, translationUrl } from './selectionActions'

it('chooses a useful translation direction', () => {
  expect(translationUrl('极大似然估计')).toContain('to=en')
  expect(translationUrl('maximum likelihood estimation')).toContain('to=zh-Hans')
})

it('encodes and bounds selected text', () => {
  expect(researchSearchUrl('OR 与 RR')).toContain('OR%20%E4%B8%8E%20RR')
  expect(new URL(translationUrl('x'.repeat(3000))).searchParams.get('text')).toHaveLength(2000)
})
