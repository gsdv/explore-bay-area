import { helpStore } from './Help'
import { useStore } from '../store'

export function Header() {
  const openHelp = helpStore((s) => s.set)
  const quest = useStore((s) => s.activeQuest)
  const setQuest = useStore((s) => s.setQuest)
  return (
    <header className={'header' + (quest ? ' is-quest' : '')} style={quest ? ({ ['--quest' as any]: quest.color } as React.CSSProperties) : undefined}>
      {quest ? (
        <div className="header__block" key={quest.id}>
          <div className="header__row">
            <div className="header__eyebrow">Quest · {quest.stops.length} stops · {quest.duration}</div>
            <button className="header__exit" onClick={() => setQuest(null)}>Exit quest ×</button>
          </div>
          <h1 className="header__title header__title--quest">{quest.title}</h1>
          <p className="header__sub header__sub--quest">{quest.subtitle}</p>
        </div>
      ) : (
        <div className="header__block" key="home">
          <div className="header__row">
            <h1 className="header__title">
              Explore <em>Bay Area</em>
            </h1>
            <button className="help-btn" onClick={() => openHelp(true)} aria-label="Controls help" title="Controls (?)">?</button>
          </div>
          <p className="header__sub">A field guide for newcomers. Drag to move, scroll to dive in, pick a quest, click anything.</p>
        </div>
      )}
    </header>
  )
}
