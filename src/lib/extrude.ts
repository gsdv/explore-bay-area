import * as THREE from 'three'
import earcut from 'earcut'
import { BUILDING_EXAGGERATION, UNIT } from './geo'
import type { Building } from './world'

/**
 * Extrudes footprints into a single non-indexed geometry with flat normals and per-building tint.
 */
export function extrudeBuildings(buildings: Building[]): THREE.BufferGeometry {
  let vcount = 0
  for (const b of buildings) {
    const n = b.p.length / 2
    vcount += n * 6 + (n - 2) * 3
  }
  const pos = new Float32Array(vcount * 3)
  const nor = new Float32Array(vcount * 3)
  const col = new Float32Array(vcount * 3)
  let o = 0
  const c = new THREE.Color()
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z
    nor[o * 3] = nx; nor[o * 3 + 1] = ny; nor[o * 3 + 2] = nz
    col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b
    o++
  }
  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi]
    const n = b.p.length / 2
    const y0 = b.y - 0.05
    const y1 = b.y + b.h * UNIT * BUILDING_EXAGGERATION
    // tint: taller = cooler grey, low = warm cream
    const t = Math.min(1, b.h / 120)
    const hue = 0.1 - t * 0.05
    const k = (bi * 0.618) % 1
    c.setHSL(hue + k * 0.02, 0.18 - t * 0.1, 0.86 - k * 0.06 - t * 0.12)
    // signed area to orient walls outward
    let area = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      area += b.p[i * 2] * b.p[j * 2 + 1] - b.p[j * 2] * b.p[i * 2 + 1]
    }
    const ccw = area > 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const ax = b.p[i * 2], az = b.p[i * 2 + 1], bx = b.p[j * 2], bz = b.p[j * 2 + 1]
      let nx = az - bz, nz = bx - ax
      if (ccw) { nx = -nx; nz = -nz }
      const l = Math.hypot(nx, nz) || 1
      nx /= l; nz /= l
      // the winding has to follow the ring's direction too, not just the stored normal: back faces are culled, so a wall
      // wound inwards vanishes from outside (you saw the far wall's inside instead, which passes for solid under a roof)
      if (ccw) {
        push(ax, y0, az, nx, 0, nz); push(bx, y1, bz, nx, 0, nz); push(bx, y0, bz, nx, 0, nz)
        push(ax, y0, az, nx, 0, nz); push(ax, y1, az, nx, 0, nz); push(bx, y1, bz, nx, 0, nz)
      } else {
        push(ax, y0, az, nx, 0, nz); push(bx, y0, bz, nx, 0, nz); push(bx, y1, bz, nx, 0, nz)
        push(ax, y0, az, nx, 0, nz); push(bx, y1, bz, nx, 0, nz); push(ax, y1, az, nx, 0, nz)
      }
    }
    // earcut winds its triangles the same way whichever way the ring runs, so wind each one to face up by its own sign
    // (flipping by the ring's direction left every clockwise footprint, the piers among them, with a culled roof)
    const tri = earcut(b.p)
    for (let i = 0; i < tri.length; i += 3) {
      const a = tri[i], bb = tri[i + 1], cc = tri[i + 2]
      const ax = b.p[a * 2], az = b.p[a * 2 + 1]
      const up = (b.p[bb * 2 + 1] - az) * (b.p[cc * 2] - ax) - (b.p[bb * 2] - ax) * (b.p[cc * 2 + 1] - az) > 0
      for (const idx of up ? [a, bb, cc] : [a, cc, bb]) push(b.p[idx * 2], y1, b.p[idx * 2 + 1], 0, 1, 0)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, o * 3), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, o * 3), 3))
  g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, o * 3), 3))
  g.computeBoundingSphere()
  return g
}
