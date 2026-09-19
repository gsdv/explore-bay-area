import { useEffect } from 'react'
import { useStore } from '../store'
import { logoUrl } from '../data/companies'
import { project } from '../lib/geo'
import { fmtCount, fmtDate, fmtWhen, useTweets } from '../lib/tweets'

function Feed({ companyId, handle }: { companyId: string; handle: string }) {
  const feed = useTweets(companyId)
  const profile = `https://x.com/${handle}`
  return (
    <section className="card__feed">
      <div className="card__feed-head">
        <a href={profile} target="_blank" rel="noopener noreferrer">Latest from @{handle}</a>
        {feed.status === 'ready' && feed.posts.length > 0 && <span>as of {fmtDate(feed.fetchedAt)}</span>}
      </div>
      {feed.status === 'loading' && <div className="card__feed-empty">Loading posts…</div>}
      {feed.status === 'error' && <div className="card__feed-empty">Posts are unavailable right now.</div>}
      {feed.status === 'ready' && feed.posts.length === 0 && (
        <div className="card__feed-empty">No recent posts found for @{handle}.</div>
      )}
      {feed.status === 'ready' && feed.posts.length > 0 && (
        <ol className="card__posts">
          {feed.posts.map((p) => (
            <li key={p.id}>
              <a className="card__post" href={p.url} target="_blank" rel="noopener noreferrer">
                <time dateTime={p.createdAt}>{fmtWhen(p.createdAt)}</time>
                <p>{p.text}</p>
                <span className="card__post-meta">
                  {fmtCount(p.likes)} likes · {fmtCount(p.reposts)} reposts
                  {p.views != null && p.views > 0 && ` · ${fmtCount(p.views)} views`}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

const fmtCap = (b: number) => (b >= 1000 ? `$${(b / 1000).toFixed(2)} trillion` : `$${Math.round(b)} billion`)
const fmtN = (n: number) => n.toLocaleString('en-US')

export function DetailCard() {
  const sel = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const flyTo = useStore((s) => s.flyTo)
  const inQuest = useStore((s) => !!s.activeQuest)
  const cardClass = 'card' + (inQuest ? ' is-below' : '')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])
  if (!sel) return null

  if (sel.kind === 'company') {
    const c = sel.item
    return (
      <article className={cardClass} key={'c-' + c.id}>
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
        {c.twitter && <Feed companyId={c.id} handle={c.twitter} />}
        <button className="card__fly" onClick={() => { const [x, z] = project(c.lat, c.lng); flyTo(x, z, 10) }}>Fly there →</button>
      </article>
    )
  }

  const l = sel.item
  return (
    <article className={cardClass} key={'l-' + l.id}>
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
