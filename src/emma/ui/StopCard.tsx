import { dayLabel, duration, timeRange, KIND_LABEL } from '../days'
import { useStore } from '../store'

/**
 * Right: the tour guide for the open day. Before it starts, the day's introduction and a way in; then the current stop
 * in full (time range and length, what to do, how to get there, tips) with Back / Next, which fly the camera.
 */
export function StopCard() {
  const day = useStore((s) => s.day)
  const step = useStore((s) => s.step)
  const goToStop = useStore((s) => s.goToStop)
  const nextStop = useStore((s) => s.nextStop)
  const prevStop = useStore((s) => s.prevStop)
  const closeDay = useStore((s) => s.closeDay)
  if (!day) return null
  const n = day.stops.length
  const first = day.stops[0], last = day.stops[n - 1]
  const { weekday, date } = dayLabel(day)

  if (step === null) {
    return (
      <section className="stop" key={day.id + ':intro'} style={{ ['--day' as any]: day.color }}>
        <div className="stop__top">
          <div className="eyebrow">
            {weekday} · {date} · {n} stops
          </div>
          <button className="link-btn" onClick={closeDay}>All days ×</button>
        </div>
        <h2 className="stop__title">{day.title}</h2>
        <div className="stop__when">{timeRange(first.start, last.end)}</div>
        <p className="stop__about">{day.intro}</p>
        <div className="stop__nav">
          <button className="btn btn--primary" onClick={() => goToStop(0)}>Start the day →</button>
        </div>
      </section>
    )
  }

  const s = day.stops[step]
  const next = day.stops[step + 1]
  return (
    <section className="stop" key={day.id + ':' + s.id} style={{ ['--day' as any]: day.color }}>
      <div className="stop__top">
        <div className="eyebrow">
          Stop {step + 1} of {n} · {weekday}
        </div>
        <button className="link-btn" onClick={closeDay}>All days ×</button>
      </div>
      <div className="stop__when">
        {timeRange(s.start, s.end)} <span className="stop__len">· about {duration(s.start, s.end)}</span>
        <span className="stop__kind">{KIND_LABEL[s.kind]}</span>
      </div>
      <h2 className="stop__title">{s.title}</h2>
      <div className="stop__place">{s.place}</div>
      {s.getThere && (
        <p className="stop__there">
          <span className="stop__label">Getting there</span> {s.getThere}
        </p>
      )}
      <p className="stop__about">{s.about}</p>
      {s.tips?.length ? (
        <ul className="stop__tips">
          {s.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
      <div className="stop__nav">
        <button className="btn" onClick={prevStop} disabled={step === 0}>← Back</button>
        {next ? (
          <button className="btn btn--primary" onClick={nextStop}>
            Next: {next.title} →
          </button>
        ) : (
          <button className="btn btn--primary" onClick={closeDay}>End of the day ✓</button>
        )}
      </div>
    </section>
  )
}
