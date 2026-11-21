import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { GalaxyConfig, ViewMode } from '../../types/galaxy'
import { gaussian, mulberry32 } from '../../utils/random'

interface Props {
  config: GalaxyConfig
  mode: ViewMode
}

function radialTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,244,1)')
  gradient.addColorStop(0.08, 'rgba(255,236,192,.92)')
  gradient.addColorStop(0.3, 'rgba(255,184,121,.28)')
  gradient.addColorStop(0.66, 'rgba(148,112,255,.07)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function GalacticCore({ config, mode }: Props) {
  const texture = useMemo(() => radialTexture(), [])
  const geometry = useMemo(() => {
    const count = config.quality === 'low' ? 1800 : 4200
    const random = mulberry32(0x434f5245)
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const warm = new THREE.Color('#ffd596')
    const white = new THREE.Color('#fff8de')
    const mixed = new THREE.Color()
    for (let index = 0; index < count; index += 1) {
      const i3 = index * 3
      const radius = Math.pow(random(), 1.8) * 5.2
      const angle = random() * Math.PI * 2 + radius * 0.75
      positions[i3] = Math.cos(angle) * radius
      positions[i3 + 1] = gaussian(random) * (0.85 * (1 - radius / 6) + 0.08)
      positions[i3 + 2] = Math.sin(angle) * radius
      mixed.copy(white).lerp(warm, Math.min(1, radius / 4.3)).multiplyScalar(0.65 + random() * 0.72)
      colors[i3] = mixed.r
      colors[i3 + 1] = mixed.g
      colors[i3 + 2] = mixed.b
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    next.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return next
  }, [config.quality])

  useEffect(() => () => {
    texture.dispose()
    geometry.dispose()
  }, [geometry, texture])

  const dim = mode === 'universe' ? 1 : mode === 'knowledge' ? 0.5 : 0.28
  const brightness = config.coreBrightness * dim
  return (
    <group>
      <points geometry={geometry}>
        <pointsMaterial
          size={0.115}
          vertexColors
          transparent
          opacity={Math.min(1, brightness)}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
      <sprite scale={[5.8, 5.8, 1]}>
        <spriteMaterial map={texture} color="#fff4ce" opacity={0.56 * brightness} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite scale={[11.5, 6.5, 1]}>
        <spriteMaterial map={texture} color="#9b78ff" opacity={0.12 * brightness} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <pointLight color="#ffe4b0" intensity={3.2 * brightness} distance={13} decay={2} />
    </group>
  )
}
