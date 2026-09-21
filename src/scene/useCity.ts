import { useEffect, useState } from 'react'
import type { CityPart, World } from '../lib/world'

/** The city parts that are in so far: the first view's to begin with, then each of the others as its files arrive. */
export function useCity(world: World): CityPart[] {
  const [parts, setParts] = useState(world.city)
  useEffect(() => {
    let alive = true
    for (const later of world.cityLater) {
      later.then((part) => {
        if (part && alive) setParts((have) => (have.some((p) => p.id === part.id) ? have : [...have, part]))
      })
    }
    return () => {
      alive = false
    }
  }, [world])
  return parts
}
