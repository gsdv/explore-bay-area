import { useMemo } from 'react'
import { Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { World, TransitRoute } from '../lib/world'
import { useStore, type TransitMode } from '../store'
import { useZoomTier } from './viewStore'

const WIDTH: Record<TransitMode, number> = { rail: 4.2, bus: 2, cable: 3.4, ferry: 2.4 }
const OPACITY: Record<TransitMode, number> = { rail: 1, bus: 0.9, cable: 1, ferry: 1 }

function buildSegments(routes: TransitRoute[]) {
  const pts: number[] = []
  const cols: number[] = []
  const c = new THREE.Color()
  for (const r of routes) {
    c.set(r.color)
    for (const line of r.lines) {
      for (let i = 0; i + 5 < line.length; i += 3) {
        pts.push(line[i], line[i + 1], line[i + 2], line[i + 3], line[i + 4], line[i + 5])
        cols.push(c.r, c.g, c.b, c.r, c.g, c.b)
      }
    }
  }
  return { pts, cols }
}

export function Transit({ world }: { world: World }) {
  const visible = useStore((s) => s.transit)
  const tier = useZoomTier()
  const groups = useMemo(() => {
    const out: Partial<Record<TransitMode, { pts: number[]; cols: number[] }>> = {}
    for (const mode of ['bus', 'ferry', 'rail', 'cable'] as TransitMode[]) {
      const g = buildSegments(world.transit.filter((r) => r.mode === mode))
      if (g.pts.length) out[mode] = g
    }
    return out
  }, [world])

  return (
    <group>
      {(Object.keys(groups) as TransitMode[]).map((mode) =>
        visible[mode] ? (
          <Line
            key={mode}
            points={groups[mode]!.pts}
            vertexColors={groups[mode]!.cols as any}
            segments
            lineWidth={WIDTH[mode]}
            transparent
            opacity={OPACITY[mode]}
            depthWrite={false}
            raycast={() => null}
            renderOrder={2}
          />
        ) : null,
      )}
      {visible.rail && tier === 'near' && <StationLabels stations={world.stations} />}
    </group>
  )
}

function StationLabels({ stations }: { stations: World['stations'] }) {
  return (
    <group>
      {stations
        .filter((s) => s.network !== 'Muni')
        .map((s) => (
          <Html key={s.name + s.x} position={[s.x, s.y + 0.6, s.z]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
            <div className="station-label">{s.name}</div>
          </Html>
        ))}
    </group>
  )
}
