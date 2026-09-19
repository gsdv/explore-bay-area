import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { landmarks, type Landmark } from '../data/landmarks'
import { project } from '../lib/geo'
import type { World } from '../lib/world'
import { useStore } from '../store'
import { landmarkParts, landmarkLines, partGeometry, type Part } from './LandmarkModel'
import { useZoomTier } from './viewStore'

const OUTLINE = new THREE.MeshBasicMaterial({ color: '#1b1d1a', side: THREE.BackSide })
const geoCache = new Map<string, THREE.BufferGeometry>()
const geoFor = (p: Part) => {
  const key = p.geo + JSON.stringify(p.args ?? [])
  if (!geoCache.has(key)) geoCache.set(key, partGeometry(p))
  return geoCache.get(key)!
}

export function Landmarks({ world }: { world: World }) {
  const show = useStore((s) => s.showLandmarks)
  if (!show) return null
  return (
    <group>
      {landmarks.map((l) => (
        <LandmarkObject key={l.id} landmark={l} world={world} />
      ))}
    </group>
  )
}

const HULL = 0.09

function LandmarkObject({ landmark: l, world }: { landmark: Landmark; world: World }) {
  const group = useRef<THREE.Group>(null)
  const quest = useStore((s) => s.activeQuest)
  const inQuest = !!quest
  const hovered = useStore((s) => s.hoveredLandmark === l.id) && !inQuest
  const setHovered = useStore((s) => s.setHoveredLandmark)
  const select = useStore((s) => s.select)
  const tier = useZoomTier()
  const parts = useMemo(() => landmarkParts(l), [l])
  const lines = useMemo(() => landmarkLines(l), [l])
  // an invisible box around the whole model so gaps (tower legs, bridge spans) still count as hovering
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const p of parts) {
      const r = Math.hypot(p.scale[0], p.scale[2]) / 2
      minX = Math.min(minX, p.pos[0] - r); maxX = Math.max(maxX, p.pos[0] + r)
      minZ = Math.min(minZ, p.pos[2] - r); maxZ = Math.max(maxZ, p.pos[2] + r)
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
    }
    const y = l.kind === 'bridge' || l.kind === 'island' ? 0 : world.heights.yAt(x, z)
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

  const showLabel = !inQuest && (tier !== 'far' || l.tags?.includes('icon'))
  const labelHeight = Math.max(...parts.map((p) => p.pos[1] + p.scale[1] / 2)) + 0.6

  return (
    <group ref={group} position={pos} rotation-y={rotY} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
      <mesh position={bounds.center} visible={false}>
        <boxGeometry args={bounds.size} />
        <meshBasicMaterial />
      </mesh>
      {parts.map((p, i) => (
        <group key={i} position={p.pos} rotation={p.rot ?? [0, 0, 0]}>
          <mesh geometry={geoFor(p)} scale={p.scale}>
            <meshStandardMaterial color={p.color} roughness={0.85} metalness={0} flatShading />
          </mesh>
          {hovered && (
            <mesh
              geometry={geoFor(p)}
              material={OUTLINE}
              scale={[p.scale[0] + HULL * 2, p.scale[1] + HULL * 2, p.scale[2] + HULL * 2]}
              raycast={() => null}
            />
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
