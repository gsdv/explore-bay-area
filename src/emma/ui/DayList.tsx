import { days, dayLabel, timeRange } from '../days'
import { useStore } from '../store'

/** The home screen: the title and the three days, each a way into its tour. Hidden while a day is open. */
export function DayList() {
  const day = useStore((s) => s.day)
  const openDay = useStore((s) => s.openDay)
  if (day) return null
  return (
    <div className="home">
      <header className="home__head">
        <div className="eyebrow">A field guide for Emma</div>
        <h1 className="home__title">
          San Francisco, <em>in three days</em>
        </h1>
        <p className="home__sub">Pick a day. Each one runs from breakfast to the last stop of the night, and the map flies you from place to place.</p>
      </header>
      <ol className="days">
        {days.map((d, i) => {
          const { weekday, date } = dayLabel(d)
          const first = d.stops[0], last = d.stops[d.stops.length - 1]
          return (
            <li key={d.id}>
              <button className="day-row" onClick={() => openDay(d)} style={{ ['--day' as any]: d.color }}>
                <span className="day-row__date">
                  <span className="day-row__n">Day {i + 1}</span>
                  <span className="day-row__weekday">{weekday}</span>
                  <span className="day-row__day">{date}</span>
                </span>
                <span className="day-row__body">
                  <span className="day-row__title">{d.title}</span>
                  <span className="day-row__meta">
                    {d.stops.length} stops · {timeRange(first.start, last.end)}
                  </span>
                </span>
                <span className="day-row__go" aria-hidden>→</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
