import * as THREE from 'three'
import { UNIT, BUILDING_EXAGGERATION } from '../lib/geo'
import type { Part, Terrain } from './LandmarkModel'
import { BUILDINGS, DOCKS } from './sausalitoData'

const H = (m: number) => m * UNIT * BUILDING_EXAGGERATION
const M = (m: number) => m * UNIT
const r4 = (v: number) => +v.toFixed(4)

// ---------------------------------------------------------------- merged geometry: turned blocks and blobs

/**
 * Turned blocks: many boxes (args[0] = 0), roofs gabled along their long side (1) or hipped (2; a square one is a pyramid), each
 * [x, z, length, width, y0, y1, turn] in model units, the turn about +y bringing the block's x axis onto its length. Like
 * LandmarkModel's `blocks`, the part is normalised to its own bounds.
 */
function rblocksRaw(a: number[]): number[] {
  const mode = a[0], pos: number[] = []
  for (let i = 1; i + 6 < a.length; i += 7) {
    const [x, z, w, l, y0, y1, t] = a.slice(i, i + 7)
    const c = Math.cos(t), s = Math.sin(t), hw = w / 2, hl = l / 2
    const p = (lx: number, y: number, lz: number) => [x + lx * c + lz * s, y, z - lx * s + lz * c]
    const quad = (q0: number[], q1: number[], q2: number[], q3: number[]) => pos.push(...q0, ...q1, ...q2, ...q0, ...q2, ...q3)
    const tri = (q0: number[], q1: number[], q2: number[]) => pos.push(...q0, ...q1, ...q2)
    if (mode === 0) {
      quad(p(-hw, y0, hl), p(hw, y0, hl), p(hw, y1, hl), p(-hw, y1, hl))
      quad(p(hw, y0, -hl), p(-hw, y0, -hl), p(-hw, y1, -hl), p(hw, y1, -hl))
      quad(p(hw, y0, hl), p(hw, y0, -hl), p(hw, y1, -hl), p(hw, y1, hl))
      quad(p(-hw, y0, -hl), p(-hw, y0, hl), p(-hw, y1, hl), p(-hw, y1, -hl))
      quad(p(-hw, y1, hl), p(hw, y1, hl), p(hw, y1, -hl), p(-hw, y1, -hl))
      continue
    }
    // the ridge runs along x: the whole length for a gable, stopping short of the ends by the half-width for a hip
    const r = mode === 1 ? hw : Math.max(0, hw - hl)
    quad(p(-hw, y0, hl), p(hw, y0, hl), p(r, y1, 0), p(-r, y1, 0))
    quad(p(hw, y0, -hl), p(-hw, y0, -hl), p(-r, y1, 0), p(r, y1, 0))
    tri(p(hw, y0, hl), p(hw, y0, -hl), p(r, y1, 0))
    tri(p(-hw, y0, -hl), p(-hw, y0, hl), p(-r, y1, 0))
  }
  return pos
}

// a low-poly crown: the icosahedron's 20 faces, shared by every blob
const ICO = Array.from(new THREE.IcosahedronGeometry(1, 0).toNonIndexed().getAttribute('position').array as Float32Array)
/** Blobs: low-poly ellipsoids [x, y, z, rx, ry, rz] (tree crowns, rocks, an elephant's body), normalised to their own bounds. */
function blobsRaw(a: number[]): number[] {
  const pos: number[] = []
  for (let i = 0; i + 5 < a.length; i += 6) {
    const [x, y, z, rx, ry, rz] = a.slice(i, i + 6)
    for (let k = 0; k < ICO.length; k += 3) pos.push(x + ICO[k] * rx, y + ICO[k + 1] * ry, z + ICO[k + 2] * rz)
  }
  return pos
}

function bounds(pos: number[]) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3], pos[i])
    hi[i % 3] = Math.max(hi[i % 3], pos[i])
  }
  return { c: lo.map((v, k) => (v + hi[k]) / 2), s: lo.map((v, k) => Math.max(1e-4, hi[k] - v)) }
}

const raw = (geo: 'rblocks' | 'blobs', a: number[]) => (geo === 'rblocks' ? rblocksRaw(a) : blobsRaw(a))

