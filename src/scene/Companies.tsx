import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { companies, logoUrl, type Company } from '../data/companies'
import { project, UNIT, BUILDING_EXAGGERATION } from '../lib/geo'
import type { World } from '../lib/world'
import { useStore } from '../store'
import { useZoomTier, useCameraDistance } from './viewStore'

/** closer than this (world units to the screen-centre point) chips show their name; further away, logo only */
const EXPAND_DIST = 34

const fmtCap = (b: number) => (b >= 1000 ? `$${(b / 1000).toFixed(1)}T` : `$${Math.round(b)}B`)

export function Companies({ world }: { world: World }) {
  const show = useStore((s) => s.showCompanies)
  const quest = useStore((s) => s.activeQuest)
  const tier = useZoomTier()
  const compact = useCameraDistance() > EXPAND_DIST
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
  // Measure the natural text width so the collapse can animate a real width. drei's Html renders
  // children in its own React root, so a ref callback (which runs when the span actually attaches)
  // is the reliable place to measure; re-measure once web fonts have loaded.
  const inner = useRef<HTMLSpanElement | null>(null)
  const [textW, setTextW] = useState<number | null>(null)
  const measure = useCallback((el: HTMLSpanElement | null) => {
    inner.current = el
    if (el && el.scrollWidth > 0) setTextW((w) => (w === el.scrollWidth ? w : el.scrollWidth))
  }, [])
  useEffect(() => {
    document.fonts?.ready.then(() => measure(inner.current))
  }, [measure])
  return (
    <group position={[x, y, z]}>
      <mesh position-y={h / 2} raycast={() => null}>
        <boxGeometry args={[0.7, h, 0.7]} />
        <meshStandardMaterial color={color} roughness={0.8} flatShading />
      </mesh>
      <Html position={[0, h + 0.5, 0]} center zIndexRange={[30, 20]} style={{ pointerEvents: 'auto' }}>
        <button
          className={'company-chip' + (selected ? ' is-selected' : '') + (compact && !selected ? ' is-compact' : '')}
          title={compact ? `${c.name} · ${fmtCap(c.cap)}` : undefined}
          onClick={(e) => {
            e.stopPropagation()
            select({ kind: 'company', item: c })
          }}
        >
          <img src={logoUrl(c)} alt="" width={16} height={16} loading="lazy" />
          <span className="company-chip__text" style={textW !== null ? { width: compact && !selected ? 0 : textW } : undefined}>
            <span ref={measure} className="company-chip__inner">
              <span className="company-chip__name">{c.name}</span>
              <span className="company-chip__cap">{fmtCap(c.cap)}</span>
            </span>
          </span>
        </button>
      </Html>
    </group>
  )
}
