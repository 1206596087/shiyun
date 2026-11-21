import { describe, expect, it } from 'vitest'
import { INITIAL_KNOWLEDGE_GRAPH } from './mockKnowledge'
import { validateKnowledgeGraph } from './knowledgeRepository'

describe('knowledge graph JSON prototype storage', () => {
  it('round-trips nodes, links and stable layouts without losing data', () => {
    const exported = JSON.stringify(INITIAL_KNOWLEDGE_GRAPH)
    const imported = validateKnowledgeGraph(JSON.parse(exported))

    expect(imported.nodes).toHaveLength(40)
    expect(imported.layouts).toHaveLength(imported.nodes.length)
    expect(imported.links).toHaveLength(INITIAL_KNOWLEDGE_GRAPH.links.length)
    expect(new Set(imported.layouts.map((layout) => layout.nodeId)).size).toBe(imported.nodes.length)
  })

  it('contains many-to-many and cross-discipline relations from data', () => {
    const connectedCounts = new Map<string, number>()
    INITIAL_KNOWLEDGE_GRAPH.links.forEach((link) => {
      connectedCounts.set(link.sourceId, (connectedCounts.get(link.sourceId) ?? 0) + 1)
      connectedCounts.set(link.targetId, (connectedCounts.get(link.targetId) ?? 0) + 1)
    })
    expect(Math.max(...connectedCounts.values())).toBeGreaterThan(4)
    expect(INITIAL_KNOWLEDGE_GRAPH.links.some((link) => link.relationType === 'analogy')).toBe(true)
    expect(INITIAL_KNOWLEDGE_GRAPH.links.some((link) => link.relationType === 'questions')).toBe(true)
  })
})
