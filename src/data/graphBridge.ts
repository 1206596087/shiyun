import type { KnowledgeGraphData } from '../types/knowledge'

/**
 * 银河图的数据入口。
 *
 * 桌面端从主进程读 SQLite 投影出来的图；浏览器演示模式没有数据库，
 * 继续用 localStorage 里的原型图谱（见 knowledgeRepository.ts）。
 * 这个文件是 App.tsx 唯一需要知道的「图从哪来」。
 */

export type GraphMode = 'library' | 'prototype'

export interface GraphBridge {
  mode: GraphMode
  /** 拉一次最新图；prototype 模式返回 null（调用方保留本地图谱）。 */
  load: () => Promise<KnowledgeGraphData | null>
  /** 用户拖动一颗星 → 固定坐标。prototype 模式没有持久化，返回 false。 */
  pin: (nodeId: string, position: { x: number; y: number; z: number }) => Promise<boolean>
  /** 取消固定，回到自动布局。 */
  unpin: (nodeId: string) => Promise<boolean>
}

const prototypeBridge: GraphBridge = {
  mode: 'prototype',
  load: async () => null,
  pin: async () => false,
  unpin: async () => false,
}

export function getGraphBridge(): GraphBridge {
  const api = window.shiyunDesktop?.graph
  if (!api) return prototypeBridge
  return {
    mode: 'library',
    load: () => api.load(),
    pin: async (nodeId, position) => {
      await api.pin(nodeId, position)
      return true
    },
    unpin: (nodeId) => api.unpin(nodeId),
  }
}
