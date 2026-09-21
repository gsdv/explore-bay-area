import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Landmark } from '../data/landmarks'
import { drapeLine, drapePolygon, ribbon } from '../lib/drape'
import type { World } from '../lib/world'
import { useStore } from '../store'
import { hullMaterial } from './hoverGlow'

/** Outlines of the landmarks that are a whole area (public/data/areas.json, baked from the OSM parks): id -> rings of flat x, z. */
type Areas = Record<string, number[][]>
let pending: Promise<Areas> | null = null
const loadAreas = () => (pending ??= fetch('/data/areas.json').then((r) => r.json() as Promise<Areas>).catch((): Areas => ({})))

const BORDER = '#2f6b3a'
const ACCENT = '#f04a00' // --orange
// the landmarks' hover outline, laid flat: the same shimmering accent band and its wider translucent glow, as ribbons on the ground
// (double-sided, because a ribbon has no inside to show a back face from)
const OUTLINE = hullMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
const GLOW = hullMaterial({ color: '#ff7a33', transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
const BAND = 0.2, HALO = 0.7

/**
 * A landmark you can't model as an object: Golden Gate Park is five kilometres of ground. Its real outline is draped on the
 * terrain as a border, and the ground inside it is the hover and click target: under the pointer the border becomes the landmarks'
 * shimmering hover outline and a faint wash of the accent fades in.
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

  const { ground, borders, outline, glow } = useMemo(() => {
    const yAt = (x: number, z: number) => Math.max(0, world.heights.yAt(x, z))
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(rings.flatMap((r) => drapePolygon(r, yAt)), 3))
    const borders = rings.map((r) => drapeLine(r, yAt))
    const band = (width: number, lift: number) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(borders.flatMap((b) => ribbon(b, width, lift)), 3))
      return g
    }
    return { ground: geo, borders, outline: band(BAND, 0.02), glow: band(HALO, 0.01) }
  }, [rings, world])
  useEffect(() => () => [ground, outline, glow].forEach((g) => g.dispose()), [ground, outline, glow])

  const wash = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((_, dt) => {
    if (!wash.current) return
    wash.current.opacity += ((hovered ? 0.12 : 0) - wash.current.opacity) * Math.min(1, dt * 10)
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
      {hovered ? (
        <>
          <mesh geometry={glow} material={GLOW} renderOrder={3} raycast={() => null} />
          <mesh geometry={outline} material={OUTLINE} renderOrder={4} raycast={() => null} />
        </>
      ) : (
        borders.map((pts, i) => <Line key={i} points={pts} color={BORDER} lineWidth={1.8} raycast={() => null} />)
      )}
    </group>
  )
}
