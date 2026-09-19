import { create } from 'zustand'
import type { Company } from './data/companies'
import type { Landmark } from './data/landmarks'
import type { Quest } from './data/quests'

export type TransitMode = 'rail' | 'bus' | 'cable' | 'ferry'

export interface FlyTarget {
  x: number
  z: number
  /** camera distance from target */
  distance?: number
  nonce: number
}

interface State {
  hoveredLandmark: string | null
  selected: { kind: 'company'; item: Company } | { kind: 'landmark'; item: Landmark } | null
  activeQuest: Quest | null
  questProgress: Record<string, string[]> // questId -> stop ids done
  transit: Record<TransitMode, boolean>
  showCompanies: boolean
  showLandmarks: boolean
  fly: FlyTarget | null
  loaded: boolean
  setHoveredLandmark: (id: string | null) => void
  select: (s: State['selected']) => void
  setQuest: (q: Quest | null) => void
  toggleStop: (questId: string, stopId: string) => void
  toggleTransit: (m: TransitMode) => void
  toggle: (k: 'showCompanies' | 'showLandmarks') => void
  flyTo: (x: number, z: number, distance?: number) => void
  setLoaded: () => void
}

const savedProgress = (() => {
  try {
    return JSON.parse(localStorage.getItem('eba.progress') ?? '{}')
  } catch {
    return {}
  }
})()

export const useStore = create<State>((set, get) => ({
  hoveredLandmark: null,
  selected: null,
  activeQuest: null,
  questProgress: savedProgress,
  transit: { rail: true, bus: false, cable: true, ferry: true },
  showCompanies: true,
  showLandmarks: true,
  fly: null,
  loaded: false,
  setHoveredLandmark: (id) => set({ hoveredLandmark: id }),
  select: (selected) => set({ selected }),
  setQuest: (activeQuest) => set({ activeQuest }),
  toggleStop: (questId, stopId) => {
    const p = { ...get().questProgress }
    const done = new Set(p[questId] ?? [])
    done.has(stopId) ? done.delete(stopId) : done.add(stopId)
    p[questId] = [...done]
    try {
      localStorage.setItem('eba.progress', JSON.stringify(p))
    } catch {}
    set({ questProgress: p })
  },
  toggleTransit: (m) => set({ transit: { ...get().transit, [m]: !get().transit[m] } }),
  toggle: (k) => set({ [k]: !get()[k] } as any),
  flyTo: (x, z, distance) => set({ fly: { x, z, distance, nonce: Math.random() } }),
  setLoaded: () => set({ loaded: true }),
}))
