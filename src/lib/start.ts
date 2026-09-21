/**
 * The ground point the first view centres on, read from the same deep links ui/DeepLink.tsx applies. Only a hint for
 * what to download first (lib/world.ts): a wrong guess just means that part of the city arrives a moment later.
 */
import { HOME_AT, project } from './geo'
import { companies } from '../data/companies'
import { landmarks } from '../data/landmarks'
import { quests } from '../data/quests'

export function startPoint(): [number, number] {
  const h = new URLSearchParams(location.hash.slice(1))
  const at = h.get('at')?.split(',').map(Number)
  if (at && at.length >= 2 && at.every((n) => Number.isFinite(n))) return project(at[0], at[1])
  const place = companies.find((c) => c.id === h.get('company')) ?? landmarks.find((l) => l.id === h.get('landmark'))
  if (place) return project(place.lat, place.lng)
  const stops = quests.find((q) => q.id === h.get('quest'))?.stops
  if (stops?.length) return project(stops.reduce((s, p) => s + p.lat, 0) / stops.length, stops.reduce((s, p) => s + p.lng, 0) / stops.length)
  return project(HOME_AT.lat, HOME_AT.lng)
}
