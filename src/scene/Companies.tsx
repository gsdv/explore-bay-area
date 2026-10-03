import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { companies, logoUrl, type Company } from '../data/companies'
import { project, UNIT, BUILDING_EXAGGERATION } from '../lib/geo'
import type { World } from '../lib/world'
import { useStore } from '../store'
import { useZoomTier, useCameraDistance } from './viewStore'
import { COMPACT, useMedia } from '../lib/media'

/** closer than this (world units to the screen-centre point) chips show their name; further away, logo only. A phone shows
 *  the same depth of ground in a third of the width, so names wait until you're closer there. */
const EXPAND_DIST = 34
const EXPAND_DIST_COMPACT = 14

const fmtCap = (b: number) => (b >= 1000 ? `$${(b / 1000).toFixed(1)}T` : `$${Math.round(b)}B`)

export function Companies({ world }: { world: World }) {
  const show = useStore((s) => s.showCompanies)
  const quest = useStore((s) => s.activeQuest)
  const tier = useZoomTier()
  const narrow = useMedia(COMPACT)
  const compact = useCameraDistance() > (narrow ? EXPAND_DIST_COMPACT : EXPAND_DIST)
  const placed = useMemo(
    () =>
      companies.map((c) => {
        const [x, z] = project(c.lat, c.lng)
        return { c, x, z, y: world.heights.yAt(x, z), h: (c.height ?? 30) * UNIT * BUILDING_EXAGGERATION }
      }),
    [world],
  )
  if (!show) return null
  const visible = quest
    ? []
    : tier === 'far' ? placed.filter((p) => p.c.cap >= 60) : placed
  return (
    <group>
      {visible.map((p) => (
        <CompanyMarker key={p.c.id} {...p} compact={compact} />
      ))}
    </group>
  )
}

function CompanyMarker({ c, x, y, z, h, compact }: { c: Company; x: number; y: number; z: number; h: number; compact: boolean }) {
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selected?.kind === 'company' && s.selected.item.id === c.id)
  const color = useMemo(() => new THREE.Color().setHSL((c.name.length * 0.137) % 1, 0.25, 0.62), [c])
  return (
    <group position={[x, y, z]}>
      {!c.landmark && (
        <mesh position-y={h / 2} raycast={() => null}>
          <boxGeometry args={[0.7, h, 0.7]} />
          <meshStandardMaterial color={color} roughness={0.8} flatShading />
        </mesh>
      )}
      {/* on a landmark the chip rides above the landmark's own label */}
      <Html position={[0, h + (c.landmark ? 1.3 : 0.5), 0]} center zIndexRange={[30, 20]} style={{ pointerEvents: 'auto' }}>
        <button
          className={'company-chip' + (selected ? ' is-selected' : '') + (compact && !selected ? ' is-compact' : '')}
          title={compact ? `${c.name} · ${fmtCap(c.cap)}` : undefined}
          onClick={(e) => {
            e.stopPropagation()
            select({ kind: 'company', item: c })
          }}
        >
          <img src={logoUrl(c)} alt="" width={16} height={16} loading="lazy" />
          {/* width animates via grid-template-columns 1fr → 0fr, so no JS measurement is needed */}
          <span className="company-chip__text">
            <span className="company-chip__inner">
              <span className="company-chip__name">{c.name}</span>
              <span className="company-chip__cap">{fmtCap(c.cap)}</span>
            </span>
          </span>
        </button>
      </Html>
    </group>
  )
}
