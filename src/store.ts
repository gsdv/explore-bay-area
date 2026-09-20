import { create } from 'zustand'
import type { Company } from './data/companies'
import type { Landmark } from './data/landmarks'
import type { Quest } from './data/quests'
import { project } from './lib/geo'
import type { HeatKind } from './lib/world'

export type TransitMode = 'rail' | 'bus' | 'cable' | 'ferry'

export interface FlyTarget {
  x: number
  z: number
  /** camera distance from target */
  distance?: number
  /** jump without animating */
  instant?: boolean
  /** heading to arrive with (radians, 0 = north) */
  yaw?: number
  /** seconds */
  duration?: number
  nonce: number
}

interface State {
  hoveredLandmark: string | null
  selected: { kind: 'company'; item: Company } | { kind: 'landmark'; item: Landmark } | null
  activeQuest: Quest | null
  /** null = overview (not begun); otherwise the current stop index */
  questStep: number | null
  transit: Record<TransitMode, boolean>
  showCompanies: boolean
  showLandmarks: boolean
  /** which wash is draped over the terrain (restaurants, rent or the neighborhood atlas); at most one at a time */
  heat: HeatKind | null
  fly: FlyTarget | null
  loaded: boolean
  setHoveredLandmark: (id: string | null) => void
  select: (s: State['selected']) => void
  setQuest: (q: Quest | null) => void
  /** select a quest and fly to an overview of its route */
  openQuest: (q: Quest) => void
  beginQuest: () => void
  goToStop: (i: number) => void
  nextStop: () => void
  prevStop: () => void
  toggleTransit: (m: TransitMode) => void
  toggle: (k: 'showCompanies' | 'showLandmarks') => void
  /** turn a wash on, or off if it is already showing */
  toggleHeat: (k: HeatKind) => void
  flyTo: (x: number, z: number, distance?: number, instant?: boolean, extra?: { yaw?: number; duration?: number }) => void
  setLoaded: () => void
}

export const useStore = create<State>((set, get) => ({
  hoveredLandmark: null,
  selected: null,
  activeQuest: null,
  questStep: null,
  transit: { rail: true, bus: false, cable: true, ferry: true },
  showCompanies: true,
  showLandmarks: true,
  heat: null,
  fly: null,
  loaded: false,
  setHoveredLandmark: (id) => set({ hoveredLandmark: id }),
  select: (selected) => set({ selected }),
  setQuest: (activeQuest) => set({ activeQuest, questStep: null, selected: null }),
  openQuest: (q) => {
    set({ activeQuest: q, questStep: null, selected: null })
    const xs = q.stops.map((s) => project(s.lat, s.lng))
    const cx = xs.reduce((a, p) => a + p[0], 0) / xs.length
    const cz = xs.reduce((a, p) => a + p[1], 0) / xs.length
    const span = Math.max(...xs.map((p) => Math.hypot(p[0] - cx, p[1] - cz)))
    get().flyTo(cx, cz, Math.max(18, span * 2.6), false, { duration: 1.8 })
  },
  beginQuest: () => get().goToStop(0),
  goToStop: (i) => {
    const q = get().activeQuest
    if (!q) return
    const stop = q.stops[Math.max(0, Math.min(q.stops.length - 1, i))]
    const [x, z] = project(stop.lat, stop.lng)
    set({ questStep: q.stops.indexOf(stop), selected: null })
    get().flyTo(x, z, stop.view?.dist ?? 12, false, { yaw: stop.view?.yaw, duration: 2.2 })
  },
  nextStop: () => {
    const { activeQuest, questStep, goToStop } = get()
    if (!activeQuest) return
    goToStop(questStep === null ? 0 : questStep + 1)
  },
  prevStop: () => {
    const { questStep, goToStop } = get()
    if (questStep === null || questStep === 0) return
    goToStop(questStep - 1)
  },
  toggleTransit: (m) => set({ transit: { ...get().transit, [m]: !get().transit[m] } }),
  toggle: (k) => set({ [k]: !get()[k] } as any),
  toggleHeat: (k) => set({ heat: get().heat === k ? null : k }),
  flyTo: (x, z, distance, instant, extra) => set({ fly: { x, z, distance, instant, ...extra, nonce: Math.random() } }),
  setLoaded: () => set({ loaded: true }),
}))
