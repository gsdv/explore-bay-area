import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Company logos floating over their offices, turning on their axis and bobbing like coins in a video game. Each is a coin in
 * logo units (1 = SIZE, centred, facing +z): a white face in a border, with the mark standing proud of both faces (the
 * back one turned round, so it reads right from behind). They ride inside the landmark's group, so they pop, outline and
 * take clicks with the building.
 */
const SIZE = 0.24 // world units across (24 m), against the Monadnock's 43 m front
const LIFT = 0.22 // centre above the roof
const BOB = 0.025
/** how far a logo reaches above the model's top, for the label and the card's fly-to framing */
export const LOGO_HEIGHT = LIFT + SIZE / 2 + BOB

const T = 0.14 // thickness, in logo units
const slab = (shapes: THREE.Shape | THREE.Shape[], depth: number, z0: number) =>
  new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, z0)
/** the border is a ring a little thicker than the face, so it shows as a dark rim on both sides and hides the face's edges */
const border = (outer: THREE.Shape, inner: THREE.Shape) => {
  outer.holes.push(inner)
  return slab(outer, T + 0.02, -(T + 0.02) / 2)
}
const face = (s: THREE.Shape) => slab(s, T, -T / 2)
const mark = (s: THREE.Shape[]) => slab(s, 0.02, T / 2 - 0.001)
const WHITE = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 })

function Coin({ top, rim, face, mark, ink, edge = ink, phase = 0 }: {
  top: number; rim: THREE.BufferGeometry; face: THREE.BufferGeometry; mark: THREE.BufferGeometry; ink: THREE.Material
  /** the rim's material, when it isn't part of the logo (the mark's ink otherwise) */
  edge?: THREE.Material; phase?: number
}) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime + phase
    ref.current.rotation.y = t * 1.5
    ref.current.position.y = top + LIFT + Math.sin(t * 2.4) * BOB
  })
  return (
    <group ref={ref} position={[0, top + LIFT, 0]} scale={SIZE}>
      <mesh geometry={rim} material={edge} />
      <mesh geometry={face} material={WHITE} />
      <mesh geometry={mark} material={ink} />
      <mesh geometry={mark} material={ink} scale={[-1, 1, -1]} />
    </group>
  )
}

// ---- Notion: a rounded square with the serif N
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
const NOTION = {
  rim: border(rounded(0.5, 0.13), rounded(0.415, 0.08)),
  face: face(rounded(0.42, 0.085)),
  // two thin stems, the heavy diagonal, and serifs on the left top and bottom and the right top
  mark: mark([
    rect(-0.25, -0.27, -0.19, 0.27),
    rect(0.19, -0.27, 0.25, 0.27),
    poly([[-0.25, 0.27], [-0.1, 0.27], [0.25, -0.27], [0.1, -0.27]]),
    rect(-0.33, 0.235, -0.1, 0.285),
    rect(-0.32, -0.285, -0.12, -0.235),
    rect(0.11, 0.235, 0.33, 0.285),
  ]),
  ink: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.55 }),
}
export const NotionLogo = ({ top }: { top: number }) => <Coin top={top} {...NOTION} />

// ---- CircleCI: a round coin with the mark, a thick ring open on the left round a dot (from the logo's SVG: ring radii
// 27.6 and 52.6, dot 12.5, the opening 20 high, in a 105 box)
const disc = (r: number) => new THREE.Shape().absarc(0, 0, r, 0, Math.PI * 2, false)
const holeDisc = (r: number) => new THREE.Path().absarc(0, 0, r, 0, Math.PI * 2, true)
const circleMark = (scale: number) => {
  const R = (52.6 / 105) * scale, r = (27.6 / 105) * scale, h = (10 / 105) * scale
  const ao = Math.PI - Math.asin(h / R), ai = Math.PI - Math.asin(h / r)
  const c = new THREE.Shape()
  c.moveTo(R * Math.cos(-ao), R * Math.sin(-ao))
  c.absarc(0, 0, R, -ao, ao, false)
  c.lineTo(r * Math.cos(ai), r * Math.sin(ai))
  c.absarc(0, 0, r, ai, -ai, true)
  c.closePath()
  return [c, disc((12.5 / 105) * scale)]
}
const CIRCLECI = {
  rim: (() => { const s = disc(0.5); s.holes.push(holeDisc(0.455)); return slab(s, T + 0.02, -(T + 0.02) / 2) })(),
  face: face(disc(0.46)),
  mark: mark(circleMark(0.8)),
  ink: new THREE.MeshStandardMaterial({ color: '#343434', roughness: 0.55 }),
  // the logo has no border of its own: a light edge keeps the coin from reading as a dark ring round the mark
  edge: new THREE.MeshStandardMaterial({ color: '#d4d6d8', roughness: 0.4, metalness: 0.2 }),
}
export const CircleCILogo = ({ top }: { top: number }) => <Coin top={top} {...CIRCLECI} phase={1.3} />
