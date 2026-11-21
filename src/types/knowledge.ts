/**
 * 银河节点种类。
 *
 * `clipping` 是 0.3.0 引入的网页摘录（`web_clippings` 表）。加这一类时
 * `knowledge_links` / `graph_layouts` 的 CHECK 约束必须一起放宽，
 * 用的是迁移 004 的「新表 → 复制 → 核对 → 换名」流程（见 DATABASE_SCHEMA 第 5 节）。
 */
export type KnowledgeNodeType = 'book' | 'highlight' | 'note' | 'topic' | 'clipping'

export interface KnowledgeNode {
  id: string
  type: KnowledgeNodeType
  title: string
  content: string
  metadata: Record<string, string | number | boolean>
  createdAt: string
  updatedAt: string
}

export interface KnowledgeLink {
  id: string
  sourceId: string
  targetId: string
  relationType: string
  description: string
}

export interface GraphLayout {
  nodeId: string
  x: number
  y: number
  z: number
}

export interface KnowledgeGraphData {
  nodes: KnowledgeNode[]
  links: KnowledgeLink[]
  layouts: GraphLayout[]
  version: number
}
