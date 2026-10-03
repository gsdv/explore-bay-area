import { create } from 'zustand'
import { COMPACT, matches } from '../lib/media'
import { useStore } from '../store'

type Panel = 'quests' | 'layers'

/**
 * Fold state of the quest list and the Layers panel. On a phone both start folded and only one is open at a time
 * (they'd cover the whole map otherwise); opening a detail card folds both there.
 */
export const panelStore = create<Record<Panel, boolean> & { set: (p: Panel, open: boolean) => void }>((set) => {
  const roomy = !matches(COMPACT)
  return {
    quests: roomy,
    layers: roomy,
    set: (p, open) =>
      set(open && matches(COMPACT) ? { quests: p === 'quests', layers: p === 'layers' } : { [p]: open }),
  }
})

useStore.subscribe((s, prev) => {
  if (s.selected && s.selected !== prev.selected && matches(COMPACT)) panelStore.setState({ quests: false, layers: false })
})
