import { helpStore } from './Help'

export function Header() {
  const openHelp = helpStore((s) => s.set)
  return (
    <header className="header">
      <div className="header__row">
        <h1 className="header__title">
          Explore <em>Bay Area</em>
        </h1>
        <button className="help-btn" onClick={() => openHelp(true)} aria-label="Controls help" title="Controls (?)">?</button>
      </div>
      <p className="header__sub">A field guide for newcomers. Drag to look around, pick a quest, click anything.</p>
    </header>
  )
}
