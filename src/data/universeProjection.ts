import type { KnowledgeGraphData } from '../types/knowledge.ts'
import type { GalaxyUniverse, IntergalacticConnection } from '../types/universe.ts'

const DEMO_COLORS = ['#7f8cff', '#64b6d9', '#d08adf', '#d7a45e', '#72c7a2', '#a98ce5']

/** 浏览器预览没有 SQLite，只根据演示节点的 discipline 生成明确标注的临时宇宙。 */
export function prototypeUniverseFromGraph(graph: KnowledgeGraphData): GalaxyUniverse {
  const disciplines = [...new Set(graph.nodes.map((node) => String(node.metadata.discipline ?? '未分类')))].sort()
  const now = 'prototype'
  const galaxies = disciplines.map((discipline, index) => ({
    id: `prototype-galaxy:${discipline}`,
    name: graph.nodes.find((node) => String(node.metadata.discipline ?? '未分类') === discipline && node.type === 'topic')?.title ?? discipline,
    description: '浏览器演示星系，不写入正式书库。',
    color: DEMO_COLORS[index % DEMO_COLORS.length],
    isDefault: index === 0,
    createdAt: now,
    updatedAt: now,
  }))
  const layouts = galaxies.map((galaxy, index) => {
    const angle = index * ((Math.PI * 2) / Math.max(1, galaxies.length)) - Math.PI / 2
    const radius = galaxies.length <= 1 ? 0 : 43
    return {
      galaxyId: galaxy.id,
      x: Math.cos(angle) * radius,
      y: (index % 2 === 0 ? -1 : 1) * (4 + index % 3),
      z: Math.sin(angle) * radius,
      scale: 0.86 + (index % 3) * 0.08,
      density: 0.8,
      armCount: 3 + index % 3,
      tightness: 0.95 + index * 0.08,
      rotationSpeed: 0.009 + index * 0.0015,
    }
  })
  const galaxyByDiscipline = new Map(disciplines.map((discipline, index) => [discipline, galaxies[index].id]))
  const memberships = graph.nodes.map((node) => ({
    galaxyId: galaxyByDiscipline.get(String(node.metadata.discipline ?? '未分类')) ?? galaxies[0]?.id ?? 'prototype-galaxy:未分类',
    nodeId: node.id,
    createdAt: now,
  }))
  return { galaxies, layouts, memberships }
}

export function nodeIdsForGalaxy(universe: GalaxyUniverse, galaxyId: string): Set<string> {
  return new Set(universe.memberships.filter((item) => item.galaxyId === galaxyId).map((item) => item.nodeId))
}

export function filterGraphForGalaxy(
  graph: KnowledgeGraphData,
  universe: GalaxyUniverse,
  galaxyId: string,
): KnowledgeGraphData {
  const ids = nodeIdsForGalaxy(universe, galaxyId)
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => ids.has(node.id)),
    links: graph.links.filter((link) => ids.has(link.sourceId) && ids.has(link.targetId)),
    layouts: graph.layouts.filter((layout) => ids.has(layout.nodeId)),
  }
}

/**
 * 把真实知识边聚合成星系之间的光带。一个知识对象可以属于多个星系，
 * 所以同一条知识边可能贡献给多组星系；同一星系内部的边不进入宇宙总览。
 */
export function aggregateIntergalacticConnections(
  graph: KnowledgeGraphData,
  universe: GalaxyUniverse,
): IntergalacticConnection[] {
  const galaxiesByNode = new Map<string, string[]>()
  universe.memberships.forEach((membership) => {
    const current = galaxiesByNode.get(membership.nodeId) ?? []
    if (!current.includes(membership.galaxyId)) current.push(membership.galaxyId)
    galaxiesByNode.set(membership.nodeId, current)
  })
  const validGalaxies = new Set(universe.galaxies.map((galaxy) => galaxy.id))
  const grouped = new Map<string, { sourceGalaxyId: string; targetGalaxyId: string; linkIds: Set<string> }>()

  graph.links.forEach((link) => {
    const sources = galaxiesByNode.get(link.sourceId) ?? []
    const targets = galaxiesByNode.get(link.targetId) ?? []
    sources.forEach((sourceId) => targets.forEach((targetId) => {
      if (sourceId === targetId || !validGalaxies.has(sourceId) || !validGalaxies.has(targetId)) return
      const [left, right] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId]
      const key = `${left}|${right}`
      const item = grouped.get(key) ?? { sourceGalaxyId: left, targetGalaxyId: right, linkIds: new Set<string>() }
      item.linkIds.add(link.id)
      grouped.set(key, item)
    }))
  })

  return [...grouped.entries()].map(([key, item]) => ({
    id: `intergalactic:${key}`,
    sourceGalaxyId: item.sourceGalaxyId,
    targetGalaxyId: item.targetGalaxyId,
    knowledgeLinkIds: [...item.linkIds].sort(),
    count: item.linkIds.size,
  })).sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
}

export function membershipCount(universe: GalaxyUniverse, galaxyId: string): number {
  return universe.memberships.filter((item) => item.galaxyId === galaxyId).length
}
