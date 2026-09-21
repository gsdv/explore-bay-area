import earcut from 'earcut'

type Pt = [number, number]

/** Sutherland-Hodgman: the part of `poly` on the kept side of one axis-aligned edge (the clip window is convex, the subject need not be). */
function clip(poly: Pt[], axis: 0 | 1, limit: number, keepBelow: boolean): Pt[] {
  const inside = (p: Pt) => (keepBelow ? p[axis] <= limit : p[axis] >= limit)
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if (inside(a) !== inside(b)) {
      const t = (limit - a[axis]) / (b[axis] - a[axis])
      const hit: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      if (inside(a)) out.push(a, hit)
      else out.push(hit)
    } else if (inside(a)) out.push(a)
  }
  return out
}

/**
 * A ground polygon as triangles that follow the terrain: the ring (world x, z) is cut into `cell`-sized squares, each piece
 * triangulated and every vertex lifted to `yAt + lift`. Returns xyz triples, wound to face up.
 */
export function drapePolygon(ring: Pt[], yAt: (x: number, z: number) => number, cell = 0.5, lift = 0.05): number[] {
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1])
  const x0 = Math.floor(Math.min(...xs) / cell) * cell, x1 = Math.max(...xs)
  const z0 = Math.floor(Math.min(...zs) / cell) * cell, z1 = Math.max(...zs)
  const pos: number[] = []
  for (let x = x0; x < x1; x += cell) {
    const column = clip(clip(ring, 0, x, false), 0, x + cell, true)
    if (column.length < 3) continue
    for (let z = z0; z < z1; z += cell) {
      const piece = clip(clip(column, 1, z, false), 1, z + cell, true)
      if (piece.length < 3) continue
      const tri = earcut(piece.flat())
      for (let i = 0; i < tri.length; i += 3) {
        const [a, b, c] = [piece[tri[i]], piece[tri[i + 1]], piece[tri[i + 2]]]
        // in (x, z) a positive cross product faces down (y = z cross x), so flip those
        const up = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0
        for (const p of up ? [a, b, c] : [a, c, b]) pos.push(p[0], yAt(p[0], p[1]) + lift, p[1])
      }
    }
  }
  return pos
}

/** The ring as a closed polyline on the terrain, a point at least every `step`. */
export function drapeLine(ring: Pt[], yAt: (x: number, z: number) => number, step = 0.25, lift = 0.07): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let k = 0; k < n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n
      out.push([x, yAt(x, z) + lift, z])
    }
  }
  out.push(out[0])
  return out
}

/**
 * A flat band `width` wide centred on a closed draped polyline (as from `drapeLine`, last point = first), as xyz triples
 * wound to face up. Corners are mitred by averaging the two edge normals, which is plenty for a park's gentle outline.
 */
export function ribbon(line: [number, number, number][], width: number, lift = 0): number[] {
  const pts = line.slice(0, -1), n = pts.length
  const side = pts.map((p, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n]
    const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1
    const nx = (-dz / len) * (width / 2), nz = (dx / len) * (width / 2)
    return [[p[0] - nx, p[1] + lift, p[2] - nz], [p[0] + nx, p[1] + lift, p[2] + nz]]
  })
  const pos: number[] = []
  for (let i = 0; i < n; i++) {
    const [l0, r0] = side[i], [l1, r1] = side[(i + 1) % n]
    pos.push(...l0, ...r0, ...l1, ...r0, ...r1, ...l1)
  }
  return pos
}
