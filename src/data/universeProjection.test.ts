import { describe, expect, it } from 'vitest'
import type { KnowledgeGraphData } from '../types/knowledge'
import type { GalaxyUniverse } from '../types/universe'
import { aggregateIntergalacticConnections, filterGraphForGalaxy, nodeIdsForGalaxy } from './universeProjection'

const graph: KnowledgeGraphData = {
  version: 1,
  nodes: [
    { id: 'note:a', type: 'note', title: 'A', content: '', metadata: {}, createdAt: '', updatedAt: '' },
    { id: 'note:b', type: 'note', title: 'B', content: '', metadata: {}, createdAt: '', updatedAt: '' },
    { id: 'book:c', type: 'book', title: 'C', content: '', metadata: {}, createdAt: '', updatedAt: '' },
  ],
  links: [
    { id: 'link:ab', sourceId: 'note:a', targetId: 'note:b', relationType: 'relates', description: '' },
    { id: 'link:bc', sourceId: 'note:b', targetId: 'book:c', relationType: 'supports', description: '' },
  ],
  layouts: [
    { nodeId: 'note:a', x: 1, y: 0, z: 0 },
    { nodeId: 'note:b', x: 2, y: 0, z: 0 },
    { nodeId: 'book:c', x: 3, y: 0, z: 0 },
  ],
}

const universe: GalaxyUniverse = {
  galaxies: [
    { id: 'g1', name: '一', description: '', color: '#7788ff', isDefault: true, createdAt: '', updatedAt: '' },
    { id: 'g2', name: '二', description: '', color: '#ffaa66', isDefault: false, createdAt: '', updatedAt: '' },
    { id: 'g3', name: '三', description: '', color: '#66ccaa', isDefault: false, createdAt: '', updatedAt: '' },
  ],
  layouts: [],
  memberships: [
    { galaxyId: 'g1', nodeId: 'note:a', createdAt: '' },
    { galaxyId: 'g1', nodeId: 'note:b', createdAt: '' },
    { galaxyId: 'g2', nodeId: 'note:b', createdAt: '' },
    { galaxyId: 'g2', nodeId: 'book:c', createdAt: '' },
    { galaxyId: 'g3', nodeId: 'book:c', createdAt: '' },
  ],
}

describe('universe projection', () => {
  it('filters a galaxy without duplicating original knowledge entities', () => {
    expect([...nodeIdsForGalaxy(universe, 'g2')].sort()).toEqual(['book:c', 'note:b'])
    const filtered = filterGraphForGalaxy(graph, universe, 'g2')
    expect(filtered.nodes.map((node) => node.id).sort()).toEqual(['book:c', 'note:b'])
    expect(filtered.links.map((link) => link.id)).toEqual(['link:bc'])
    expect(filtered.layouts).toHaveLength(2)
  })

  it('aggregates only real cross-galaxy knowledge links and deduplicates them', () => {
    const connections = aggregateIntergalacticConnections(graph, universe)
    expect(connections.find((item) => item.id === 'intergalactic:g1|g2')).toMatchObject({ count: 2 })
    expect(connections.find((item) => item.id === 'intergalactic:g2|g3')).toMatchObject({ count: 1 })
    expect(connections.every((item) => item.sourceGalaxyId !== item.targetGalaxyId)).toBe(true)
  })
})
