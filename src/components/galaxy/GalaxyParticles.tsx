import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { GalaxyConfig, ViewMode } from '../../types/galaxy'
import { gaussian, mulberry32 } from '../../utils/random'

interface Props {
  config: GalaxyConfig
  paused: boolean
  mode: ViewMode
}

const vertexShader = `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPixelRatio;
  uniform float uBrightness;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float perspective = clamp(250.0 / max(4.0, -mvPosition.z), 0.6, 7.0);
    gl_PointSize = aSize * uPixelRatio * perspective;
    gl_Position = projectionMatrix * mvPosition;
    vColor = aColor * uBrightness;
    vAlpha = smoothstep(70.0, 2.0, -mvPosition.z);
  }
`

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float distanceToCenter = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (distanceToCenter > 1.0) discard;
    float halo = pow(max(0.0, 1.0 - distanceToCenter), 2.6);
    float core = exp(-distanceToCenter * distanceToCenter * 22.0);
    float alpha = (halo * 0.54 + core * 0.9) * vAlpha;
    gl_FragColor = vec4(vColor + core * 0.22, alpha);
  }
`

function countFor(config: GalaxyConfig) {
  const base = config.quality === 'high' ? 30000 : config.quality === 'low' ? 9500 : 22000
  return Math.round(base * config.density)
}

export function GalaxyParticles({ config, paused, mode }: Props) {
  const group = useRef<THREE.Group>(null)
  const pointCount = countFor(config)

  const geometry = useMemo(() => {
    const random = mulberry32(0x53485955 + config.armCount * 97)
    const positions = new Float32Array(pointCount * 3)
    const colors = new Float32Array(pointCount * 3)
    const sizes = new Float32Array(pointCount)
    const warm = new THREE.Color('#ffe0a8')
    const silver = new THREE.Color('#dceaff')
    const ice = new THREE.Color('#83bfff')
    const violet = new THREE.Color('#b99aff')
    const pink = new THREE.Color('#ff9fd1')
    const mixed = new THREE.Color()

    for (let index = 0; index < pointCount; index += 1) {
      const i3 = index * 3
      const radiusNorm = Math.pow(random(), 0.62)
      const radius = 1.1 + radiusNorm * 17.8
      const arm = index % config.armCount
      const branchAngle = (arm / config.armCount) * Math.PI * 2
      const cluster = Math.floor(random() * 72)
      const clusterWander = Math.sin(cluster * 12.9898 + arm * 2.41) * 0.12
      const armWidth = 0.08 + radiusNorm * 0.46
      const scatter = gaussian(random) * armWidth
      const angle = branchAngle + config.tightness * radiusNorm * Math.PI * 2.05 + clusterWander + scatter / Math.max(2.2, radius)
      const radialScatter = gaussian(random) * (0.18 + radiusNorm * 0.42)
      const localRadius = radius + radialScatter
      const thickness = (0.18 + Math.pow(1 - radiusNorm, 1.8) * 1.15 + radiusNorm * 0.18)
      const y = gaussian(random) * thickness * (random() < 0.06 ? 1.9 : 0.72)

      positions[i3] = Math.cos(angle) * localRadius
      positions[i3 + 1] = y
      positions[i3 + 2] = Math.sin(angle) * localRadius

      if (radiusNorm < 0.23) mixed.copy(warm).lerp(silver, radiusNorm / 0.23)
      else mixed.copy(silver).lerp(random() > 0.7 ? violet : ice, Math.min(1, (radiusNorm - 0.18) * 1.25))
      if (random() < 0.028 && radiusNorm > 0.34) mixed.lerp(pink, 0.6)
      const luminosity = 0.46 + Math.pow(random(), 4.2) * 1.45
      mixed.multiplyScalar(luminosity)
      colors[i3] = mixed.r
      colors[i3 + 1] = mixed.g
      colors[i3 + 2] = mixed.b
      sizes[index] = 0.55 + Math.pow(random(), 5.2) * 2.8 + (1 - radiusNorm) * 0.32
    }

    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    next.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    next.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    next.computeBoundingSphere()
    return next
  }, [config.armCount, config.tightness, pointCount])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uPixelRatio: { value: Math.min(window.devicePixelRatio, config.quality === 'high' ? 2 : 1.5) },
          uBrightness: { value: config.dustBrightness * (mode === 'universe' ? 1 : mode === 'knowledge' ? 0.42 : 0.22) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: true,
      }),
    [config.dustBrightness, config.quality, mode],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useFrame((_, delta) => {
    if (!paused && group.current) group.current.rotation.y += delta * config.rotationSpeed
  })

  return (
    <group ref={group}>
      <points geometry={geometry} material={material} frustumCulled={false} />
      <DustLanes config={config} mode={mode} />
    </group>
  )
}

function DustLanes({ config, mode }: Pick<Props, 'config' | 'mode'>) {
  const count = config.quality === 'low' ? 1800 : config.quality === 'high' ? 6200 : 4200
  const geometry = useMemo(() => {
    const random = mulberry32(0x44555354 + config.armCount)
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    for (let index = 0; index < count; index += 1) {
      const i3 = index * 3
      const radiusNorm = 0.13 + Math.pow(random(), 0.7) * 0.86
      const radius = radiusNorm * 18
      const arm = index % config.armCount
      const angle = (arm / config.armCount) * Math.PI * 2 + config.tightness * radiusNorm * Math.PI * 2.05 - 0.11 + gaussian(random) * 0.035
      positions[i3] = Math.cos(angle) * (radius + gaussian(random) * 0.36)
      positions[i3 + 1] = gaussian(random) * (0.08 + radiusNorm * 0.12)
      positions[i3 + 2] = Math.sin(angle) * (radius + gaussian(random) * 0.36)
      sizes[index] = 0.9 + random() * 2.8
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    next.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    next.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 3).fill(0.025), 3))
    return next
  }, [config.armCount, config.tightness, count])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) }, uBrightness: { value: 1 } },
        transparent: true,
        opacity: mode === 'universe' ? 0.78 : 0.35,
        depthWrite: false,
        depthTest: false,
        blending: THREE.NormalBlending,
      }),
    [mode],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <points geometry={geometry} material={material} renderOrder={3} />
}
