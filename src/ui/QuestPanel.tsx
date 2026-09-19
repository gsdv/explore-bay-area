import { useState } from 'react'
import { quests } from '../data/quests'
import { useStore } from '../store'
import { project } from '../lib/geo'
import { landmarks } from '../data/landmarks'
import { companies } from '../data/companies'

export function QuestPanel() {
  const active = useStore((s) => s.activeQuest)
  const setQuest = useStore((s) => s.setQuest)
  const progress = useStore((s) => s.questProgress)
  const toggleStop = useStore((s) => s.toggleStop)
  const flyTo = useStore((s) => s.flyTo)
  const select = useStore((s) => s.select)
  const [open, setOpen] = useState(true)

  const start = (q: (typeof quests)[number]) => {
    setQuest(q)
    const xs = q.stops.map((s) => project(s.lat, s.lng))
    const cx = xs.reduce((a, p) => a + p[0], 0) / xs.length
    const cz = xs.reduce((a, p) => a + p[1], 0) / xs.length
    const span = Math.max(...xs.map((p) => Math.hypot(p[0] - cx, p[1] - cz)))
    flyTo(cx, cz, Math.max(18, span * 2.6))
  }

  return (
    <aside className={'quests' + (open ? '' : ' is-collapsed') + (active ? ' is-quest' : '')}>
      <button className="quests__head" onClick={() => setOpen((o) => !o)}>
        <span className="quests__eyebrow">{active ? `Nº ${quests.indexOf(active) + 1}` : 'Nº —'}</span>
        <span className="quests__title">{active ? 'Stops' : 'Quests'}</span>
        <span className="quests__chev">{open ? '–' : '+'}</span>
      </button>
      {open && !active && (
        <ol className="quests__list">
          {quests.map((q, i) => {
            const done = (progress[q.id] ?? []).length
            return (
              <li key={q.id}>
                <button className="quest" onClick={() => start(q)} style={{ ['--quest' as any]: q.color }}>
                  <span className="quest__n">0{i + 1}</span>
                  <span className="quest__body">
                    <span className="quest__title">{q.title}</span>
                    <span className="quest__meta">
                      {q.stops.length} stops · {q.duration} · {q.difficulty}
                      {done ? ` · ${done}/${q.stops.length} done` : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {open && active && (
        <div className="quest-detail" style={{ ['--quest' as any]: active.color }}>
          <ol className="quest-detail__stops">
            {active.stops.map((s, i) => {
              const done = (progress[active.id] ?? []).includes(s.id)
              return (
                <li key={s.id} className={done ? 'is-done' : ''}>
                  <button className="stop__check" onClick={() => toggleStop(active.id, s.id)} aria-label="toggle done">
                    {done ? '✓' : i + 1}
                  </button>
                  <div className="stop__body">
                    <button
                      className="stop__name"
                      onClick={() => {
                        const [x, z] = project(s.lat, s.lng)
                        flyTo(x, z, 14)
                        if (s.ref?.kind === 'landmark') {
                          const l = landmarks.find((l) => l.id === s.ref!.id)
                          if (l) select({ kind: 'landmark', item: l })
                        } else if (s.ref?.kind === 'company') {
                          const c = companies.find((c) => c.id === s.ref!.id)
                          if (c) select({ kind: 'company', item: c })
                        }
                      }}
                    >
                      {s.name}
                    </button>
                    <div className="stop__todo">{s.todo}</div>
                  </div>
                </li>
              )
            })}
          </ol>
          <button className="quest-detail__back" onClick={() => setQuest(null)}>← All quests</button>
        </div>
      )}
    </aside>
  )
}
