import { useState } from 'react'
import { quests } from '../data/quests'
import { useStore } from '../store'

/** The quest list. Hidden while a quest is active; the header takes over as the tour guide. */
export function QuestPanel() {
  const active = useStore((s) => s.activeQuest)
  const openQuest = useStore((s) => s.openQuest)
  const [open, setOpen] = useState(true)
  if (active) return null

  return (
    <aside className={'quests' + (open ? '' : ' is-collapsed')}>
      <button className="quests__head" onClick={() => setOpen((o) => !o)}>
        <span className="quests__eyebrow">Nº —</span>
        <span className="quests__title">Quests</span>
        <span className="quests__chev">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <ol className="quests__list">
          {quests.map((q, i) => (
            <li key={q.id}>
              <button className="quest" onClick={() => openQuest(q)} style={{ ['--quest' as any]: q.color }}>
                <span className="quest__n">0{i + 1}</span>
                <span className="quest__body">
                  <span className="quest__title">{q.title}</span>
                  <span className="quest__meta">
                    {q.stops.length} stops · {q.duration} · {q.difficulty}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
