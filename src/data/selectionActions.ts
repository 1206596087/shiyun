export type ResearchRequest = { url: string; newTab?: boolean }

export function translationUrl(text: string): string {
  const value = text.trim().slice(0, 2000)
  const chinese = (value.match(/[\u3400-\u9fff]/g)?.length ?? 0) > value.length / 4
  const params = new URLSearchParams({ from: 'auto', to: chinese ? 'en' : 'zh-Hans', text: value })
  return `https://www.bing.com/translator?${params.toString()}`
}

export function researchSearchUrl(text: string): string {
  return `https://www.bing.com/search?q=${encodeURIComponent(text.trim().slice(0, 500))}`
}
