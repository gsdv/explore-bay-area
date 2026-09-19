import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { HeatKind, World } from '../lib/world'
import { useStore } from '../store'
import { useTerrainGeometry } from './Terrain'

/** Each wash sits at its own height so the two never z-fight while one fades into the other. */
const WASH_Y: Record<HeatKind, number> = { food: 0.04, rent: 0.05 }

/**
 * A ground wash: a pre-coloured raster from the pipeline (public/data/heat-food.webp or rent.webp) draped over a copy of
 * the terrain grid, a few metres above the ground so buildings still poke through. Fades in and out on toggle and is
 * skipped by the renderer entirely while hidden. The store allows one wash at a time, so switching cross-fades.
 */
export function Heatmap({ world, kind }: { world: World; kind: HeatKind }) {
  const show = useStore((s) => s.heat === kind)
  const geometry = useTerrainGeometry(world)
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((_, dt) => {
    const m = mat.current, o = mesh.current
    if (!m || !o) return
    const target = show ? 1 : 0
    m.opacity += (target - m.opacity) * (1 - Math.exp(-Math.min(dt, 0.1) * 10))
    if (Math.abs(target - m.opacity) < 0.004) m.opacity = target
    o.visible = m.opacity > 0
  })
  return (
    <mesh ref={mesh} geometry={geometry} position-y={WASH_Y[kind]} renderOrder={1} visible={false} raycast={() => null}>
      <meshBasicMaterial ref={mat} map={world.heat[kind]} transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
