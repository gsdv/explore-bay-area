/**
 * Building footprints → the box that best stands in for them.
 * Points are world [x, z] pairs (see geo.ts); areas come back in world units².
 */
type Pt = [number, number]

export interface Box {
  /** centre of the rectangle */
  x: number
  z: number
  /** long side, short side */
  w: number
  d: number
  /** rotation about +Y that turns the box's local x axis onto the long side */
  rot: number
  /** footprint area / rectangle area: 1 for a true rectangle, lower for L- and U-shapes */
  fill: number
  /** footprint area */
  area: number
  corners: Pt[]
}

export function ringArea(p: Pt[]): number {
  let a = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]
  return Math.abs(a) / 2
}

/** Andrew's monotone chain. */
function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (src: Pt[]) => {
    const h: Pt[] = []
    for (const q of src) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop()
      h.push(q)
    }
    h.pop()
    return h
  }
  return [...half(p), ...half(p.reverse())]
}

/** Minimum-area bounding rectangle: one of its sides always lies along a hull edge, so try each. */
export function fitBox(ring: Pt[]): Box | null {
  const h = hull(ring)
  if (h.length < 3) return null
  let best: { area: number; ux: number; uz: number; a0: number; a1: number; b0: number; b1: number } | null = null
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-6) continue
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
    for (const q of h) {
      const s = q[0] * ux + q[1] * uz, t = -q[0] * uz + q[1] * ux
      if (s < a0) a0 = s
      if (s > a1) a1 = s
      if (t < b0) b0 = t
      if (t > b1) b1 = t
    }
    const area = (a1 - a0) * (b1 - b0)
    if (!best || area < best.area) best = { area, ux, uz, a0, a1, b0, b1 }
  }
  if (!best || best.area < 1e-9) return null
  let { ux, uz } = best
  let w = best.a1 - best.a0, d = best.b1 - best.b0
  const cs = (best.a0 + best.a1) / 2, ct = (best.b0 + best.b1) / 2
  const x = cs * ux - ct * uz, z = cs * uz + ct * ux
  const at = (s: number, t: number): Pt => [x + s * ux - t * uz, z + s * uz + t * ux]
  const corners = [at(-w / 2, -d / 2), at(w / 2, -d / 2), at(w / 2, d / 2), at(-w / 2, d / 2)]
  if (d > w) {
    ;[w, d] = [d, w]
    ;[ux, uz] = [-uz, ux]
  }
  const area = ringArea(ring)
  // a Y rotation by θ sends local +x to (cos θ, 0, −sin θ)
  return { x, z, w, d, rot: Math.atan2(-uz, ux), fill: area / best.area, area, corners }
}
