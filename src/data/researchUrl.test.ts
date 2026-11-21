import { describe, expect, it } from 'vitest'
import { buildSearchUrl, displayUrl, HOME_URL, isAllowedResearchUrl, toNavigableUrl } from './researchUrl'

describe('toNavigableUrl', () => {
  it('keeps http and https urls as they are', () => {
    expect(toNavigableUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(toNavigableUrl('http://example.org')).toBe('http://example.org')
  })

  it('adds https to a bare host', () => {
    expect(toNavigableUrl('example.com')).toBe('https://example.com')
    expect(toNavigableUrl('www.pubmed.ncbi.nlm.nih.gov/123')).toBe('https://www.pubmed.ncbi.nlm.nih.gov/123')
  })

  it('turns plain words into a search', () => {
    expect(toNavigableUrl('OR 与 RR 的区别')).toBe(buildSearchUrl('OR 与 RR 的区别'))
  })

  it('never passes local or book schemes through', () => {
    expect(toNavigableUrl('file:///C:/secret.txt')).toBe(buildSearchUrl('file:///C:/secret.txt'))
    expect(toNavigableUrl('shiyun-book://book/x/source.pdf')).toBe(buildSearchUrl('shiyun-book://book/x/source.pdf'))
    expect(toNavigableUrl('javascript:alert(1)')).toBe(buildSearchUrl('javascript:alert(1)'))
  })

  it('falls back to the home page for empty input', () => {
    expect(toNavigableUrl('   ')).toBe(HOME_URL)
  })

  it('does not treat a sentence with dots as a host', () => {
    expect(toNavigableUrl('what is e.g. this')).toBe(buildSearchUrl('what is e.g. this'))
  })
})

describe('isAllowedResearchUrl', () => {
  it('accepts only http and https', () => {
    expect(isAllowedResearchUrl('https://a.com')).toBe(true)
    expect(isAllowedResearchUrl('http://a.com')).toBe(true)
    expect(isAllowedResearchUrl('file:///C:/a')).toBe(false)
    expect(isAllowedResearchUrl('shiyun-book://book/x')).toBe(false)
    expect(isAllowedResearchUrl('not a url')).toBe(false)
  })
})

describe('displayUrl', () => {
  it('drops protocol and trailing slash', () => {
    expect(displayUrl('https://example.com/')).toBe('example.com')
    expect(displayUrl('https://www.bing.com/search?q=x')).toBe('www.bing.com/search?q=x')
  })
})
