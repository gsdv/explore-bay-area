import { useEffect } from 'react'
import { useStore } from '../store'

/** A border in the day's colour around the viewport while a day is open; Esc goes back to the day list. */
export function DayFrame() {
  const day = useStore((s) => s.day)
  const closeDay = useStore((s) => s.closeDay)
  useEffect(() => {
    if (!day) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [day, closeDay])
  if (!day) return null
  return <div className="day-frame" key={day.id} style={{ ['--day' as any]: day.color }} aria-hidden />
}
