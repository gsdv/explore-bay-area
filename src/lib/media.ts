import { useSyncExternalStore } from 'react'

/** Phones (and short landscape screens): panels start folded and the layout goes bottom-sheet. Mirrors the CSS breakpoint. */
export const COMPACT = '(max-width: 640px), (max-height: 520px)'
/** A finger, not a mouse: no hover, no keyboard to speak of. */
export const TOUCH = '(hover: none) and (pointer: coarse)'

export const matches = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches

export function useMedia(q: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matches(q),
  )
}
