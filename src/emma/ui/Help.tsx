import { useEffect } from 'react'
import { create } from 'zustand'
import { TOUCH, useMedia } from '../../lib/media'

/** The controls window, opened by the ? button (home title, stop card) or the ? key. A copy of the main page's, for this map. */
export const helpStore = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }))

const ROWS: [string, string][] = [
  ['drag', 'grab the map and pan'],
  ['right-drag  /  ctrl-drag', 'look around (rotate and tilt)'],
  ['scroll  /  pinch', 'fly down toward the cursor, or back up'],
  ['R  /  F', 'straight up / down'],
  ['↑ ← ↓ →  or  W A S D', 'move over the map (shift = fast)'],
  ['Q  /  E', 'rotate'],
  ['double-click', 'fly to that spot'],
  ['click', 'open a landmark'],
  ['esc', 'close a card, or go back to the days'],
  ['?', 'this help'],
]

const TOUCH_ROWS: [string, string][] = [
  ['drag', 'grab the map and pan'],
  ['pinch', 'fly down, or back up'],
  ['two-finger twist', 'rotate'],
  ['two-finger slide', 'tilt the view (up or down)'],
  ['double-tap', 'fly to that spot'],
  ['tap', 'open a landmark'],
]

export function HelpButton() {
  const setOpen = helpStore((s) => s.set)
  return (
    <button className="help-btn" onClick={() => setOpen(true)} aria-label="Controls help" title="Controls (?)">?</button>
  )
}

export function Help() {
  const open = helpStore((s) => s.open)
  const setOpen = helpStore((s) => s.set)
  const touch = useMedia(TOUCH)
  useEffect(() => {
    // capture, so an Esc that closes this window doesn't also close the day or the landmark card underneath
    const onKey = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return
      if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) setOpen(!helpStore.getState().open)
      if (e.key === 'Escape' && helpStore.getState().open) {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [setOpen])
  if (!open) return null
  return (
    <div className="modal-scrim" onClick={() => setOpen(false)}>
      <div className="modal help" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Controls">
        <button className="card__close" onClick={() => setOpen(false)} aria-label="close">×</button>
        <div className="eyebrow">How to get around</div>
        <h2 className="card__title">{touch ? 'Gestures' : 'Controls'}</h2>
        <dl className="help__rows">
          {(touch ? TOUCH_ROWS : ROWS).map(([k, v]) => (
            <div key={k} className="help__row">
              <dt><kbd>{k}</kbd></dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="help__foot">The view tilts by itself: steep from high up, street-level when you're low. Open a day and the camera flies from stop to stop on its own; you can still look around at each one.</p>
      </div>
    </div>
  )
}
