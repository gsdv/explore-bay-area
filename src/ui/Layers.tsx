import { useEffect, useState } from 'react'
import { useStore, type TransitMode } from '../store'
import { RENT_CLASSES, fmtK, fmtMonth, type RentData } from '../lib/rent'

const MODES: { m: TransitMode; label: string; swatch: string }[] = [
  { m: 'rail', label: 'BART · Caltrain · Muni Metro', swatch: '#d13c3c' },
  { m: 'bus', label: 'Muni buses', swatch: '#f08a3e' },
  { m: 'cable', label: 'Cable cars', swatch: '#8b5a2b' },
  { m: 'ferry', label: 'Ferries', swatch: '#2f7fb8' },
]

export function Layers() {
  const transit = useStore((s) => s.transit)
  const toggleTransit = useStore((s) => s.toggleTransit)
  const showCompanies = useStore((s) => s.showCompanies)
  const showLandmarks = useStore((s) => s.showLandmarks)
  const heat = useStore((s) => s.heat)
  const toggleHeat = useStore((s) => s.toggleHeat)
  const toggle = useStore((s) => s.toggle)
  const quest = useStore((s) => s.activeQuest)
  return (
    <aside className={'layers' + (quest ? ' is-away' : '')} aria-hidden={!!quest}>
      <div className="layers__title">Layers</div>
      {MODES.map(({ m, label, swatch }) => (
        <label key={m} className="layers__row">
          <input type="checkbox" checked={transit[m]} onChange={() => toggleTransit(m)} />
          <i className="layers__swatch" style={{ background: swatch }} />
          <span>{label}</span>
        </label>
      ))}
      <div className="layers__sep" />
      <label className="layers__row">
        <input type="checkbox" checked={showCompanies} onChange={() => toggle('showCompanies')} />
        <i className="layers__swatch layers__swatch--sq" />
        <span>Companies</span>
      </label>
      <label className="layers__row">
        <input type="checkbox" checked={showLandmarks} onChange={() => toggle('showLandmarks')} />
        <i className="layers__swatch layers__swatch--tri" />
        <span>Landmarks</span>
      </label>
      <div className="layers__sep" />
      <label className="layers__row" title="Where the restaurants, cafés and fast food are (OpenStreetMap)">
        <input type="checkbox" checked={heat === 'food'} onChange={() => toggleHeat('food')} />
        <i className="layers__swatch layers__swatch--heat" />
        <span>Restaurants</span>
      </label>
      <label className="layers__row" title="Typical asking rent by ZIP code (Zillow Observed Rent Index)">
        <input type="checkbox" checked={heat === 'rent'} onChange={() => toggleHeat('rent')} />
        <i className="layers__swatch layers__swatch--rent" />
        <span>Rent</span>
      </label>
      {heat === 'rent' && <RentLegend />}
    </aside>
  )
}

/** Stepped legend for the rent wash; the classes come from the same module the pipeline painted with. */
function RentLegend() {
  const [meta, setMeta] = useState<RentData | null>(null)
  useEffect(() => {
    fetch('/data/rent.json').then((r) => r.json()).then(setMeta).catch(() => setMeta(null))
  }, [])
  const bounds = RENT_CLASSES.slice(0, -1).map((c) => c.max)
  return (
    <div className="layers__legend" aria-label="Rent legend">
      <div className="layers__legend-bar">
        {RENT_CLASSES.map((c) => (
          <i key={c.max} style={{ background: c.color }} />
        ))}
      </div>
      <div className="layers__legend-ticks">
        {bounds.map((b, i) => (
          <span key={b} style={{ left: `${((i + 1) / RENT_CLASSES.length) * 100}%` }}>
            {(i === 0 ? '$' : '') + fmtK(b)}
          </span>
        ))}
      </div>
      <div className="layers__legend-note">Asking rent / month · Zillow{meta ? ` · ${fmtMonth(meta.asOf)}` : ''}</div>
    </div>
  )
}
