export type KnowledgeNodeType = 'book' | 'highlight' | 'note' | 'topic'

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
