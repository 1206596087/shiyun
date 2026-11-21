import type { CreateClippingInput, UpdateClippingInput, WebClipping } from '../types/clipping.ts'

/**
 * 网页摘录的数据通道。
 *
 * 桌面版走 `window.shiyunDesktop.clippings`（主进程 + SQLite）；
 * 浏览器（`npm run dev:web`）降级为内存实现，保证界面能点、能看，但刷新即消失——
 * 与 ADR-011 里书库降级的策略一致，界面上会明说「演示数据」。
 */

export type ClippingMode = 'desktop' | 'demo'

export interface ClippingBridge {
  mode: ClippingMode
  list: () => Promise<WebClipping[]>
  get: (clippingId: string) => Promise<WebClipping | null>
  count: () => Promise<number>
  create: (input: CreateClippingInput) => Promise<WebClipping>
  update: (clippingId: string, input: UpdateClippingInput) => Promise<WebClipping>
  remove: (clippingId: string) => Promise<boolean>
  restore: (clippingId: string) => Promise<boolean>
  trash: () => Promise<WebClipping[]>
  toNote: (clippingId: string) => Promise<{ clipping: WebClipping; noteId: string; created: boolean }>
  captureSelection: (userNote?: string) => Promise<WebClipping | null>
}

function demoClipping(id: string, quote: string, pageTitle: string, url: string): WebClipping {
  const timestamp = new Date().toISOString()
  return {
    id,
    quote,
    pageTitle,
    url,
    capturedAt: timestamp,
    prefix: null,
    suffix: null,
    userNote: '',
    noteId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const demoStore: WebClipping[] = [
  demoClipping(
    'clip-demo-rr',
    '比值比（OR）在罕见结局下接近相对危险度（RR），但两者定义不同。',
    '比值比 - 维基百科',
    'https://zh.wikipedia.org/wiki/%E6%AF%94%E5%80%BC%E6%AF%94',
  ),
]

function createDemoBridge(): ClippingBridge {
  return {
    mode: 'demo',
    list: async () => [...demoStore],
    get: async (id) => demoStore.find((item) => item.id === id) ?? null,
    count: async () => demoStore.length,
    create: async (input) => {
      const clipping = demoClipping(`clip-demo-${demoStore.length + 1}`, input.quote, input.pageTitle ?? '', input.url)
      clipping.userNote = input.userNote ?? ''
      demoStore.unshift(clipping)
      return clipping
    },
    update: async (id, input) => {
      const found = demoStore.find((item) => item.id === id)
      if (!found) throw new Error('网页摘录不存在')
      if (input.userNote !== undefined) found.userNote = input.userNote
      found.updatedAt = new Date().toISOString()
      return found
    },
    remove: async (id) => {
      const index = demoStore.findIndex((item) => item.id === id)
      if (index >= 0) demoStore.splice(index, 1)
      return index >= 0
    },
    restore: async () => false,
    trash: async () => [],
    toNote: async (id) => {
      const found = demoStore.find((item) => item.id === id)
      if (!found) throw new Error('网页摘录不存在')
      // 演示模式没有笔记库，只回一个可用的假笔记 id，避免界面崩。
      found.noteId = found.noteId ?? `note-demo-${found.id}`
      return { clipping: found, noteId: found.noteId, created: true }
    },
    // 浏览器模式没有原生网页视图，取不到选区——按空处理，界面会给提示。
    captureSelection: async () => null,
  }
}

function createDesktopBridge(api: NonNullable<Window['shiyunDesktop']>['clippings']): ClippingBridge {
  return {
    mode: 'desktop',
    list: () => api.list(),
    get: (id) => api.get(id),
    count: () => api.count(),
    create: (input) => api.create(input),
    update: (id, input) => api.update(id, input),
    remove: (id) => api.remove(id),
    restore: (id) => api.restore(id),
    trash: () => api.trash(),
    toNote: (id) => api.toNote(id),
    captureSelection: (userNote) => api.captureSelection(userNote),
  }
}

export function getClippingBridge(): ClippingBridge {
  const api = typeof window === 'undefined' ? undefined : window.shiyunDesktop?.clippings
  return api ? createDesktopBridge(api) : createDemoBridge()
}
