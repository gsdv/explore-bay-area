import { create } from 'zustand'

export type ZoomTier = 'far' | 'mid' | 'near'

/** Camera state published by the rig (throttled) for UI such as the minimap and label tiers. */
export const viewStore = create<{ x: number; z: number; yaw: number; dist: number; tier: ZoomTier }>(() => ({
  x: 0,
  z: 0,
  yaw: 0,
  dist: 100,
  tier: 'mid',
}))
export const useView = () => viewStore()
export const useZoomTier = () => viewStore((s) => s.tier)
export const useCameraDistance = () => viewStore((s) => s.dist)
