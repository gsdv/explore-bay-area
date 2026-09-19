import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { viewStore } from './viewStore'

/** Dev-only: writes frame time and draw stats to <html data-perf> once a second. */
export function DevStats() {
  const acc = useRef({ t: 0, n: 0, worst: 0 })
  useFrame(({ gl }, dt) => {
    const a = acc.current
    if (dt > 0.5) return // tab was hidden; not a real frame
    a.t += dt
    a.n++
    a.worst = Math.max(a.worst, dt)
    if (a.t >= 1) {
      document.documentElement.dataset.perf = JSON.stringify({
        fps: Math.round(a.n / a.t),
        worstMs: Math.round(a.worst * 1000),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      })
      const v = viewStore.getState()
      document.documentElement.dataset.view = JSON.stringify({ x: +v.x.toFixed(1), z: +v.z.toFixed(1), yaw: +v.yaw.toFixed(2), dist: +v.dist.toFixed(1), tier: v.tier })
      a.t = 0; a.n = 0; a.worst = 0
    }
  })
  return null
}
