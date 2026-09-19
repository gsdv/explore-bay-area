import { helpStore } from './Help'
import { useStore } from '../store'

export function Header() {
  const openHelp = helpStore((s) => s.set)
  const quest = useStore((s) => s.activeQuest)
  const step = useStore((s) => s.questStep)
  const setQuest = useStore((s) => s.setQuest)
  const beginQuest = useStore((s) => s.beginQuest)
  const nextStop = useStore((s) => s.nextStop)
  const prevStop = useStore((s) => s.prevStop)

  if (!quest) {
    return (
      <header className="header">
        <div className="header__block" key="home">
          <div className="header__row">
            <h1 className="header__title">
              Explore <em>Bay Area</em>
            </h1>
            <button className="help-btn" onClick={() => openHelp(true)} aria-label="Controls help" title="Controls (?)">?</button>
          </div>
          <p className="header__sub">A field guide for newcomers. Drag to move, scroll to dive in, pick a quest, click anything.</p>
        </div>
      </header>
    )
  }

  const n = quest.stops.length
  const stop = step === null ? null : quest.stops[step]
  const last = step !== null && step === n - 1
  return (
    <header className="header is-quest" style={{ ['--quest' as any]: quest.color } as React.CSSProperties}>
      <div className="header__block" key={quest.id + ':' + (step ?? 'overview')}>
        <div className="header__row">
          <div className="header__eyebrow">
            {stop ? `Stop ${step! + 1} of ${n} · ${quest.title}` : `Quest · ${n} stops · ${quest.duration}`}
          </div>
          <button className="header__exit" onClick={() => setQuest(null)}>Exit quest ×</button>
        </div>
        <h1 className="header__title header__title--quest">{stop ? stop.name : quest.title}</h1>
        <p className="header__sub header__sub--quest">{stop ? stop.todo : quest.subtitle}</p>
        <div className="tour">
          {stop ? (
            <>
              <button className="tour__btn" onClick={prevStop} disabled={step === 0}>← Back</button>
              {last ? (
                <button className="tour__btn tour__btn--primary" onClick={() => setQuest(null)}>Finish ✓</button>
              ) : (
                <button className="tour__btn tour__btn--primary" onClick={nextStop}>Next: {quest.stops[step! + 1].name} →</button>
              )}
            </>
          ) : (
            <button className="tour__btn tour__btn--primary" onClick={beginQuest}>Begin the tour →</button>
          )}
        </div>
      </div>
    </header>
  )
}
