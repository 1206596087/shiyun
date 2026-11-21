import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BackgroundStars } from './BackgroundStars'
import type { GalaxyConfig } from '../../types/galaxy'
import type { GalaxyUniverse, IntergalacticConnection, KnowledgeGalaxy } from '../../types/universe'
import { hashString, mulberry32 } from '../../utils/random'

interface Props {
  active: boolean
  paused: boolean
  config: GalaxyConfig
  universe: GalaxyUniverse
  connections: IntergalacticConnection[]
  selectedGalaxyId: string | null
  selectedConnectionId: string | null
  enteringGalaxyId: string | null
  onSelectGalaxy: (id: string) => void
  onSelectConnection: (id: string) => void
  onRequestEnter: (id: string) => void
  onEnterGalaxy: (id: string) => void
  onMoveGalaxy: (id: string, position: [number, number, number]) => void
  onMoveGalaxyEnd: (id: string, position: [number, number, number]) => void
  onClearSelection: () => void
}

export function UniverseScene(props: Props) {
  const dpr: [number, number] = props.config.quality === 'high' ? [1, 1.7] : props.config.quality === 'low' ? [0.65, 1] : [0.85, 1.35]
  return (
    <Canvas
      className="galaxy-canvas"
      dpr={dpr}
      camera={{ position: [0, 72, 128], fov: 46, near: 0.1, far: 700 }}
      gl={{ antialias: props.config.quality !== 'low', powerPreference: 'high-performance', alpha: false }}
      frameloop={props.active ? 'always' : 'never'}
      onCreated={({ gl, scene }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 0.98
        scene.background = new THREE.Color('#01020a')
        scene.fog = new THREE.FogExp2('#02030c', 0.0027)
      }}
      onPointerMissed={props.onClearSelection}
    >
      <ambientLight intensity={0.16} color="#788dff" />
      <BackgroundStars config={props.config} mode="universe" />
      <UniverseLayer {...props} />
      <UniverseCamera
        entering={props.enteringGalaxyId ? layoutPosition(props.universe, props.enteringGalaxyId) : null}
        enteringId={props.enteringGalaxyId}
        onArrive={props.onEnterGalaxy}
      />
      {props.config.bloomIntensity > 0.02 && (
        <EffectComposer multisampling={props.config.quality === 'high' ? 2 : 0}>
          <Bloom intensity={props.config.bloomIntensity * 0.72} luminanceThreshold={0.48} luminanceSmoothing={0.42} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  )
}

function layoutPosition(universe: GalaxyUniverse, galaxyId: string): [number, number, number] | null {
  const layout = universe.layouts.find((item) => item.galaxyId === galaxyId)
  return layout ? [layout.x, layout.y, layout.z] : null
}

function UniverseLayer(props: Props) {
  const { camera, raycaster, gl } = useThree()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragging = useRef<{ id: string; y: number; moved: boolean; last: [number, number, number] } | null>(null)
  const layoutMap = useMemo(() => new Map(props.universe.layouts.map((item) => [item.galaxyId, item])), [props.universe.layouts])
  const onMoveGalaxy = props.onMoveGalaxy
  const onMoveGalaxyEnd = props.onMoveGalaxyEnd

  useEffect(() => {
    if (!draggingId) return undefined
    const move = (event: PointerEvent) => {
      const info = dragging.current
      if (!info) return
      const rect = gl.domElement.getBoundingClientRect()
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const point = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -info.y), point)) return
      info.moved = true
      info.last = [point.x, info.y, point.z]
      onMoveGalaxy(info.id, info.last)
    }
    const stop = () => {
      const info = dragging.current
      dragging.current = null
      setDraggingId(null)
      document.body.style.cursor = 'default'
      if (info?.moved) onMoveGalaxyEnd(info.id, info.last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [camera, draggingId, gl, onMoveGalaxy, onMoveGalaxyEnd, raycaster, raycaster.ray])

  return (
    <group>
      {props.connections.map((connection) => {
        const source = layoutMap.get(connection.sourceGalaxyId)
        const target = layoutMap.get(connection.targetGalaxyId)
        if (!source || !target) return null
        return (
          <IntergalacticRibbon
            key={connection.id}
            connection={connection}
            source={[source.x, source.y, source.z]}
            target={[target.x, target.y, target.z]}
            selected={props.selectedConnectionId === connection.id}
            onSelect={props.onSelectConnection}
          />
        )
      })}
      {props.universe.galaxies.map((galaxy) => {
        const layout = layoutMap.get(galaxy.id)
        if (!layout) return null
        return (
          <OverviewGalaxy
            key={galaxy.id}
            galaxy={galaxy}
            position={[layout.x, layout.y, layout.z]}
            scale={layout.scale}
            density={layout.density}
            armCount={layout.armCount}
            tightness={layout.tightness}
            rotationSpeed={layout.rotationSpeed}
            quality={props.config.quality}
            paused={props.paused}
            selected={props.selectedGalaxyId === galaxy.id}
            dragging={draggingId === galaxy.id}
            onSelect={props.onSelectGalaxy}
            onEnter={(id) => props.onSelectGalaxy(id)}
            onDoubleEnter={props.onRequestEnter}
            onDragStart={(id) => {
              const current = layoutMap.get(id)
              if (!current) return
              dragging.current = { id, y: current.y, moved: false, last: [current.x, current.y, current.z] }
              setDraggingId(id)
              document.body.style.cursor = 'grabbing'
            }}
          />
        )
      })}
    </group>
  )
}

function OverviewGalaxy({
  galaxy, position, scale, density, armCount, tightness, rotationSpeed, quality, paused, selected, dragging,
  onSelect, onEnter, onDoubleEnter, onDragStart,
}: {
  galaxy: KnowledgeGalaxy
  position: [number, number, number]
  scale: number
  density: number
  armCount: number
  tightness: number
  rotationSpeed: number
  quality: GalaxyConfig['quality']
  paused: boolean
  selected: boolean
  dragging: boolean
  onSelect: (id: string) => void
  onEnter: (id: string) => void
  onDoubleEnter: (id: string) => void
  onDragStart: (id: string) => void
}) {
  const group = useRef<THREE.Group>(null)
  const pointCount = Math.round((quality === 'high' ? 2600 : quality === 'low' ? 720 : 1500) * Math.max(0.5, density))
  const { geometry, material } = useMemo(() => {
    const random = mulberry32(hashString(galaxy.id))
    const positions = new Float32Array(pointCount * 3)
    const colors = new Float32Array(pointCount * 3)
    const base = new THREE.Color(galaxy.color)
    const core = new THREE.Color('#fff0c9')
    const mixed = new THREE.Color()
    for (let index = 0; index < pointCount; index += 1) {
      const offset = index * 3
      const normalized = Math.pow(random(), 0.62)
      const radius = 0.22 + normalized * 5.5
      const branch = index % armCount
      const angle = branch / armCount * Math.PI * 2 + tightness * normalized * Math.PI * 1.85 + (random() - 0.5) * (0.18 + normalized * 0.5)
      positions[offset] = Math.cos(angle) * radius + (random() - 0.5) * normalized * 0.35
      positions[offset + 1] = (random() - 0.5) * (0.25 + (1 - normalized) * 0.75)
      positions[offset + 2] = Math.sin(angle) * radius + (random() - 0.5) * normalized * 0.35
      mixed.copy(core).lerp(base, Math.min(1, normalized * 1.2)).multiplyScalar(0.62 + Math.pow(random(), 3) * 1.15)
      colors[offset] = mixed.r
      colors[offset + 1] = mixed.g
      colors[offset + 2] = mixed.b
    }
    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    nextGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const nextMaterial = new THREE.PointsMaterial({
      size: quality === 'low' ? 0.13 : 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    return { geometry: nextGeometry, material: nextMaterial }
  }, [armCount, galaxy.color, galaxy.id, pointCount, quality, tightness])

  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useFrame((_, delta) => {
    if (!paused && group.current && !dragging) group.current.rotation.y += delta * rotationSpeed
  })

  return (
    <group position={position} scale={scale}>
      <group ref={group} rotation={[0.08, 0, -0.07]}>
        <points geometry={geometry} material={material} frustumCulled />
        <mesh scale={selected ? 1.42 : 1}>
          <sphereGeometry args={[0.72, 18, 18]} />
          <meshBasicMaterial color="#ffe4a9" transparent opacity={selected ? 0.82 : 0.52} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
      <mesh
        onPointerDown={(event) => { event.stopPropagation(); onDragStart(galaxy.id) }}
        onClick={(event) => { event.stopPropagation(); onSelect(galaxy.id); onEnter(galaxy.id) }}
        onDoubleClick={(event) => { event.stopPropagation(); onDoubleEnter(galaxy.id) }}
        onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'grab' }}
        onPointerOut={() => { if (!dragging) document.body.style.cursor = 'default' }}
      >
        <sphereGeometry args={[6.4, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html center distanceFactor={42} position={[0, 4.8, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`galaxy-overview-label${selected ? ' is-selected' : ''}`}>
          <strong>{galaxy.name}</strong><span>{galaxy.isDefault ? '默认星系' : '双击进入'}</span>
        </div>
      </Html>
    </group>
  )
}

function IntergalacticRibbon({ connection, source, target, selected, onSelect }: {
  connection: IntergalacticConnection
  source: [number, number, number]
  target: [number, number, number]
  selected: boolean
  onSelect: (id: string) => void
}) {
  const midpoint: [number, number, number] = [
    (source[0] + target[0]) / 2,
    (source[1] + target[1]) / 2 + Math.min(13, 4 + connection.count * 0.75),
    (source[2] + target[2]) / 2,
  ]
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...source), new THREE.Vector3(...midpoint), new THREE.Vector3(...target))
  const points = curve.getPoints(32).map((point) => [point.x, point.y, point.z] as [number, number, number])
  return (
    <group>
      <Line points={points} color={selected ? '#f9df9b' : '#7f9ee8'} lineWidth={selected ? 2.4 : Math.min(1.8, 0.65 + connection.count * 0.14)} transparent opacity={selected ? 0.82 : 0.28} />
      <mesh position={midpoint} onClick={(event) => { event.stopPropagation(); onSelect(connection.id) }}>
        <sphereGeometry args={[selected ? 1.15 : 0.82, 14, 14]} />
        <meshBasicMaterial color={selected ? '#ffeab4' : '#7997e4'} transparent opacity={selected ? 0.5 : 0.14} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function UniverseCamera({ entering, enteringId, onArrive }: {
  entering: [number, number, number] | null
  enteringId: string | null
  onArrive: (id: string) => void
}) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()
  const delivered = useRef<string | null>(null)
  useEffect(() => { if (enteringId !== delivered.current) delivered.current = null }, [enteringId])
  useFrame((_, delta) => {
    if (!entering || !enteringId || !controls.current || delivered.current === enteringId) return
    const target = new THREE.Vector3(...entering)
    const desired = target.clone().add(new THREE.Vector3(0, 9, 20))
    const alpha = 1 - Math.exp(-delta * 2.5)
    camera.position.lerp(desired, alpha)
    controls.current.target.lerp(target, alpha)
    controls.current.update()
    if (camera.position.distanceTo(desired) < 0.5 && controls.current.target.distanceTo(target) < 0.28) {
      delivered.current = enteringId
      onArrive(enteringId)
    }
  })
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!enteringId}
      enableDamping
      dampingFactor={0.05}
      minDistance={24}
      maxDistance={260}
      maxPolarAngle={Math.PI * 0.9}
    />
  )
}
