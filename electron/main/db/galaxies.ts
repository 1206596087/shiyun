import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { KnowledgeGraphData } from '../../../src/types/knowledge.ts'
import type {
  GalaxyLayout,
  GalaxyMembership,
  GalaxyUniverse,
  KnowledgeGalaxy,
} from '../../../src/types/universe.ts'
import { execute, queryAll, queryOne, transaction } from './connection.ts'

export const DEFAULT_GALAXY_ID = 'galaxy-default'

interface GalaxyRow {
  id: string
  name: string
  description: string
  color: string
  is_default: number
  created_at: string
  updated_at: string
}

interface LayoutRow {
  galaxy_id: string
  x: number
  y: number
  z: number
  scale: number
  density: number
  arm_count: number
  tightness: number
  rotation_speed: number
}

interface MembershipRow { galaxy_id: string; node_id: string; created_at: string }

function activeGalaxyIds(db: DatabaseSync): Set<string> {
  return new Set(queryAll<{ id: string }>(db, 'SELECT id FROM galaxies WHERE deleted_at IS NULL').map((row) => row.id))
}

/** 新知识节点如果还不属于任何星系，就进入默认星系；不复制原始实体。 */
export function ensureDefaultMemberships(db: DatabaseSync, graph: KnowledgeGraphData): number {
  const active = activeGalaxyIds(db)
  if (!active.has(DEFAULT_GALAXY_ID)) throw new Error('默认星系不存在，数据库迁移可能未完成')
  const existing = new Set(
    queryAll<{ node_id: string; galaxy_id: string }>(
      db,
      'SELECT node_id, galaxy_id FROM galaxy_memberships',
    ).filter((row) => active.has(row.galaxy_id)).map((row) => row.node_id),
  )
  const missing = graph.nodes.filter((node) => !existing.has(node.id))
  if (missing.length === 0) return 0
  const now = new Date().toISOString()
  transaction(db, () => {
    const statement = db.prepare(
      'INSERT OR IGNORE INTO galaxy_memberships (galaxy_id, node_id, created_at) VALUES (?, ?, ?)',
    )
    missing.forEach((node) => statement.run(DEFAULT_GALAXY_ID, node.id, now))
  })
  return missing.length
}

