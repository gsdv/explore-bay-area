import { useEffect } from 'react'
import { useStore } from '../store'

/**
 * Right: a clicked landmark's description, as on the main page (where it is, what it is, a local tip, its tags, and a way to
 * fly there). Only on the home screen: opening a day clears the selection, and landmarks don't take clicks during a tour.
 * Esc or a click on empty map closes it.
 */
export function LandmarkCard() {
  const sel = useStore((s) => s.selected)
  const touring = useStore((s) => !!s.day)
  const select = useStore((s) => s.select)
  const flyTo = useStore((s) => s.flyTo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])
  if (!sel || touring) return null

  const l = sel.landmark
  return (
    <article className="card" key={l.id}>
      <button className="card__close" onClick={() => select(null)} aria-label="Close">×</button>
      <div className="eyebrow">Landmark · {l.area}</div>
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
      <button className="card__fly" onClick={() => flyTo(sel.x, sel.z, sel.dist, false, { height: sel.height })}>
        Fly there <span className="card__fly-arrow" aria-hidden>→</span>
      </button>
    </article>
  )
}
