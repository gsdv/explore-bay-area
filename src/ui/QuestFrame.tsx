import { useEffect } from 'react'
import { useStore } from '../store'

/** A coloured frame around the viewport while a quest is active; Esc exits the quest when nothing else is open. */
export function QuestFrame() {
  const quest = useStore((s) => s.activeQuest)
  const setQuest = useStore((s) => s.setQuest)
  useEffect(() => {
    if (!quest) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = useStore.getState()
      if (s.selected || document.querySelector('.modal, .minimap.is-open')) return
      setQuest(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quest, setQuest])
  if (!quest) return null
  return <div className="quest-frame" key={quest.id} style={{ ['--quest' as any]: quest.color }} aria-hidden />
}
