import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { landmarks, type Landmark } from '../data/landmarks'
import { project } from '../lib/geo'
import type { World } from '../lib/world'
import { useStore } from '../store'
import { landmarkParts, landmarkLines, bridgeGround, partGeometry, type Part } from './LandmarkModel'
import { hullMaterial, shimmer } from './hoverGlow'
import { LandmarkArea } from './LandmarkArea'
import { useZoomTier } from './viewStore'

const OUTLINE = hullMaterial({})
const GLOW = hullMaterial({ color: '#ff7a33', transparent: true, opacity: 0.34, depthWrite: false })
const geoCache = new Map<string, THREE.BufferGeometry>()
const geoFor = (p: Part) => {
  const key = p.geo + JSON.stringify(p.args ?? [])
  if (!geoCache.has(key)) geoCache.set(key, partGeometry(p))
  return geoCache.get(key)!
}

// the fluted shaft is an open, grooved tube: as a hull its rim shows as a row of teeth, so it borrows a plain capped taper
// (likewise the pierced ring of arches borrows a plain prism), and a curved wall can't be grown by scaling it about its
// centre, so a sector builds its hull already offset
const hullCache = new Map<string, THREE.BufferGeometry>()
const hullGeoFor = (p: Part, by: number) => {
  if (p.geo === 'fluted') return geoFor({ ...p, geo: 'cyl', args: [0.5 * Number(p.args?.[0] ?? 1), 0.5, 24] })
  if (p.geo === 'ringwall') return geoFor({ ...p, geo: 'cyl', args: [0.5, 0.5, Number(p.args?.[0] ?? 8), 1, false, Math.PI / Number(p.args?.[0] ?? 8)] })
  if (p.geo !== 'sector' && p.geo !== 'blocks') return geoFor(p)
  const key = by + JSON.stringify(p.args)
  if (!hullCache.has(key)) hullCache.set(key, partGeometry(p, by))
  return hullCache.get(key)!
}

export function Landmarks({ world }: { world: World }) {
  const show = useStore((s) => s.showLandmarks)
  useFrame(({ clock }) => {
    shimmer.uTime.value = clock.elapsedTime
  })
  if (!show) return null
  return (
    <group>
      {landmarks.map((l) => (
        <LandmarkObject key={l.id} landmark={l} world={world} />
      ))}
      {/* landmarks that are a whole park: their outline on the ground is the target (nothing renders for the others) */}
      {landmarks.filter((l) => l.kind === 'park').map((l) => (
        <LandmarkArea key={l.id} landmark={l} world={world} />
      ))}
    </group>
  )
}

const HULL = 0.09
const HALO = 0.16
const grown = (p: Part, by: number): [number, number, number] => [p.scale[0] + by * 2, p.scale[1] + by * 2, p.scale[2] + by * 2]

