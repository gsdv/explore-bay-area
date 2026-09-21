import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Landmark } from '../data/landmarks'
import { drapeLine, drapePolygon } from '../lib/drape'
import type { World } from '../lib/world'
import { useStore } from '../store'

/** Outlines of the landmarks that are a whole area (public/data/areas.json, baked from the OSM parks): id -> rings of flat x, z. */
type Areas = Record<string, number[][]>
let pending: Promise<Areas> | null = null
const loadAreas = () => (pending ??= fetch('/data/areas.json').then((r) => r.json() as Promise<Areas>).catch((): Areas => ({})))

const BORDER = '#2f6b3a'
const ACCENT = '#f04a00' // --orange

/**
 * A landmark you can't model as an object: Golden Gate Park is five kilometres of ground. Its real outline is draped on the
 * terrain as a border, and the ground inside it is the hover and click target (a wash of the accent fades in under the pointer).
 * It shares the landmark's id with the little model at its centre, so either one lights up both.
 */
export function LandmarkArea({ landmark: l, world }: { landmark: Landmark; world: World }) {
  const [rings, setRings] = useState<[number, number][][]>([])
  useEffect(() => {
    let live = true
    loadAreas().then((all) => {
      if (live) setRings((all[l.id] ?? []).map((flat) => Array.from({ length: flat.length / 2 }, (_, i) => [flat[i * 2], flat[i * 2 + 1]] as [number, number])))
    })
    return () => {
      live = false
    }
  }, [l.id])

  const inQuest = useStore((s) => !!s.activeQuest)
  const hovered = useStore((s) => s.hoveredLandmark === l.id) && !inQuest
  const setHovered = useStore((s) => s.setHoveredLandmark)
  const select = useStore((s) => s.select)

  const { ground, borders } = useMemo(() => {
    const yAt = (x: number, z: number) => Math.max(0, world.heights.yAt(x, z))
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(rings.flatMap((r) => drapePolygon(r, yAt)), 3))
    return { ground: geo, borders: rings.map((r) => drapeLine(r, yAt)) }
  }, [rings, world])
  useEffect(() => () => ground.dispose(), [ground])

  const wash = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((_, dt) => {
    if (!wash.current) return
    wash.current.opacity += ((hovered ? 0.2 : 0) - wash.current.opacity) * Math.min(1, dt * 10)
  })

  if (!rings.length) return null
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
  return (
    <group>
      <mesh geometry={ground} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} renderOrder={2}>
        <meshBasicMaterial ref={wash} color={ACCENT} transparent opacity={0} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {borders.map((pts, i) => (
        <Line key={i} points={pts} color={hovered ? ACCENT : BORDER} lineWidth={hovered ? 3.2 : 1.8} raycast={() => null} />
      ))}
    </group>
  )
}