/** The unit-box geometry of an `rblocks` or `blobs` part (see `partGeometry`). */
export function townGeometry(geo: 'rblocks' | 'blobs', a: number[]): THREE.BufferGeometry {
  const pos = raw(geo, a), { c, s } = bounds(pos)
  for (let i = 0; i < pos.length; i++) pos[i] = (pos[i] - c[i % 3]) / s[i % 3]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function merged(geo: 'rblocks' | 'blobs', args: number[], color: string, o: { scenery?: boolean } = {}): Part | null {
  if (args.length < 2) return null
  const { c, s } = bounds(raw(geo, args))
  return { geo, pos: c as [number, number, number], scale: s as [number, number, number], color, args: args.map(r4), detail: true, scenery: o.scenery }
}

// ---------------------------------------------------------------- the town

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const digits = (s: string, i: number, n: number) => {
  let v = 0
  for (let k = 0; k < n; k++) v = v * 64 + B64.indexOf(s[i + k])
  return v
}
interface Building { x: number; z: number; w: number; d: number; rot: number; kind: number; levels: number }
let decoded: Building[] | null = null
function buildings(): Building[] {
  if (decoded) return decoded
  const s = BUILDINGS.data, out: Building[] = []
  for (let i = 0; i + 9 < s.length; i += 10) {
    const kl = digits(s, i + 9, 1)
    out.push({
      x: M(digits(s, i, 2) - BUILDINGS.xOff), z: M(digits(s, i + 2, 2) - BUILDINGS.zOff),
      w: M(digits(s, i + 4, 2) / 10), d: M(digits(s, i + 6, 2) / 10),
      rot: (digits(s, i + 8, 1) / 64) * Math.PI, kind: kl >> 4, levels: kl & 15,
    })
  }
  return (decoded = out)
}

// Sausalito's palette: cream and white stucco, shingle browns, the odd pastel; roofs of slate, brown shake and Spanish tile.
// The floating homes are the loud ones.
const WALLS = ['#f3ede0', '#ebe1c9', '#d8c3a5', '#a9876a', '#dbe3e3', '#d3dbc6', '#f1dfb0', '#e9cdbd']
const ROOFS = ['#5d5752', '#7b5d4b', '#5d5752', '#a9573f', '#8f8a82', '#6e6259']
const SHOPS = ['#f6f1e6', '#efe2c4', '#f3d9a9', '#d9e4e8', '#c97a5d', '#e8d3c4']
const SHEDS = ['#d4cfc4', '#b8b1a4', '#a35b43', '#e6e2d8']
const HOMES = ['#e9c46a', '#2a9d8f', '#e76f51', '#8ab17d', '#f4f1de', '#9fc3dc', '#b5838d', '#7d6b91']
const LEAVES = ['#4f7d46', '#3f6b3e', '#5e8c4e', '#36603b']
const GLASS = '#4a5560', HULL = '#55504b', DECK = '#c9bea6', WHITE = '#f6f4ee', CONCRETE = '#d6d0c4'

/**
 * Sausalito, the hillside town across the Golden Gate. Every building is where OSM has it (sausalitoData.ts: houses stepping up
 * the hill, the shops along Bridgeway, the Marinship sheds, the floating homes of Waldo Point), dressed as the town looks:
 * pitched roofs in shake, slate and Spanish tile, a garden tree or two by each house, boats berthed all along the marina docks.
 * Hand-placed on top: Plaza Viña del Mar (the origin) with its fountain and the two elephants from the 1915 Exposition holding
 * up its lamps, under palms; the ferry landing with a Golden Gate ferry alongside; the Spinnaker on its point; Our Lady Star of
 * the Sea's steeple; the Taj Mahal houseboat's dome; and the bronze sea lion on its rock off the Bridgeway seawall. True plan
 * size: the town is 3 km long. Everything stands on the drawn terrain (`Terrain`; the heightmap runs 10-20 m off the mesh on
 * these slopes, enough to float or bury a house), and the town's hover target is its city outline
 * (areas.json), with hit boxes for the waterfront and Waldo Point, which lies outside the city limits.
 */
export function sausalito(terrain?: Terrain): Part[] {
  const gy = (x: number, z: number) => (terrain ? terrain.at(x, z) - terrain.origin : 0)
  const sea = terrain ? -terrain.origin : 0
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)]

  const walls = new Map<string, number[]>(), gables = new Map<string, number[]>(), hips = new Map<string, number[]>()
  const crowns = new Map<string, number[]>()
  const add = (m: Map<string, number[]>, color: string, ...v: number[]) => {
    if (!m.has(color)) m.set(color, [])
    m.get(color)!.push(...v)
  }
  const flats: number[] = [], glass: number[] = [], floats: number[] = [], spires: number[] = []

  // a coarse occupancy grid (10 m cells) so trees and boats keep out of the houses
  const taken = new Set<number>()
  const key = (x: number, z: number) => Math.floor(x / 0.1 + 1000) * 4000 + Math.floor(z / 0.1 + 1000)
  const occupy = (b: Building) => {
    const r = Math.max(b.w, b.d) / 2
    for (let dx = -r; dx <= r + 1e-6; dx += 0.05) for (let dz = -r; dz <= r + 1e-6; dz += 0.05) {
      const lx = dx * Math.cos(b.rot) - dz * Math.sin(b.rot), lz = dx * Math.sin(b.rot) + dz * Math.cos(b.rot)
      if (Math.abs(lx) <= b.w / 2 + 0.02 && Math.abs(lz) <= b.d / 2 + 0.02) taken.add(key(b.x + dx, b.z + dz))
    }
  }

  const homes: Building[] = []
  for (const b of buildings()) {
    occupy(b)
    if (b.kind >= 2) { homes.push(b); continue }
    const { x, z, rot } = b
    // stand on the lowest corner, so the downhill wall runs down to the slope like the town's houses on stilts
    const c = Math.cos(rot), s = Math.sin(rot)
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => gy(x + (u * b.w * c + v * b.d * s) / 2, z + (-u * b.w * s + v * b.d * c) / 2))
    const yc = Math.max(sea, gy(x, z)), y0 = Math.max(sea, Math.min(yc, ...corners)) - 0.012
    const big = b.kind === 1
    const marinship = big && x < -7 && yc < sea + 0.3
    const top = yc + H(b.levels * (marinship ? 4.5 : 3.1))
    const color = marinship ? pick(SHEDS) : big ? pick(SHOPS) : pick(WALLS)
    add(walls, color, x, z, b.w, b.d, y0, top, rot)
    const roll = rnd()
    if (big) {
      // a band of windows on every storey; downtown, under a hipped roof or a flat one behind a parapet; the Marinship's long
      // sheds get a low metal gable
      if (marinship && b.w > 0.3 && roll < 0.5) add(gables, '#9a958c', x, z, b.w + 0.01, b.d + 0.01, top, top + Math.min(b.d, 0.3) * 0.25, rot)
      else if (!marinship && roll < 0.45) add(hips, pick(ROOFS), x, z, b.w + 0.01, b.d + 0.01, top, top + Math.min(b.w, b.d, 0.3) * 0.32, rot)
      else flats.push(x, z, b.w + 0.006, b.d + 0.006, top, top + 0.008, rot)
      if (!marinship) for (let k = 0; k < b.levels; k++) {
        const yw = yc + H(k * 3.1 + 1.2)
        glass.push(x, z, b.w + 0.004, b.d + 0.004, yw, yw + H(1.3), rot)
      }
      continue
    }
    // houses: mostly pitched, a quarter flat-roofed modern ones
    const pitch = Math.min(b.w, b.d) * 0.42
    if (roll < 0.56) add(gables, pick(ROOFS), x, z, b.w + 0.008, b.d + 0.008, top, top + pitch, rot)
    else if (roll < 0.76) add(hips, pick(ROOFS), x, z, b.w + 0.008, b.d + 0.008, top, top + pitch * 0.8, rot)
    else flats.push(x, z, b.w + 0.004, b.d + 0.004, top, top + 0.006, rot)
  }

  // the floating homes: a dark float, a house or two storeys in a bold colour, a roof (or a roof garden)
  for (const b of homes) {
    const { x, z, rot } = b, w = b.w * 0.94, d = b.d * 0.9
    floats.push(x, z, b.w, b.d, sea - 0.02, sea + 0.014, rot)
    const top = sea + 0.014 + H(b.levels * 2.9)
    if (b.kind === 3) {
      // the Taj Mahal: a white box under an onion dome, minarets at the corners
      add(walls, WHITE, x, z, w, d, sea + 0.014, top, rot)
      add(crowns, WHITE, x, top + 0.03, z, Math.min(w, d) * 0.32, 0.04, Math.min(w, d) * 0.32)
      spires.push(x, z, 0.008, 0.008, top + 0.06, top + 0.1, rot)
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const c = Math.cos(rot), s = Math.sin(rot), px = x + (u * w * c + v * d * s) / 2, pz = z + (-u * w * s + v * d * c) / 2
        add(walls, WHITE, px, pz, 0.008, 0.008, sea + 0.014, top + 0.03, rot)
      }
      continue
    }
    add(walls, pick(HOMES), x, z, w, d, sea + 0.014, top, rot)
    const roll = rnd()
    if (roll < 0.45) add(gables, pick(ROOFS), x, z, w + 0.006, d + 0.006, top, top + d * 0.4, rot)
    else {
      flats.push(x, z, w + 0.004, d + 0.004, top, top + 0.006, rot)
      if (roll > 0.8) add(crowns, LEAVES[2], x, top + 0.012, z, w * 0.25, 0.012, d * 0.25)
    }
  }

  // trees: oaks and bays round the houses, the odd tall cypress or eucalyptus, and woods in the gaps across the developed
  // hillside, wherever the 10 m grid is free and the ground is land
  const tree = (x: number, z: number) => {
    const y = gy(x, z)
    if (y < sea + 0.02 || taken.has(key(x, z))) return
    taken.add(key(x, z))
    if (rnd() < 0.07) {
      const h = H(14 + 10 * rnd())
      add(hips, '#33553a', x, z, M(5), M(5), y - 0.02, y + h, 0)
      return
    }
    const r = M(3.5 + 3 * rnd())
    add(crowns, pick(LEAVES), x, y + H(2.5) + r, z, r, r * 1.15, r)
  }
  const developed = new Set<number>()
  const cell = (x: number, z: number) => Math.floor(x / 0.6 + 1000) * 4000 + Math.floor(z / 0.6 + 1000)
  for (const b of buildings()) if (b.kind === 0) developed.add(cell(b.x, b.z))
  for (const b of buildings()) {
    if (b.kind !== 0) continue
    for (let k = rnd() < 0.5 ? 1 : 2; k > 0; k--) {
      const a = rnd() * Math.PI * 2, r = Math.max(b.w, b.d) / 2 + M(4 + 6 * rnd())
      tree(b.x + r * Math.cos(a), b.z + r * Math.sin(a))
    }
  }
  for (let x = -24; x < 1.5; x += 0.11) for (let z = -17; z < 12.5; z += 0.11) {
    if (!developed.has(cell(x, z)) || rnd() > 0.45) continue
    tree(x + (rnd() - 0.5) * 0.08, z + (rnd() - 0.5) * 0.08)
  }

  // the marinas: dock walkways, and boats nosed in along both sides of every boat dock
  const docks: number[] = [], breakwaters: number[] = [], hulls: number[] = [], blue: number[] = [], cabins: number[] = [], masts: number[] = []
  for (const dk of DOCKS) {
    const p = dk.p.map(M)
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az)
      if (L < 1e-3) continue
      const ux = (bx - ax) / L, uz = (bz - az) / L, ang = Math.atan2(-uz, ux)
      if (dk.kind === 2) { breakwaters.push((ax + bx) / 2, (az + bz) / 2, L + 0.01, 0.035, sea - 0.04, sea + 0.035, ang); continue }
      docks.push((ax + bx) / 2, (az + bz) / 2, L + 0.02, 0.022, sea - 0.01, sea + 0.012, ang)
      if (dk.kind === 1) continue
      for (let s = 0.04; s < L - 0.03; s += 0.062) for (const side of [-1, 1]) {
        if (rnd() < 0.2) continue // an empty slip
        const len = M(8 + 6 * rnd()), off = 0.016 + len / 2
        const cx = ax + ux * s - uz * side * off, cz = az + uz * s + ux * side * off
        if (taken.has(key(cx, cz))) continue
        // the boat lies square to the dock: its length runs along the dock's normal
        const bang = ang + Math.PI / 2, sail = rnd() < 0.7
        ;(rnd() < 0.85 ? hulls : blue).push(cx, cz, len, M(3.6), sea - 0.005, sea + 0.016, bang)
        cabins.push(cx - uz * side * len * 0.05, cz + ux * side * len * 0.05, len * (sail ? 0.35 : 0.5), M(2.4), sea + 0.016, sea + (sail ? 0.026 : 0.034), bang)
        if (sail) masts.push(cx, cz, 0.0035, 0.0035, sea + 0.016, sea + H(9 + 5 * rnd()), 0)
      }
    }
  }

  // ---------------------------------------------------------------- hand-placed: the plaza, the ferry, the waterfront

  const p: Part[] = []
  const push = (...q: (Part | null)[]) => { for (const x of q) if (x) p.push(x) }
  const py = Math.max(sea, gy(0, 0))
  // Plaza Viña del Mar: a paved square between Bridgeway and the ferry lot, its axis square to the street
  const pa = -1.07 // the plaza's long axis (local x) runs along Bridgeway, north-west to south-east
  const P = (u: number, v: number): [number, number] => [u * Math.cos(pa) + v * Math.sin(pa), -u * Math.sin(pa) + v * Math.cos(pa)]
  const plaza: number[] = [], lawn: number[] = [], stone: number[] = [], grey: number[] = [], lamps: number[] = []
  const pblobs = new Map<string, number[]>()
  plaza.push(0, 0, 0.36, 0.24, py - 0.03, py + 0.006, pa)
  for (const v of [-0.085, 0.085]) { const [x, z] = P(0.1, v); lawn.push(x, z, 0.1, 0.05, py, py + 0.009, pa) }
  // the fountain: a round basin, a pedestal, an upper bowl; it and the elephants are drawn about 6x, or they vanish from the
  // camera's lowest height
  const K = 1.6
  const drum = (y0: number, y1: number, r: number, color: string): Part =>
    ({ geo: 'cyl', pos: [0, (y0 + y1) / 2, 0], scale: [2 * r, y1 - y0, 2 * r], color, detail: true, args: [0.5, 0.5, 20] })
  push(drum(py, py + 0.014 * K, 0.038 * K, CONCRETE), drum(py + 0.014 * K, py + 0.0145 * K, 0.032 * K, '#7fb2c9'), drum(py + 0.014 * K, py + 0.05 * K, 0.006 * K, CONCRETE))
  add(pblobs, '#d9d1c2', 0, py + 0.052 * K, 0, 0.026 * K, 0.008 * K, 0.026 * K)
  add(pblobs, '#9cc6d8', 0, py + 0.062 * K, 0, 0.007 * K, 0.01 * K, 0.007 * K)
  // the two elephants, on pedestals either side of the fountain, each with a lamp standard rising from its back
  for (const side of [-1, 1]) {
    const [ex, ez] = P(side * 0.13 * K, 0), face = pa + (side > 0 ? Math.PI : 0)
    const F = (u: number, v: number): [number, number] => [ex + K * (u * Math.cos(face) + v * Math.sin(face)), ez + K * (-u * Math.sin(face) + v * Math.cos(face))]
    const yb = py + 0.045 * K, body = '#bdb4a3'
    stone.push(ex, ez, 0.06 * K, 0.04 * K, py, yb, face)
    const blob = (u: number, v: number, y: number, rx: number, ry: number, rz: number) => { const [x, z] = F(u, v); add(pblobs, body, x, yb + y * K, z, rx * K, ry * K, rz * K) }
    blob(0, 0, 0.034, 0.026, 0.017, 0.016) // body
    blob(-0.027, 0, 0.04, 0.012, 0.013, 0.012) // head
    for (const v of [-1, 1]) blob(-0.024, v * 0.012, 0.042, 0.004, 0.011, 0.009) // ears
    for (const [u, v] of [[-0.016, -0.009], [-0.016, 0.009], [0.016, -0.009], [0.016, 0.009]]) { const [x, z] = F(u, v); grey.push(x, z, 0.008 * K, 0.008 * K, yb, yb + 0.024 * K, face) }
    const [tx, tz] = F(-0.04, 0)
    grey.push(tx, tz, 0.006 * K, 0.006 * K, yb + 0.006 * K, yb + 0.034 * K, face)
    const [lx, lz] = F(0.004, 0)
    lamps.push(lx, lz, 0.005 * K, 0.005 * K, yb + 0.05 * K, yb + 0.15 * K, face)
    add(pblobs, WHITE, lx, yb + 0.162 * K, lz, 0.011 * K, 0.013 * K, 0.011 * K)
  }
  // palms over the plaza and along the waterfront lot: a slim trunk under a spray of fronds
  const palms: number[] = []
  for (const [u, v] of [[-0.2, -0.12], [0.2, -0.12], [-0.2, 0.12], [0.2, 0.12], [0.36, -0.2], [0.5, -0.22]]) {
    const [x, z] = P(u, v), h = H(15 + 5 * rnd())
    palms.push(x, z, 0.008, 0.008, py, py + h, 0)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + u * 7
      add(pblobs, k % 2 ? '#4d7a3c' : '#5f8d48', x + Math.cos(a) * 0.022, py + h - 0.004, z + Math.sin(a) * 0.022, 0.024, 0.007, 0.024)
    }
    add(pblobs, '#5f8d48', x, py + h + 0.01, z, 0.016, 0.014, 0.016)
  }

  // the ferry landing: a gangway out to the float, a little shelter, and a Golden Gate ferry alongside
  const fy = sea + 0.022
  stone.push(1.0, -0.06, 0.5, 0.05, sea - 0.05, fy, 0)
  stone.push(1.36, -0.06, 0.2, 0.1, sea - 0.02, fy, 0)
  push(merged('rblocks', [0, 1.36, -0.06, 0.08, 0.05, fy, fy + 0.04, 0], '#e9e2d2'), merged('rblocks', [1, 1.36, -0.06, 0.09, 0.06, fy + 0.04, fy + 0.058, 0], '#5d5752'))
  const fx = 1.53, fz = -0.08, fl = 0.46, fw = 0.1, fa = Math.PI / 2 // the ferry lies along the shore, bow to the north
  const ferry: number[] = [], band: number[] = [], fglass: number[] = []
  ferry.push(fx, fz, fl, fw, sea - 0.02, sea + 0.04, fa)
  band.push(fx, fz, fl + 0.003, fw + 0.003, sea + 0.012, sea + 0.024, fa)
  ferry.push(fx, fz + 0.01, fl * 0.82, fw * 0.92, sea + 0.04, sea + 0.075, fa, fx, fz + 0.03, fl * 0.55, fw * 0.8, sea + 0.075, sea + 0.104, fa)
  ferry.push(fx, fz - 0.12, 0.05, fw * 0.6, sea + 0.104, sea + 0.124, fa)
  fglass.push(fx, fz + 0.01, fl * 0.82 + 0.003, fw * 0.92 + 0.003, sea + 0.052, sea + 0.066, fa, fx, fz + 0.03, fl * 0.55 + 0.003, fw * 0.8 + 0.003, sea + 0.084, sea + 0.096, fa)
  fglass.push(fx, fz - 0.12, 0.053, fw * 0.6 + 0.003, sea + 0.108, sea + 0.12, fa)

  // the Spinnaker, a glass-walled restaurant on the point north of the harbor entrance
  const sx = 1.1, sz = -3.2, sy = sea + 0.03
  stone.push(0.85, -3.15, 0.85, 0.42, sea - 0.06, sy, 0.76)
  lawn.push(0.62, -2.92, 0.26, 0.16, sy, sy + 0.004, 0.76)
  push(
    { geo: 'cyl', pos: [sx, sy + H(2.5), sz], scale: [0.28, H(5), 0.28], color: WHITE, detail: true, args: [0.5, 0.5, 8] },
    { geo: 'cyl', pos: [sx, sy + H(2.3), sz], scale: [0.284, H(3.2), 0.284], color: GLASS, detail: true, args: [0.5, 0.5, 8] },
    { geo: 'cyl', pos: [sx, sy + H(5) + 0.006, sz], scale: [0.31, 0.012, 0.31], color: '#ecebe6', detail: true, args: [0.5, 0.5, 8] },
  )
  lamps.push(sx + 0.17, sz - 0.04, 0.004, 0.004, sy, sy + H(12), 0)
  push(merged('rblocks', [0, sx + 0.192, sz - 0.04, 0.04, 0.003, sy + H(10.5), sy + H(12), 0], '#f04a00'))

  // Our Lady Star of the Sea: a steeple over the church on the hill (its nave is the church's own footprint)
  {
    const cx = -3.45, cz = -0.4, cy = gy(cx, cz)
    add(walls, WHITE, cx, cz, 0.06, 0.06, cy - 0.03, cy + H(16), -0.6)
    spires.push(cx, cz, 0.05, 0.05, cy + H(16), cy + H(27), -0.6)
  }

  // the bronze sea lion on its rock off the seawall, about 6x
  {
    const lx = 0.76, lz = 4.82
    add(pblobs, '#8f8a80', lx, sea + 0.01, lz, 0.05, 0.03, 0.04)
    add(pblobs, '#6b5a45', lx, sea + 0.052, lz, 0.014, 0.026, 0.016)
    add(pblobs, '#6b5a45', lx - 0.004, sea + 0.084, lz + 0.006, 0.008, 0.009, 0.01)
  }

  // ---------------------------------------------------------------- assemble
  const town = { scenery: true }
  for (const [color, a] of walls) push(merged('rblocks', [0, ...a], color, town))
  for (const [color, a] of gables) push(merged('rblocks', [1, ...a], color, town))
  for (const [color, a] of hips) push(merged('rblocks', [2, ...a], color, town))
  for (const [color, a] of crowns) push(merged('blobs', a, color, town))
  push(
    merged('rblocks', [0, ...flats], '#a39d92', town),
    merged('rblocks', [0, ...glass], GLASS, town),
    merged('rblocks', [0, ...floats], HULL, town),
    merged('rblocks', [2, ...spires], '#f1ede4', town),
    merged('rblocks', [0, ...docks], DECK, town),
    merged('rblocks', [0, ...breakwaters], '#b9b3a7', town),
    merged('rblocks', [0, ...hulls], WHITE, town),
    merged('rblocks', [0, ...blue], '#3f6fb0', town),
    merged('rblocks', [0, ...cabins], '#e4e1d8', town),
    merged('rblocks', [0, ...masts], '#e9e7e1', town),
    merged('rblocks', [0, ...plaza], '#e6dccb'),
    merged('rblocks', [0, ...lawn], '#7fae5f'),
    merged('rblocks', [0, ...stone], CONCRETE),
    merged('rblocks', [0, ...grey], '#bdb4a3'),
    merged('rblocks', [0, ...lamps], '#3f3f3f'),
    merged('rblocks', [0, ...palms], '#8a6a4a'),
    merged('rblocks', [0, ...ferry], WHITE),
    merged('rblocks', [0, ...band], '#2f5a4a'),
    merged('rblocks', [0, ...fglass], GLASS),
  )
  for (const [color, a] of pblobs) push(merged('blobs', a, color))
  // hover targets: downtown's waterfront, the ferry landing, the Spinnaker's point, the yacht harbor and Waldo Point's floating homes
  const hit = (x: number, z: number, ang: number, length: number, width: number): Part =>
    ({ geo: 'box', pos: [x, 0.1, z], rot: [0, ang, 0], scale: [length, 0.4, width], color: '#000', hit: true })
  push(hit(-1.3, -0.6, -0.83, 5, 1.2), hit(1.3, -0.1, 0, 0.8, 0.5), hit(0.9, -3.1, 0.76, 1.0, 0.6), hit(-2.2, -4.1, -0.58, 4, 3), hit(-22, -19.5, -0.56, 9, 3.5))
  return p
}
