import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { GalaxyConfig, ViewMode } from '../../types/galaxy'
import { mulberry32 } from '../../utils/random'

export function BackgroundStars({ config, mode }: { config: GalaxyConfig; mode: ViewMode }) {
  const count = config.quality === 'low' ? 650 : 1500
  const geometry = useMemo(() => {
    const random = mulberry32(0x53544152)
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const palette = ['#b4ccff', '#ffffff', '#806cff', '#9edfff'].map((value) => new THREE.Color(value))
    for (let index = 0; index < count; index += 1) {
      const i3 = index * 3
      const radius = 64 + random() * 52
      const theta = random() * Math.PI * 2
      const phi = Math.acos(2 * random() - 1)
      positions[i3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = radius * Math.cos(phi)
      positions[i3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
      const color = palette[Math.floor(random() * palette.length)].clone().multiplyScalar(0.35 + Math.pow(random(), 4) * 0.95)
      colors[i3] = color.r
      colors[i3 + 1] = color.g
      colors[i3 + 2] = color.b
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    next.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return next
  }, [count])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (!config.showBackgroundStars) return null
  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={mode === 'universe' ? 0.34 : 0.2}
        vertexColors
        transparent
        opacity={mode === 'universe' ? 0.78 : 0.34}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}
