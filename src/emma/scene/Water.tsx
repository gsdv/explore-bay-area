import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BOX } from '../region'

/** A translucent sheet at sea level over the box, with a slow, subtle shimmer. */
export function Water() {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (mat.current) mat.current.opacity = 0.42 + Math.sin(clock.elapsedTime * 0.6) * 0.03
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[(BOX.x0 + BOX.x1) / 2, -0.006, (BOX.z0 + BOX.z1) / 2]} raycast={() => null}>
      <planeGeometry args={[BOX.width, BOX.depth]} />
      <meshStandardMaterial ref={mat} color="#5fa8dc" transparent opacity={0.45} roughness={0.25} metalness={0.05} depthWrite={false} />
    </mesh>
  )
}
