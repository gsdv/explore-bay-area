import { useStore, type TransitMode } from '../store'

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
  const showFood = useStore((s) => s.showFood)
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
        <input type="checkbox" checked={showFood} onChange={() => toggle('showFood')} />
        <i className="layers__swatch layers__swatch--heat" />
        <span>Restaurants</span>
      </label>
    </aside>
  )
}
