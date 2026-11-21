import type { KnowledgeGraphData } from '../types/knowledge'
import { INITIAL_KNOWLEDGE_GRAPH } from './mockKnowledge'

const STORAGE_KEY = 'shiyun-prototype-knowledge-v1'

export function loadKnowledgeGraph(): KnowledgeGraphData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved) as KnowledgeGraphData
  } catch (error) {
    console.warn('无法读取本地原型数据，已恢复演示数据。', error)
  }
  return structuredClone(INITIAL_KNOWLEDGE_GRAPH)
}

export function saveKnowledgeGraph(graph: KnowledgeGraphData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(graph))
}

export function validateKnowledgeGraph(value: unknown): KnowledgeGraphData {
  if (!value || typeof value !== 'object') throw new Error('JSON 不是有效对象')
  const graph = value as Partial<KnowledgeGraphData>
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.links) || !Array.isArray(graph.layouts)) {
    throw new Error('JSON 必须包含 nodes、links 与 layouts 数组')
  }
  return { nodes: graph.nodes, links: graph.links, layouts: graph.layouts, version: Number(graph.version ?? 1) }
}
