import type { KnowledgeGraphData } from '../types/knowledge'
import type { CreateGalaxyInput, GalaxyPositionInput, GalaxyUniverse, UpdateGalaxyInput } from '../types/universe'
import { prototypeUniverseFromGraph } from './universeProjection'

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
  loadUniverse: (graph: KnowledgeGraphData) => Promise<GalaxyUniverse>
  createGalaxy: (input: CreateGalaxyInput) => Promise<GalaxyUniverse | null>
  updateGalaxy: (galaxyId: string, patch: UpdateGalaxyInput) => Promise<GalaxyUniverse | null>
  moveGalaxy: (galaxyId: string, position: GalaxyPositionInput) => Promise<GalaxyUniverse | null>
  setMembership: (galaxyId: string, nodeId: string, included: boolean) => Promise<GalaxyUniverse | null>
  deleteGalaxy: (galaxyId: string) => Promise<GalaxyUniverse | null>
}

const prototypeBridge: GraphBridge = {
  mode: 'prototype',
  load: async () => null,
  pin: async () => false,
  unpin: async () => false,
  loadUniverse: async (graph) => prototypeUniverseFromGraph(graph),
  createGalaxy: async () => null,
  updateGalaxy: async () => null,
  moveGalaxy: async () => null,
  setMembership: async () => null,
  deleteGalaxy: async () => null,
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
    loadUniverse: () => api.loadUniverse(),
    createGalaxy: (input) => api.createGalaxy(input),
    updateGalaxy: (galaxyId, patch) => api.updateGalaxy(galaxyId, patch),
    moveGalaxy: (galaxyId, position) => api.moveGalaxy(galaxyId, position),
    setMembership: (galaxyId, nodeId, included) => api.setMembership(galaxyId, nodeId, included),
    deleteGalaxy: (galaxyId) => api.deleteGalaxy(galaxyId),
  }
}
