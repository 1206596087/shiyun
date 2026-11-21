export interface KnowledgeGalaxy {
  id: string
  name: string
  description: string
  color: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface GalaxyLayout {
  galaxyId: string
  x: number
  y: number
  z: number
  scale: number
  density: number
  armCount: number
  tightness: number
  rotationSpeed: number
}

export interface GalaxyMembership {
  galaxyId: string
  nodeId: string
  createdAt: string
}

export interface GalaxyUniverse {
  galaxies: KnowledgeGalaxy[]
  layouts: GalaxyLayout[]
  memberships: GalaxyMembership[]
}

export interface IntergalacticConnection {
  id: string
  sourceGalaxyId: string
  targetGalaxyId: string
  knowledgeLinkIds: string[]
  count: number
}

export interface CreateGalaxyInput {
  name: string
  description?: string
  color?: string
}

export interface UpdateGalaxyInput {
  name?: string
  description?: string
  color?: string
}

export interface GalaxyPositionInput {
  x: number
  y: number
  z: number
}
