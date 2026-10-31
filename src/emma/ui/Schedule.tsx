import { clockLabel, dayLabel } from '../days'
import { useStore } from '../store'

/** Left: the open day's schedule as a printed agenda, one row per stop on a rail; the current stop is marked, any row jumps there. */
export function Schedule() {
  const day = useStore((s) => s.day)
  const step = useStore((s) => s.step)
  const goToStop = useStore((s) => s.goToStop)
  if (!day) return null
  const { weekday, date } = dayLabel(day)
  return (
    <aside className="schedule" key={day.id} style={{ ['--day' as any]: day.color }}>
      <div className="eyebrow">
        {weekday} · {date}
      </div>
      <h2 className="schedule__title">{day.title}</h2>
      <ol className="schedule__list">
        {day.stops.map((s, i) => {
          const state = step === null ? '' : i === step ? ' is-current' : i < step ? ' is-passed' : ''
          return (
            <li key={s.id}>
              <button className={'slot' + state} onClick={() => goToStop(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="slot__time">
                  <span className="slot__start">{clockLabel(s.start)}</span>
                  <span className="slot__end">to {clockLabel(s.end)}</span>
                </span>
                <span className="slot__dot" aria-hidden />
                <span className="slot__body">
                  <span className="slot__title">{s.title}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