export function loadGalaxyUniverse(db: DatabaseSync, graph: KnowledgeGraphData): GalaxyUniverse {
  ensureDefaultMemberships(db, graph)
  const galaxies = queryAll<GalaxyRow>(
    db,
    `SELECT id, name, description, color, is_default, created_at, updated_at
       FROM galaxies WHERE deleted_at IS NULL ORDER BY is_default DESC, created_at, name`,
  ).map<KnowledgeGalaxy>((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  const layouts = queryAll<LayoutRow>(
    db,
    `SELECT galaxy_id, x, y, z, scale, density, arm_count, tightness, rotation_speed
       FROM galaxy_layouts`,
  ).map<GalaxyLayout>((row) => ({
    galaxyId: row.galaxy_id,
    x: row.x,
    y: row.y,
    z: row.z,
    scale: row.scale,
    density: row.density,
    armCount: row.arm_count,
    tightness: row.tightness,
    rotationSpeed: row.rotation_speed,
  }))
  const memberships = queryAll<MembershipRow>(
    db,
    `SELECT membership.galaxy_id, membership.node_id, membership.created_at
       FROM galaxy_memberships membership
       JOIN galaxies galaxy ON galaxy.id = membership.galaxy_id
      WHERE galaxy.deleted_at IS NULL`,
  ).map<GalaxyMembership>((row) => ({
    galaxyId: row.galaxy_id,
    nodeId: row.node_id,
    createdAt: row.created_at,
  }))
  return { galaxies, layouts, memberships }
}

export function createGalaxy(
  db: DatabaseSync,
  input: { name: string; description?: string; color?: string },
): string {
  const name = input.name.trim().slice(0, 80)
  if (!name) throw new Error('星系名称不能为空')
  const id = `galaxy-${randomUUID()}`
  const now = new Date().toISOString()
  const count = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM galaxies WHERE deleted_at IS NULL')?.count ?? 1
  const index = Math.max(0, Number(count) - 1)
  const angle = index * 2.399963229728653
  const radius = 34 + Math.sqrt(index + 1) * 10
  const color = /^#[0-9a-f]{6}$/i.test(input.color ?? '') ? input.color! : '#8b7dff'
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO galaxies (id, name, description, color, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      id,
      name,
      (input.description ?? '').trim().slice(0, 400),
      color,
      now,
      now,
    )
    execute(
      db,
      `INSERT INTO galaxy_layouts
       (galaxy_id, x, y, z, scale, density, arm_count, tightness, rotation_speed, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
      id,
      Math.cos(angle) * radius,
      ((index % 3) - 1) * 7,
      Math.sin(angle) * radius,
      3 + index % 4,
      0.94 + (index % 5) * 0.09,
      0.012 + (index % 4) * 0.003,
      now,
    )
  })
  return id
}

export function updateGalaxy(
  db: DatabaseSync,
  galaxyId: string,
  patch: { name?: string; description?: string; color?: string },
): void {
  const current = queryOne<GalaxyRow>(db, 'SELECT * FROM galaxies WHERE id = ? AND deleted_at IS NULL', galaxyId)
  if (!current) throw new Error('星系不存在')
  const name = patch.name === undefined ? current.name : patch.name.trim().slice(0, 80)
  if (!name) throw new Error('星系名称不能为空')
  const color = patch.color === undefined ? current.color : patch.color
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('星系颜色格式无效')
  execute(
    db,
    'UPDATE galaxies SET name = ?, description = ?, color = ?, updated_at = ? WHERE id = ?',
    name,
    patch.description === undefined ? current.description : patch.description.trim().slice(0, 400),
    color,
    new Date().toISOString(),
    galaxyId,
  )
}

export function saveGalaxyPosition(
  db: DatabaseSync,
  galaxyId: string,
  position: { x: number; y: number; z: number },
): void {
  const changed = db.prepare(
    'UPDATE galaxy_layouts SET x = ?, y = ?, z = ?, updated_at = ? WHERE galaxy_id = ?',
  ).run(position.x, position.y, position.z, new Date().toISOString(), galaxyId)
  if (changed.changes === 0) throw new Error('星系不存在')
}

export function setGalaxyMembership(db: DatabaseSync, galaxyId: string, nodeId: string, included: boolean): void {
  const galaxy = queryOne<{ id: string }>(db, 'SELECT id FROM galaxies WHERE id = ? AND deleted_at IS NULL', galaxyId)
  if (!galaxy) throw new Error('星系不存在')
  transaction(db, () => {
    if (included) {
      execute(
        db,
        'INSERT OR IGNORE INTO galaxy_memberships (galaxy_id, node_id, created_at) VALUES (?, ?, ?)',
        galaxyId,
        nodeId,
        new Date().toISOString(),
      )
      return
    }
    execute(db, 'DELETE FROM galaxy_memberships WHERE galaxy_id = ? AND node_id = ?', galaxyId, nodeId)
    const remaining = queryOne<{ count: number }>(
      db,
      `SELECT COUNT(*) AS count FROM galaxy_memberships membership
        JOIN galaxies galaxy ON galaxy.id = membership.galaxy_id
       WHERE membership.node_id = ? AND galaxy.deleted_at IS NULL`,
      nodeId,
    )?.count ?? 0
    if (Number(remaining) === 0) {
      execute(
        db,
        'INSERT OR IGNORE INTO galaxy_memberships (galaxy_id, node_id, created_at) VALUES (?, ?, ?)',
        DEFAULT_GALAXY_ID,
        nodeId,
        new Date().toISOString(),
      )
    }
  })
}

export function deleteGalaxy(db: DatabaseSync, galaxyId: string): void {
  if (galaxyId === DEFAULT_GALAXY_ID) throw new Error('默认星系不能删除')
  const nodeIds = queryAll<{ node_id: string }>(
    db,
    'SELECT node_id FROM galaxy_memberships WHERE galaxy_id = ?',
    galaxyId,
  ).map((row) => row.node_id)
  transaction(db, () => {
    execute(db, 'DELETE FROM galaxies WHERE id = ?', galaxyId)
    const now = new Date().toISOString()
    nodeIds.forEach((nodeId) => {
      const remaining = queryOne<{ count: number }>(
        db,
        'SELECT COUNT(*) AS count FROM galaxy_memberships WHERE node_id = ?',
        nodeId,
      )?.count ?? 0
      if (Number(remaining) === 0) {
        execute(
          db,
          'INSERT OR IGNORE INTO galaxy_memberships (galaxy_id, node_id, created_at) VALUES (?, ?, ?)',
          DEFAULT_GALAXY_ID,
          nodeId,
          now,
        )
      }
    })
  })
}
