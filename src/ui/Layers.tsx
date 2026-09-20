import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore, type TransitMode } from '../store'
import { RENT_CLASSES, fmtK } from '../lib/rent'

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
  const [open, setOpen] = useState(true)
  const panel = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const rentRow = useRef<HTMLLabelElement>(null)

  // L folds the panel away; checkboxes keep focus after a click, so only real text fields swallow the key
  useEffect(() => {
    if (quest) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'l' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (/^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox'))) return
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quest])

  // the rent key lives outside the folding body (which clips), so tell it where its row is. Rows are pinned to the
  // panel's bottom edge while it folds, so the distance from that edge holds in every state.
  useLayoutEffect(() => {
    const place = () => {
      const el = panel.current
      const row = rentRow.current?.getBoundingClientRect()
      if (!el || !row) return
      const bottom = el.getBoundingClientRect().bottom - el.clientTop
      el.style.setProperty('--key-b', `${bottom - (row.top + row.height / 2)}px`)
    }
    place()
    const ro = new ResizeObserver(place)
    if (body.current) ro.observe(body.current)
    return () => ro.disconnect()
  }, [])

  return (
    <aside ref={panel} className={'layers' + (quest ? ' is-away' : '') + (open ? '' : ' is-collapsed')} aria-hidden={!!quest}>
      <button className="layers__head" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={open ? 'Minimise (L)' : 'Show layers (L)'}>
        <span className="layers__title">Layers</span>
        <kbd className="layers__key">L</kbd>
        <span className="layers__chev">{open ? '–' : '+'}</span>
      </button>
      <div className="layers__fold">
        <div ref={body} className="layers__body">
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
            <span className="layers__emoji" aria-hidden>🏢</span>
            <span>Companies</span>
          </label>
          <label className="layers__row">
            <input type="checkbox" checked={showLandmarks} onChange={() => toggle('showLandmarks')} />
            <span className="layers__emoji" aria-hidden>🌉</span>
            <span>Landmarks</span>
          </label>
          <div className="layers__sep" />
          <label className="layers__row" title="Where the restaurants, cafés and fast food are (OpenStreetMap)">
            <input type="checkbox" checked={heat === 'food'} onChange={() => toggleHeat('food')} />
            <span className="layers__emoji" aria-hidden>🍔</span>
            <span>Restaurants</span>
          </label>
          <label ref={rentRow} className="layers__row" title="Typical asking rent per month by ZIP code (Zillow Observed Rent Index)">
            <input type="checkbox" checked={heat === 'rent'} onChange={() => toggleHeat('rent')} />
            <span className="layers__emoji" aria-hidden>🏠</span>
            <span>Rent</span>
          </label>
          <label className="layers__row" title="San Francisco's neighborhoods and every other city and town, coloured like an atlas">
            <input type="checkbox" checked={heat === 'hoods'} onChange={() => toggleHeat('hoods')} />
            <span className="layers__emoji" aria-hidden>🗺️</span>
            <span>Neighborhoods</span>
          </label>
        </div>
      </div>
      <RentLegend on={heat === 'rent' && open} />
    </aside>
  )
}

/**
 * Stepped legend for the rent wash; the classes come from the same module the pipeline painted with.
 * It hangs off the panel's edge beside its row (`--key-b`; always mounted, faded by `on`) so the panel never changes height.
 */
function RentLegend({ on }: { on: boolean }) {
  const bounds = RENT_CLASSES.slice(0, -1).map((c) => c.max)
  return (
    <div className={'layers__legend' + (on ? ' is-on' : '')} aria-label="Rent legend" aria-hidden={!on}>
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
    </div>
  )
}
