import { useMemo, useRef, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { KnowledgeGraphData, KnowledgeLink, KnowledgeNode, KnowledgeNodeType } from '../../types/knowledge'
import type { ViewMode } from '../../types/galaxy'

interface Props {
  graph: KnowledgeGraphData
  mode: ViewMode
  selectedNodeId: string | null
  selectedLinkId: string | null
  visibleTypes: Set<KnowledgeNodeType>
  onSelectNode: (id: string) => void
  onSelectLink: (id: string) => void
  onFocusNode: (id: string) => void
}

const NODE_STYLE: Record<KnowledgeNodeType, { color: string; emissive: string; size: number }> = {
  book: { color: '#9ad8ff', emissive: '#287dff', size: 0.34 },
  highlight: { color: '#ffd889', emissive: '#ff9f32', size: 0.19 },
  note: { color: '#e5c4ff', emissive: '#a467ff', size: 0.27 },
  topic: { color: '#7aa9ff', emissive: '#704cff', size: 0.48 },
}

function connectedSet(graph: KnowledgeGraphData, selectedId: string | null, depth: number) {
  if (!selectedId) return new Set<string>()
  const found = new Set([selectedId])
  let frontier = new Set([selectedId])
  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>()
    graph.links.forEach((link) => {
      if (frontier.has(link.sourceId) && !found.has(link.targetId)) next.add(link.targetId)
      if (frontier.has(link.targetId) && !found.has(link.sourceId)) next.add(link.sourceId)
    })
    next.forEach((id) => found.add(id))
    frontier = next
  }
  return found
}

export function KnowledgeLayer(props: Props) {
  const { graph, selectedNodeId, visibleTypes, mode } = props
  const layoutMap = useMemo(() => new Map(graph.layouts.map((layout) => [layout.nodeId, layout])), [graph.layouts])
  const related = useMemo(() => connectedSet(graph, selectedNodeId, mode === 'focus' ? 2 : 1), [graph, mode, selectedNodeId])
  const activeLinkIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>()
    return new Set(graph.links.filter((link) => link.sourceId === selectedNodeId || link.targetId === selectedNodeId).map((link) => link.id))
  }, [graph.links, selectedNodeId])

  return (
    <group>
      {graph.links.map((link) => {
        const source = layoutMap.get(link.sourceId)
        const target = layoutMap.get(link.targetId)
        if (!source || !target) return null
        const sourceNode = graph.nodes.find((node) => node.id === link.sourceId)
        const targetNode = graph.nodes.find((node) => node.id === link.targetId)
        if (!sourceNode || !targetNode || !visibleTypes.has(sourceNode.type) || !visibleTypes.has(targetNode.type)) return null
        const visibleInFocus = !selectedNodeId || related.has(link.sourceId) && related.has(link.targetId)
        return (
          <KnowledgeLinkLine
            key={link.id}
            link={link}
            source={[source.x, source.y, source.z]}
            target={[target.x, target.y, target.z]}
            active={activeLinkIds.has(link.id)}
            selected={props.selectedLinkId === link.id}
            dimmed={(mode === 'focus' && !visibleInFocus) || (!!selectedNodeId && !activeLinkIds.has(link.id))}
            onSelect={props.onSelectLink}
          />
        )
      })}
      {graph.nodes.map((node) => {
        const layout = layoutMap.get(node.id)
        if (!layout || !visibleTypes.has(node.type)) return null
        const dimmed = mode === 'focus' && !!selectedNodeId && !related.has(node.id)
        return (
          <KnowledgeNodeMesh
            key={node.id}
            node={node}
            position={[layout.x, layout.y, layout.z]}
            selected={node.id === selectedNodeId}
            adjacent={related.has(node.id)}
            dimmed={dimmed}
            onSelect={props.onSelectNode}
            onFocus={props.onFocusNode}
          />
        )
      })}
    </group>
  )
}

function KnowledgeLinkLine({
  link,
  source,
  target,
  active,
  selected,
  dimmed,
  onSelect,
}: {
  link: KnowledgeLink
  source: [number, number, number]
  target: [number, number, number]
  active: boolean
  selected: boolean
  dimmed: boolean
  onSelect: (id: string) => void
}) {
  const points = useMemo(() => {
    const start = new THREE.Vector3(...source)
    const end = new THREE.Vector3(...target)
    const midpoint = start.clone().add(end).multiplyScalar(0.5)
    midpoint.y += Math.min(1.2, start.distanceTo(end) * 0.08)
    return new THREE.QuadraticBezierCurve3(start, midpoint, end).getPoints(18)
  }, [source, target])
  const crossDiscipline = link.relationType === 'analogy' || link.relationType === 'questions'
  const color = selected ? '#ffffff' : crossDiscipline ? '#b38aff' : active ? '#8bd8ff' : '#4f74a0'
  const opacity = dimmed ? 0.025 : selected ? 0.95 : active ? 0.72 : 0.14
  return (
    <Line
      points={points}
      color={color}
      lineWidth={selected ? 2.2 : active ? 1.25 : 0.55}
      transparent
      opacity={opacity}
      depthWrite={false}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(link.id)
      }}
    />
  )
}

function KnowledgeNodeMesh({
  node,
  position,
  selected,
  adjacent,
  dimmed,
  onSelect,
  onFocus,
}: {
  node: KnowledgeNode
  position: [number, number, number]
  selected: boolean
  adjacent: boolean
  dimmed: boolean
  onSelect: (id: string) => void
  onFocus: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [near, setNear] = useState(false)
  const frameCounter = useRef(0)
  const style = NODE_STYLE[node.type]
  useFrame(({ camera }) => {
    frameCounter.current += 1
    if (frameCounter.current % 18 === 0) setNear(camera.position.distanceTo(new THREE.Vector3(...position)) < 13)
  })
  const opacity = dimmed ? 0.12 : selected ? 1 : adjacent ? 0.94 : 0.78
  const showLabel = hovered || selected || (near && (node.type === 'book' || node.type === 'note'))

  return (
    <group position={position}>
      {node.type === 'topic' && (
        <mesh scale={2.8}>
          <sphereGeometry args={[style.size, 20, 20]} />
          <meshBasicMaterial color={style.emissive} transparent opacity={dimmed ? 0.015 : 0.055} depthWrite={false} />
        </mesh>
      )}
      <mesh
        scale={selected ? 1.35 : hovered ? 1.18 : 1}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'default'
        }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(node.id)
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          onFocus(node.id)
        }}
      >
        {node.type === 'book' ? <icosahedronGeometry args={[style.size, 2]} /> : <sphereGeometry args={[style.size, 20, 20]} />}
        <meshStandardMaterial
          color={style.color}
          emissive={style.emissive}
          emissiveIntensity={selected ? 4.8 : hovered ? 3.6 : 2.2}
          transparent
          opacity={opacity}
          roughness={0.22}
          metalness={0.08}
          depthWrite={!dimmed}
        />
      </mesh>
      <mesh scale={selected ? 2.7 : hovered ? 2.1 : 1.65}>
        <sphereGeometry args={[style.size, 16, 16]} />
        <meshBasicMaterial
          color={style.color}
          transparent
          opacity={dimmed ? 0.01 : selected ? 0.16 : 0.055}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
      {showLabel && (
        <Html center distanceFactor={10} position={[0, style.size + 0.28, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`star-label star-label--${node.type}`}>{node.title}</div>
        </Html>
      )}
    </group>
  )
}
