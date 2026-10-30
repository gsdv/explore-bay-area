import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Notion's logo floating over its headquarters (the Monadnock), turning on its axis and bobbing like a coin in a video game:
 * a white rounded square in a heavy black border, with the serif N standing proud of both faces (the back one turned round,
 * so it reads right from behind). It rides inside the landmark's group, so it pops, outlines and takes clicks with the building.
 */
const SIZE = 0.24 // world units across (24 m), against the building's 43 m front
const LIFT = 0.22 // centre above the roof
const BOB = 0.025
/** how far the logo reaches above the model's top, for the label and the card's fly-to framing */
export const NOTION_LOGO_HEIGHT = LIFT + SIZE / 2 + BOB

const T = 0.14 // thickness, in logo units (1 = SIZE)
const rounded = (half: number, r: number) => {
  const s = new THREE.Shape()
  s.moveTo(-half + r, -half)
  s.lineTo(half - r, -half)
  s.quadraticCurveTo(half, -half, half, -half + r)
  s.lineTo(half, half - r)
  s.quadraticCurveTo(half, half, half - r, half)
  s.lineTo(-half + r, half)
  s.quadraticCurveTo(-half, half, -half, half - r)
  s.lineTo(-half, -half + r)
  s.quadraticCurveTo(-half, -half, -half + r, -half)
  return s
}
const poly = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
const rect = (x0: number, y0: number, x1: number, y1: number) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
const slab = (shapes: THREE.Shape | THREE.Shape[], depth: number, z0: number) =>
  new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, z0)

// the border is a ring a little thicker than the face, so it shows as a black rim on both sides and hides the face's edges
const ring = rounded(0.5, 0.13)
ring.holes.push(rounded(0.415, 0.08))
const BORDER = slab(ring, T + 0.02, -(T + 0.02) / 2)
const FACE = slab(rounded(0.42, 0.085), T, -T / 2)
// the N: two thin stems, the heavy diagonal, and serifs on the left top and bottom and the right top
const N = [
  rect(-0.25, -0.27, -0.19, 0.27),
  rect(0.19, -0.27, 0.25, 0.27),
  poly([[-0.25, 0.27], [-0.1, 0.27], [0.25, -0.27], [0.1, -0.27]]),
  rect(-0.33, 0.235, -0.1, 0.285),
  rect(-0.32, -0.285, -0.12, -0.235),
  rect(0.11, 0.235, 0.33, 0.285),
]
const LETTER = slab(N, 0.02, T / 2 - 0.001)
const WHITE = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 })
const INK = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.55 })

export function NotionLogo({ top }: { top: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    ref.current.rotation.y = t * 1.5
    ref.current.position.y = top + LIFT + Math.sin(t * 2.4) * BOB
  })
  return (
    <group ref={ref} position={[0, top + LIFT, 0]} scale={SIZE}>
      <mesh geometry={BORDER} material={INK} />
      <mesh geometry={FACE} material={WHITE} />
      <mesh geometry={LETTER} material={INK} />
      <mesh geometry={LETTER} material={INK} scale={[-1, 1, -1]} />
    </group>
  )
}
