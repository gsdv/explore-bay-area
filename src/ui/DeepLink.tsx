import { useEffect } from 'react'
import { useStore } from '../store'
import { project } from '../lib/geo'
import { quests } from '../data/quests'
import { companies } from '../data/companies'
import { landmarks } from '../data/landmarks'

/**
 * URL hash deep links:  #at=lat,lng,dist   #quest=id   #company=id   #landmark=id
 * Applied on load and whenever the hash changes.
 */
export function DeepLink() {
  useEffect(() => {
    let first = true
    const apply = () => {
      const instant = first
      first = false
      const h = new URLSearchParams(location.hash.slice(1))
      const s = useStore.getState()
      const at = h.get('at')?.split(',').map(Number)
      if (at && at.length >= 2 && at.every((n) => Number.isFinite(n))) {
        const [x, z] = project(at[0], at[1])
        s.flyTo(x, z, at[2] || 20, instant)
      }
      const q = h.get('quest')
      if (q) s.setQuest(quests.find((x) => x.id === q) ?? null)
      const c = h.get('company')
      const l = h.get('landmark')
      if (c) {
        const item = companies.find((x) => x.id === c)
        if (item) {
          s.select({ kind: 'company', item })
          const [x, z] = project(item.lat, item.lng)
          if (!at) s.flyTo(x, z, 10, instant)
        }
      } else if (l) {
        const item = landmarks.find((x) => x.id === l)
        if (item) {
          s.select({ kind: 'landmark', item })
          const [x, z] = project(item.lat, item.lng)
          if (!at) s.flyTo(x, z, 10, instant)
        }
      }
    }
    // let the camera rig mount first
    const t = setTimeout(apply, 50)
    window.addEventListener('hashchange', apply)
    return () => {
      clearTimeout(t)
      window.removeEventListener('hashchange', apply)
    }
  }, [])
  return null
}
