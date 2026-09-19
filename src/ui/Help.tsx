import { useEffect } from 'react'
import { create } from 'zustand'

export const helpStore = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }))

const ROWS: [string, string][] = [
  ['drag', 'grab the map and pan'],
  ['right-drag  /  ctrl-drag', 'look around (rotate and tilt)'],
  ['scroll  /  pinch', 'fly down toward the cursor, or back up'],
  ['R  /  F', 'straight up / down'],
  ['↑ ← ↓ →  or  W A S D', 'move over the map (shift = fast)'],
  ['Q  /  E', 'rotate'],
  ['double-click', 'fly to that spot'],
  ['click', 'open a company or landmark'],
  ['esc', 'close anything'],
  ['?', 'this help'],
]

export function Help() {
  const open = helpStore((s) => s.open)
  const setOpen = helpStore((s) => s.set)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return
      if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) setOpen(!helpStore.getState().open)
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])
  return (
    <>
      {open && (
        <div className="modal-scrim" onClick={() => setOpen(false)}>
          <div className="modal help" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Controls">
            <button className="card__close" onClick={() => setOpen(false)} aria-label="close">×</button>
            <div className="card__eyebrow">How to get around</div>
            <h2 className="card__title">Controls</h2>
            <dl className="help__rows">
              {ROWS.map(([k, v]) => (
                <div key={k} className="help__row">
                  <dt><kbd>{k}</kbd></dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="help__foot">The view tilts by itself: steep from high up, street-level when you're low. The camera stays inside the Bay and above the rooftops. Click the small map in the corner to jump anywhere.</p>
          </div>
        </div>
      )}
    </>
  )
}
