import { create } from 'zustand'

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
  setHoveredLandmark: (id: string | null) => void
  flyTo: (x: number, z: number, distance?: number, instant?: boolean, extra?: { yaw?: number; duration?: number; height?: number }) => void
}

export const useStore = create<State>((set) => ({
  hoveredLandmark: null,
  fly: null,
  setHoveredLandmark: (id) => set({ hoveredLandmark: id }),
  flyTo: (x, z, distance, instant, extra) => set({ fly: { x, z, distance, instant, ...extra, nonce: Math.random() } }),
}))
