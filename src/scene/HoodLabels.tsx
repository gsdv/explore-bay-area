import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import type { World } from '../lib/world'
import { useStore } from '../store'
import { viewStore } from './viewStore'

/**
 * A label shows while its area looks neither tiny nor screen-filling: apparent size = sqrt(area) / camera distance.
 * So cities (and "San Francisco" as a whole) name themselves from high up, SF's neighborhoods take over as you
 * descend, and a name steps aside once you are down inside it.
 */
/** cities need to look a little bigger than SF neighborhoods before they are named, or the far view fills with towns */
const MIN_APPARENT = { hood: 0.075, city: 0.1 }
const MAX_APPARENT = 1.9
/** San Francisco as a whole steps aside much earlier, as soon as its bigger neighborhoods are being named */
const MAX_APPARENT_GROUP = 0.45
/** only areas within this many camera-distances of the screen-centre ground point are candidates (roughly the view) */
const REACH = 1.5
/** never more than this many names at once (the list is sorted biggest first) */
const MAX_LABELS = 60

/** Names for the neighborhood atlas wash (public/data/hoods.json), set like an atlas: spaced capitals in the display face. */
export function HoodLabels({ world }: { world: World }) {
  const show = useStore((s) => s.heat === 'hoods')
  const quest = useStore((s) => s.activeQuest)
  // quantise distance (log steps) and centre (a fraction of the distance) so the visible set only recomputes when it
  // can actually change, not on every published camera frame
  const step = viewStore((v) => Math.round(Math.log(Math.max(v.dist, 1)) * 12))
  const d = Math.exp(step / 12)
  const cell = d / 5
  const cx = viewStore((v) => Math.round(v.x / cell))
  const cz = viewStore((v) => Math.round(v.z / cell))
  const visible = useMemo(() => {
    if (!show || quest) return []
    const x0 = cx * cell, z0 = cz * cell
    return world.hoods
      .filter((h) => {
        const apparent = Math.sqrt(h.area * 100) / d // km² → world units²
        if (apparent < MIN_APPARENT[h.kind] || apparent > (h.group ? MAX_APPARENT_GROUP : MAX_APPARENT)) return false
        return Math.hypot(h.x - x0, h.z - z0) < d * REACH
      })
      .slice(0, MAX_LABELS)
  }, [world, show, quest, d, cell, cx, cz])
  return (
    <group>
      {visible.map((h) => (
        <Html key={h.kind + h.name + h.x} position={[h.x, h.y + 0.4, h.z]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <div className={'hood-label hood-label--' + h.kind}>{h.name}</div>
        </Html>
      ))}
    </group>
  )
}
