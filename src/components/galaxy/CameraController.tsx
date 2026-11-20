import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'

const OVERVIEW_POSITION = new THREE.Vector3(26, 20, 28)
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0)

interface Props {
  focusPosition: [number, number, number] | null
  resetToken: number
}

export function CameraController({ focusPosition, resetToken }: Props) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, gl } = useThree()
  const desiredPosition = useRef(OVERVIEW_POSITION.clone())
  const desiredTarget = useRef(OVERVIEW_TARGET.clone())
  const isFlying = useRef(true)

  useEffect(() => {
    if (!focusPosition) return
    const target = new THREE.Vector3(...focusPosition)
    const direction = camera.position.clone().sub(target).normalize()
    desiredTarget.current.copy(target)
    desiredPosition.current.copy(target).add(direction.multiplyScalar(5.4)).add(new THREE.Vector3(0, 1.5, 0))
    isFlying.current = true
  }, [camera, focusPosition])

  useEffect(() => {
    desiredPosition.current.copy(OVERVIEW_POSITION)
    desiredTarget.current.copy(OVERVIEW_TARGET)
    isFlying.current = true
  }, [resetToken])

  useEffect(() => {
    const canvas = gl.domElement
    const preventMenu = (event: MouseEvent) => event.preventDefault()
    canvas.addEventListener('contextmenu', preventMenu)
    return () => canvas.removeEventListener('contextmenu', preventMenu)
  }, [gl])

  useFrame((_, delta) => {
    if (!isFlying.current || !controls.current) return
    const alpha = 1 - Math.exp(-delta * 3.2)
    camera.position.lerp(desiredPosition.current, alpha)
    controls.current.target.lerp(desiredTarget.current, alpha)
    controls.current.update()
    if (camera.position.distanceTo(desiredPosition.current) < 0.035 && controls.current.target.distanceTo(desiredTarget.current) < 0.025) {
      isFlying.current = false
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.055}
      minDistance={3}
      maxDistance={92}
      maxPolarAngle={Math.PI * 0.93}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      onStart={() => { isFlying.current = false }}
    />
  )
}
