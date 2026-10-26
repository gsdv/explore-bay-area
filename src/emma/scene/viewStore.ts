import { create } from 'zustand'

export type ZoomTier = 'far' | 'mid' | 'near'

/** Camera state published by the rig (throttled): the screen-centre ground point, heading, distance and label tier. */
export const viewStore = create<{ x: number; z: number; yaw: number; dist: number; tier: ZoomTier }>(() => ({
  x: 0,
  z: 0,
  yaw: 0,
  dist: 100,
  tier: 'mid',
}))
export const useZoomTier = () => viewStore((s) => s.tier)
