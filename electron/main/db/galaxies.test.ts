import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import type { KnowledgeGraphData } from '../../../src/types/knowledge.ts'
import { openDatabase } from './connection.ts'
import { runMigrations } from './migrate.ts'
import {
  DEFAULT_GALAXY_ID,
  createGalaxy,
  deleteGalaxy,
  loadGalaxyUniverse,
  saveGalaxyPosition,
  setGalaxyMembership,
  updateGalaxy,
} from './galaxies.ts'

const graph: KnowledgeGraphData = {
  nodes: [
    { id: 'note:a', type: 'note', title: 'A', content: '', metadata: {}, createdAt: '', updatedAt: '' },
    { id: 'note:b', type: 'note', title: 'B', content: '', metadata: {}, createdAt: '', updatedAt: '' },
  ],
  links: [],
  layouts: [],
  version: 1,
}

let db: DatabaseSync
beforeEach(() => { db = openDatabase(':memory:'); runMigrations(db) })
afterEach(() => db.close())

describe('galaxy repository', () => {
  it('puts unassigned knowledge in one default galaxy without copying entities', () => {
    const universe = loadGalaxyUniverse(db, graph)
    expect(universe.galaxies).toHaveLength(1)
    expect(universe.memberships.map((item) => item.nodeId).sort()).toEqual(['note:a', 'note:b'])
    expect(loadGalaxyUniverse(db, graph).memberships).toHaveLength(2)
  })

  it('creates, edits, moves and assigns a real galaxy', () => {
    loadGalaxyUniverse(db, graph)
    const id = createGalaxy(db, { name: '医学', color: '#55aaff' })
    updateGalaxy(db, id, { name: '临床医学', description: '证据与病例', color: '#66bbdd' })
    saveGalaxyPosition(db, id, { x: 12, y: -3, z: 18 })
    setGalaxyMembership(db, id, 'note:a', true)
    const universe = loadGalaxyUniverse(db, graph)
    expect(universe.galaxies.find((item) => item.id === id)).toMatchObject({ name: '临床医学', color: '#66bbdd' })
    expect(universe.layouts.find((item) => item.galaxyId === id)).toMatchObject({ x: 12, y: -3, z: 18 })
    expect(universe.memberships.filter((item) => item.nodeId === 'note:a')).toHaveLength(2)
  })

  it('deleting a galaxy preserves knowledge membership by rehoming orphans', () => {
    loadGalaxyUniverse(db, graph)
    const id = createGalaxy(db, { name: '暂存' })
    setGalaxyMembership(db, id, 'note:a', true)
    setGalaxyMembership(db, DEFAULT_GALAXY_ID, 'note:a', false)
    deleteGalaxy(db, id)
    const universe = loadGalaxyUniverse(db, graph)
    expect(universe.galaxies.some((item) => item.id === id)).toBe(false)
    expect(universe.memberships).toContainEqual(expect.objectContaining({ galaxyId: DEFAULT_GALAXY_ID, nodeId: 'note:a' }))
    expect(() => deleteGalaxy(db, DEFAULT_GALAXY_ID)).toThrow(/不能删除/)
  })
})
