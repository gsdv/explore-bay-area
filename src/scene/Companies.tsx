import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { companies, logoUrl, type Company } from '../data/companies'
import { project, UNIT, BUILDING_EXAGGERATION } from '../lib/geo'
import type { World } from '../lib/world'
import { useStore } from '../store'
import { useZoomTier } from './viewStore'

const fmtCap = (b: number) => (b >= 1000 ? `$${(b / 1000).toFixed(1)}T` : `$${Math.round(b)}B`)

export function Companies({ world }: { world: World }) {
  const show = useStore((s) => s.showCompanies)
  const tier = useZoomTier()
  const placed = useMemo(
    () =>
      companies.map((c) => {
        const [x, z] = project(c.lat, c.lng)
        return { c, x, z, y: world.heights.yAt(x, z), h: (c.height ?? 30) * UNIT * BUILDING_EXAGGERATION }
      }),
    [world],
  )
  if (!show) return null
  const visible = tier === 'far' ? placed.filter((p) => p.c.cap >= 150) : tier === 'mid' ? placed.filter((p) => p.c.cap >= 40) : placed
  return (
    <group>
      {visible.map((p) => (
        <CompanyMarker key={p.c.id} {...p} />
      ))}
    </group>
  )
}

function CompanyMarker({ c, x, y, z, h }: { c: Company; x: number; y: number; z: number; h: number }) {
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selected?.kind === 'company' && s.selected.item.id === c.id)
  const color = useMemo(() => new THREE.Color().setHSL((c.name.length * 0.137) % 1, 0.25, 0.62), [c])
  return (
    <group position={[x, y, z]}>
      <mesh position-y={h / 2} raycast={() => null}>
        <boxGeometry args={[0.7, h, 0.7]} />
        <meshStandardMaterial color={color} roughness={0.8} flatShading />
      </mesh>
      <Html position={[0, h + 0.5, 0]} center zIndexRange={[40, 20]} style={{ pointerEvents: 'auto' }}>
        <button
          className={'company-chip' + (selected ? ' is-selected' : '')}
          onClick={(e) => {
            e.stopPropagation()
            select({ kind: 'company', item: c })
          }}
        >
          <img src={logoUrl(c)} alt="" width={16} height={16} loading="lazy" />
          <span className="company-chip__name">{c.name}</span>
          <span className="company-chip__cap">{fmtCap(c.cap)}</span>
        </button>
      </Html>
    </group>
  )
}
