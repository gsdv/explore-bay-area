import { useEffect, useMemo, useRef, useState } from 'react'
import { useView } from '../scene/viewStore'
import { useStore } from '../store'
import { WORLD, worldToUV, toUV } from '../lib/geo'

const LABELS: { name: string; lat: number; lng: number; big?: boolean }[] = [
  { name: 'San Francisco', lat: 37.775, lng: -122.43, big: true },
  { name: 'Golden Gate Bridge', lat: 37.8199, lng: -122.4783 },
  { name: 'Alcatraz', lat: 37.8267, lng: -122.423 },
  { name: 'Golden Gate Park', lat: 37.7694, lng: -122.4862 },
  { name: 'Mt Tamalpais', lat: 37.9235, lng: -122.5965 },
  { name: 'Sausalito', lat: 37.8591, lng: -122.4853 },
  { name: 'Berkeley', lat: 37.8716, lng: -122.2727 },
  { name: 'Oakland', lat: 37.8044, lng: -122.2712, big: true },
  { name: 'SFO', lat: 37.6213, lng: -122.379 },
  { name: 'Half Moon Bay', lat: 37.4636, lng: -122.4286 },
  { name: 'Palo Alto', lat: 37.4419, lng: -122.143 },
  { name: 'Mountain View', lat: 37.3861, lng: -122.0839 },
  { name: 'San Jose', lat: 37.3382, lng: -121.8863, big: true },
  { name: 'Fremont', lat: 37.5485, lng: -121.9886 },
  { name: 'Mt Diablo', lat: 37.8816, lng: -121.9147 },
  { name: 'Richmond', lat: 37.9358, lng: -122.3477 },
]

export function Minimap() {
  const [open, setOpen] = useState(false)
  const [outline, setOutline] = useState<number[][][] | null>(null)
  const view = useView()
  const flyTo = useStore((s) => s.flyTo)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/data/outline.json').then((r) => r.json()).then(setOutline).catch(() => setOutline([]))
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const landPath = useMemo(
    () => (outline ?? []).map((ring) => ring.map(([u, v], i) => `${i ? 'L' : 'M'}${(u * 1000).toFixed(0)} ${(v * 1000).toFixed(0)}`).join('') + 'Z').join(''),
    [outline],
  )
  const [u, v] = worldToUV(view.x, view.z)
  // camera looks along (-sin yaw, -cos yaw) in x/z, which is the same direction in u/v
  const headingDeg = (Math.atan2(-Math.cos(view.yaw), -Math.sin(view.yaw)) * 180) / Math.PI

  const onClick = (e: React.MouseEvent) => {
    if (!open) {
      setOpen(true)
      return
    }
    const r = box.current!.getBoundingClientRect()
    const cu = (e.clientX - r.left) / r.width, cv = (e.clientY - r.top) / r.height
    setOpen(false)
    flyTo((cu - 0.5) * WORLD.width, (cv - 0.5) * WORLD.depth, 28)
  }

  return (
    <>
      {open && <div className="minimap-scrim" onClick={() => setOpen(false)} />}
      <div ref={box} className={'minimap' + (open ? ' is-open' : '')} onClick={onClick} role="button" aria-label="minimap" title={open ? undefined : 'Open map'}>
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
          {open && <image href="/data/map-small.webp" x="0" y="0" width="1000" height="1000" className="minimap__img" />}
          <path d={landPath} className="minimap__land" fillRule="evenodd" />
          {open &&
            LABELS.map((l) => {
              const [lu, lv] = toUV(l.lat, l.lng)
              return (
                <text key={l.name} x={lu * 1000} y={lv * 1000} className={'minimap__label' + (l.big ? ' is-big' : '')}>
                  {l.name}
                </text>
              )
            })}
          <g transform={`translate(${u * 1000} ${v * 1000}) rotate(${headingDeg})`} className="minimap__you">
            <path d="M0 0 L95 -42 L95 42 Z" className="minimap__cone" />
            <circle r="14" className="minimap__dot" />
          </g>
        </svg>
        <div className="minimap__hint">{open ? 'Click anywhere to fly there · Esc to close' : 'The Bay'}</div>
      </div>
    </>
  )
}
