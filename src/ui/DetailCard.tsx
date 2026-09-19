import { useEffect } from 'react'
import { useStore } from '../store'
import { logoUrl } from '../data/companies'
import { project } from '../lib/geo'

const fmtCap = (b: number) => (b >= 1000 ? `$${(b / 1000).toFixed(2)} trillion` : `$${Math.round(b)} billion`)
const fmtN = (n: number) => n.toLocaleString('en-US')

export function DetailCard() {
  const sel = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const flyTo = useStore((s) => s.flyTo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])
  if (!sel) return null

  if (sel.kind === 'company') {
    const c = sel.item
    return (
      <article className="card">
        <button className="card__close" onClick={() => select(null)} aria-label="close">×</button>
        <div className="card__eyebrow">Company · {c.city}</div>
        <h2 className="card__title">
          <img src={logoUrl(c)} alt="" width={28} height={28} /> {c.name}
        </h2>
        <p className="card__blurb">{c.blurb}</p>
        <dl className="card__facts">
          <dt>{c.isPrivate ? 'Valuation' : 'Market cap'}</dt>
          <dd>{fmtCap(c.cap)}{c.isPrivate ? ' (private)' : ''}</dd>
          <dt>Employees</dt>
          <dd>~{fmtN(c.employees)}</dd>
          <dt>Founded</dt>
          <dd>{c.founded}</dd>
        </dl>
        <div className="card__feed">
          <div className="card__feed-head">
            Latest from {c.twitter ? `@${c.twitter}` : 'the company'}
          </div>
          <div className="card__feed-empty">Feed coming soon. Posts will be pulled from X via Apify.</div>
        </div>
        <button className="card__fly" onClick={() => { const [x, z] = project(c.lat, c.lng); flyTo(x, z, 10) }}>Fly there →</button>
      </article>
    )
  }

  const l = sel.item
  return (
    <article className="card">
      <button className="card__close" onClick={() => select(null)} aria-label="close">×</button>
      <div className="card__eyebrow">Landmark · {l.area}</div>
      <h2 className="card__title">{l.name}</h2>
      <p className="card__blurb">{l.blurb}</p>
      {l.tip && (
        <p className="card__tip">
          <strong>Local tip.</strong> {l.tip}
        </p>
      )}
      {l.tags && (
        <div className="card__tags">
          {l.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
      <button className="card__fly" onClick={() => { const [x, z] = project(l.lat, l.lng); flyTo(x, z, 10) }}>Fly there →</button>
    </article>
  )
}
