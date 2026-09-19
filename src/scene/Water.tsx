import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WORLD } from '../lib/geo'

/** A translucent sheet at sea level with a slow, subtle shimmer. */
export function Water() {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (mat.current) mat.current.opacity = 0.42 + Math.sin(clock.elapsedTime * 0.6) * 0.03
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.006} raycast={() => null}>
      <planeGeometry args={[WORLD.width * 1.5, WORLD.depth * 1.5]} />
      <meshStandardMaterial ref={mat} color="#5fa8dc" transparent opacity={0.45} roughness={0.25} metalness={0.05} depthWrite={false} />
    </mesh>
  )
}