function LandmarkObject({ landmark: l, world }: { landmark: Landmark; world: World }) {
  const group = useRef<THREE.Group>(null)
  const quest = useStore((s) => s.activeQuest)
  const inQuest = !!quest
  const hovered = useStore((s) => s.hoveredLandmark === l.id) && !inQuest
  const setHovered = useStore((s) => s.setHoveredLandmark)
  const select = useStore((s) => s.select)
  const tier = useZoomTier()
  // bridges read the terrain so their decks run onto the shore instead of stopping over water
  const ground = useMemo(() => (l.kind === 'bridge' ? bridgeGround(l, (x, z) => world.heights.yAt(x, z)) : undefined), [l, world])
  const parts = useMemo(() => landmarkParts(l, ground), [l, ground])
  const lines = useMemo(() => landmarkLines(l, ground), [l, ground])
  // an invisible box around the whole model so gaps (tower legs, bridge spans) still count as hovering
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const p of parts) {
      if (p.scenery) continue
      // rotated parts get a conservative circle; axis-aligned ones use their real half-extents, otherwise a long
      // thin bridge deck would turn the box into a deck-length square that catches clicks kilometres away
      const rotated = p.rot && (p.rot[0] !== 0 || p.rot[1] !== 0 || p.rot[2] !== 0)
      const rx = rotated ? Math.hypot(p.scale[0], p.scale[2]) / 2 : p.scale[0] / 2
      const rz = rotated ? rx : p.scale[2] / 2
      minX = Math.min(minX, p.pos[0] - rx); maxX = Math.max(maxX, p.pos[0] + rx)
      minZ = Math.min(minZ, p.pos[2] - rz); maxZ = Math.max(maxZ, p.pos[2] + rz)
      minY = Math.min(minY, p.pos[1] - p.scale[1] / 2); maxY = Math.max(maxY, p.pos[1] + p.scale[1] / 2)
    }
    const pad = 0.12
    return { center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as [number, number, number], size: [maxX - minX + pad, maxY - minY + pad, maxZ - minZ + pad] as [number, number, number] }
  }, [parts])
  const { pos, rotY, scaleT } = useMemo(() => {
    const [x, z] = project(l.lat, l.lng)
    let rotY = 0
    if (l.kind === 'bridge') {
      const [x2, z2] = project(l.lat2!, l.lng2!)
      rotY = Math.atan2(-(z2 - z), x2 - x)
    } else if (l.bearing) {
      rotY = (-l.bearing * Math.PI) / 180
    }
    // bridges, islands and the wharf's pier stand in the water: sea level, not the seabed under their origin
    // (and a pier's origin is over water too, where the heightmap is seabed: nothing stands below sea level)
    const y = /^(bridge|island|wharf|alcatraz)$/.test(l.kind) ? 0 : Math.max(0, world.heights.yAt(x, z))
    return { pos: new THREE.Vector3(x, y, z), rotY, scaleT: { v: 1 } }
  }, [l, world])

  useFrame((_, dt) => {
    if (!group.current) return
    const target = hovered ? 1.12 : 1
    scaleT.v += (target - scaleT.v) * Math.min(1, dt * 10)
    group.current.scale.setScalar(scaleT.v)
    group.current.position.y = pos.y + (scaleT.v - 1) * 1.5
  })

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (inQuest) return
    e.stopPropagation()
    setHovered(l.id)
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    setHovered(null)
    document.body.style.cursor = ''
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (inQuest) return
    e.stopPropagation()
    select({ kind: 'landmark', item: l })
  }

  // while the neighborhood atlas is up its names own the ground (several landmarks share a name with their
  // neighborhood), so a landmark only names itself on hover
  const atlas = useStore((s) => s.heat === 'hoods')
  const showLabel = !inQuest && (atlas ? hovered : tier !== 'far' || l.tags?.includes('icon'))
  const labelHeight = Math.max(...parts.filter((p) => !p.scenery && !p.hullOnly).map((p) => p.pos[1] + p.scale[1] / 2)) + 0.6

  return (
    <group ref={group} position={pos} rotation-y={rotY} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
      <mesh position={bounds.center} visible={false}>
        <boxGeometry args={bounds.size} />
        <meshBasicMaterial />
      </mesh>
      {parts.map((p, i) => (
        <group key={i} position={p.pos} rotation={p.rot ?? [0, 0, 0]}>
          {!p.hullOnly && (
            <mesh geometry={geoFor(p)} scale={p.scale}>
              <meshStandardMaterial color={p.color} roughness={0.85} metalness={0} flatShading />
            </mesh>
          )}
          {hovered && !p.detail && (
            <>
              <mesh geometry={hullGeoFor(p, HULL)} material={OUTLINE} scale={grown(p, HULL)} raycast={() => null} />
              <mesh geometry={hullGeoFor(p, HALO)} material={GLOW} scale={grown(p, HALO)} raycast={() => null} />
            </>
          )}
        </group>
      ))}
      {lines.length > 0 && (
        <Line points={lines} segments color={parts[0].color} lineWidth={hovered ? 2.4 : 1.3} raycast={() => null} />
      )}
      {showLabel && (
        <Html position={[l.kind === 'bridge' ? 2 : 0, labelHeight, 0]} center zIndexRange={[19, 10]} style={{ pointerEvents: 'none' }}>
          <div className={'landmark-label' + (hovered ? ' is-hovered' : '')}>{l.name}</div>
        </Html>
      )}
    </group>
  )
}
