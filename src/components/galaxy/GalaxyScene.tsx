import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import { BackgroundStars } from './BackgroundStars'
import { CameraController } from './CameraController'
import { GalacticCore } from './GalacticCore'
import { GalaxyParticles } from './GalaxyParticles'
import { KnowledgeLayer } from '../knowledge/KnowledgeLayer'
import type { GalaxyConfig, ViewMode } from '../../types/galaxy'
import type { KnowledgeGraphData, KnowledgeNodeType } from '../../types/knowledge'

interface Props {
  active: boolean
  config: GalaxyConfig
  graph: KnowledgeGraphData
  mode: ViewMode
  paused: boolean
  selectedNodeId: string | null
  selectedLinkId: string | null
  visibleTypes: Set<KnowledgeNodeType>
  focusPosition: [number, number, number] | null
  resetToken: number
  onSelectNode: (id: string) => void
  onSelectLink: (id: string) => void
  onFocusNode: (id: string) => void
  onClearSelection: () => void
  /** M5：拖动星星固定位置（只有书库模式传入）。 */
  onNodeDrag?: (id: string, position: [number, number, number]) => void
  onNodeDragEnd?: (id: string, position: [number, number, number]) => void
  onDragStateChange?: (dragging: boolean) => void
  dragActive?: boolean
}

export function GalaxyScene(props: Props) {
  const { config } = props
  const dpr: [number, number] = config.quality === 'high' ? [1, 2] : config.quality === 'low' ? [0.75, 1] : [1, 1.5]
  return (
    <Canvas
      className="galaxy-canvas"
      dpr={dpr}
      camera={{ position: [26, 20, 28], fov: 44, near: 0.05, far: 260 }}
      gl={{ antialias: config.quality !== 'low', powerPreference: 'high-performance', alpha: false }}
      frameloop={props.active ? 'always' : 'never'}
      onCreated={({ gl, scene }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 0.96
        scene.background = new THREE.Color('#01020a')
        scene.fog = new THREE.FogExp2('#02030c', 0.0062)
      }}
      onPointerMissed={props.onClearSelection}
    >
      <ambientLight intensity={0.22} color="#8098ff" />
      <BackgroundStars config={config} mode={props.mode} />
      <GalaxyParticles config={config} paused={props.paused} mode={props.mode} />
      <GalacticCore config={config} mode={props.mode} />
      <KnowledgeLayer
        graph={props.graph}
        mode={props.mode}
        selectedNodeId={props.selectedNodeId}
        selectedLinkId={props.selectedLinkId}
        visibleTypes={props.visibleTypes}
        onSelectNode={props.onSelectNode}
        onSelectLink={props.onSelectLink}
        onFocusNode={props.onFocusNode}
        {...(props.onNodeDrag ? { onNodeDrag: props.onNodeDrag } : {})}
        {...(props.onNodeDragEnd ? { onNodeDragEnd: props.onNodeDragEnd } : {})}
        {...(props.onDragStateChange ? { onDragStateChange: props.onDragStateChange } : {})}
      />
      <CameraController
        focusPosition={props.focusPosition}
        resetToken={props.resetToken}
        disabled={Boolean(props.dragActive)}
      />
      {config.bloomIntensity > 0.02 && (
        <EffectComposer multisampling={config.quality === 'high' ? 4 : 0}>
          <Bloom
            intensity={config.bloomIntensity}
            luminanceThreshold={0.62}
            luminanceSmoothing={0.3}
            mipmapBlur={config.quality !== 'low'}
          />
        </EffectComposer>
      )}
    </Canvas>
  )
}
