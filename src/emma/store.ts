import { create } from 'zustand'
import { project } from '../lib/geo'
import type { Day } from './days'

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
  /** world units: something this tall stands there, so aim at its middle and back off until all of it is in frame */
  height?: number
  nonce: number
}

interface State {
  hoveredLandmark: string | null
  fly: FlyTarget | null
  /** the day being toured, or null on the day list */
  day: Day | null
  /** null = the day's overview (not started); otherwise the current stop index */
  step: number | null
  setHoveredLandmark: (id: string | null) => void
  flyTo: (x: number, z: number, distance?: number, instant?: boolean, extra?: { yaw?: number; duration?: number; height?: number }) => void
  /** enter a day and fly to an overview of its route */
  openDay: (day: Day) => void
  closeDay: () => void
  goToStop: (i: number) => void
  nextStop: () => void
  prevStop: () => void
}

export const useStore = create<State>((set, get) => ({
  hoveredLandmark: null,
  fly: null,
  day: null,
  step: null,
  setHoveredLandmark: (id) => set({ hoveredLandmark: id }),
  flyTo: (x, z, distance, instant, extra) => set({ fly: { x, z, distance, instant, ...extra, nonce: Math.random() } }),
  openDay: (day) => {
    set({ day, step: null, hoveredLandmark: null })
    // centred on the middle of the route's extent, not the average stop: a day of six stops downtown and one at the bridge
    // would otherwise sit off to one side
    const xs = day.stops.map((s) => project(s.lat, s.lng))
    const cx = (Math.min(...xs.map((p) => p[0])) + Math.max(...xs.map((p) => p[0]))) / 2
    const cz = (Math.min(...xs.map((p) => p[1])) + Math.max(...xs.map((p) => p[1]))) / 2
    const span = Math.max(...xs.map((p) => Math.hypot(p[0] - cx, p[1] - cz)))
    // the lens is fixed vertically, so a portrait phone sees less ground across: back off until the route fits sideways;
    // the schedule and the stop card cover both sides of the screen, so leave room for them too
    const narrow = Math.min(2.2, Math.max(1, window.innerHeight / window.innerWidth))
    get().flyTo(cx, cz, Math.max(18, span * 3.2 * narrow), false, { yaw: 0, duration: 1.8 })
  },
  closeDay: () => set({ day: null, step: null }),
  goToStop: (i) => {
    const day = get().day
    if (!day) return
    const at = Math.max(0, Math.min(day.stops.length - 1, i))
    const stop = day.stops[at]
    const [x, z] = project(stop.lat, stop.lng)
    set({ step: at })
    get().flyTo(x, z, stop.view?.dist ?? 12, false, { yaw: stop.view?.yaw, duration: 2.2 })
  },
  nextStop: () => {
    const { day, step, goToStop } = get()
    if (!day) return
    goToStop(step === null ? 0 : step + 1)
  },
  prevStop: () => {
    const { step, goToStop } = get()
    if (step === null || step === 0) return
    goToStop(step - 1)
  },
}))
