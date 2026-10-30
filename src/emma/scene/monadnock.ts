/**
 * The Monadnock Building, 681-687 Market Street (Frederick H. Meyer, 1907), Notion's headquarters: Emma's page only, so its
 * model lives here rather than in scene/LandmarkModel.tsx, built from the same part geometries (`partGeometry`).
 *
 * Local axes: -z is the Market Street front (bearing -44.75, as the city's footprint survey has it), +x runs along Market
 * towards the Palace Hotel, the Hearst Building is against the -x wall. True to the survey in plan (43 x 49 m, the city
 * has nothing modelled there: OSM's downtown buildings skip it) and ten storeys, 38 m, under the usual height exaggeration.
 * The front is the classic tripartite block in buff brick and terracotta: a two-storey base of shopfronts either side of the
 * tall arched entrance, six plain storeys of windows in seven bays of three, a ninth storey between pilasters, the deep
 * bracketed cornice, an attic storey above it and a lighter top cornice. A light court opens in the middle of the roof.
 */
import { UNIT, BUILDING_EXAGGERATION } from '../../lib/geo'
import type { Part } from '../../scene/LandmarkModel'

const H = (m: number) => m * UNIT * BUILDING_EXAGGERATION
const r4 = (v: number) => +v.toFixed(4)

const BRICK = '#e6d5b0', TERRA = '#f1e6cc', BASE = '#d6c19a', ROOF = '#cfc9bd', PLANT = '#bdb5a5'
const WIN = '#5a5a58', SHOP = '#3e454b', GLASS = '#d3ad6a', BRONZE = '#4a3c2e'

const box = (x: number, y0: number, y1: number, z: number, sx: number, sz: number, color: string): Part =>
  ({ geo: 'box', pos: [x, (y0 + y1) / 2, z], scale: [sx, y1 - y0, sz], color, detail: true })
/** many boxes of one colour as one part (the `blocks` geometry), each [x, z, width, length, y0, y1], placed on its own bounds */
const blocks = (list: number[][], color: string): Part => {
  const l = list.map((b) => b.map(r4))
  const x0 = Math.min(...l.map((b) => b[0] - b[2] / 2)), x1 = Math.max(...l.map((b) => b[0] + b[2] / 2))
  const z0 = Math.min(...l.map((b) => b[1] - b[3] / 2)), z1 = Math.max(...l.map((b) => b[1] + b[3] / 2))
  const y0 = Math.min(...l.map((b) => b[4])), y1 = Math.max(...l.map((b) => b[5]))
  return { geo: 'blocks', pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], scale: [x1 - x0, y1 - y0, z1 - z0], color, detail: true, args: [0, ...l.flat()] }
}
/**
 * Openings painted a hair proud of a wall (the `arches` geometry): `n` of them `w` wide spread along `len`, in `rows` storeys
 * `storey` apart, each `tall` high from y0. The wall runs along x (axis 0, facing -z or +z by `side`) or along z (axis 1,
 * facing -x or +x); `depth` is the distance from the part's centre line to the wall times two. `arch` rounds their heads.
 */
const openings = (x: number, z: number, y0: number, tall: number, len: number, depth: number, n: number, w: number,
  o: { side: -1 | 1; axis?: 0 | 1; rows?: number; storey?: number; arch?: boolean; color?: string }): Part => {
  const rows = o.rows ?? 1, span = (o.storey ?? 0) * (rows - 1) + tall, d = depth + 0.006, axis = o.axis ?? 0
  const gap = rows > 1 ? (o.storey! - tall) / span : 0
  return { geo: 'arches', pos: [x, y0 + span / 2, z], scale: axis ? [d, span, len] : [len, span, d], color: o.color ?? WIN, detail: true,
    args: [n, r4(w / len), o.arch ? r4(w / 2 / span) : 0, rows, r4(gap), axis, o.side] }
}

export function monadnockParts(): Part[] {
  const W = 0.434, D = 0.492, SUNK = -0.05
  const zF = -D / 2, zR = D / 2
  const PIER = 0.016, BAY = (W - 2 * PIER) / 7
  const bayX = (k: number) => -W / 2 + PIER + BAY * (k + 0.5)
  const yBase = H(8.9), yString = H(29), yFrieze = H(32.8), yCornice = H(34.6), yTop = H(38.4)
  // the light court, open from the lobby roof up
  const cx0 = -0.06, cx1 = 0.07, cz0 = -0.005, cz1 = 0.125
  // the ninth storey's pilasters on the bay lines, [x, width]: the end piers carry on up, the rest are slimmer
  const pilasters = Array.from({ length: 8 }, (_, k) => (k % 7 ? [-W / 2 + PIER + BAY * k, 0.008] : [(k ? 1 : -1) * (W / 2 - PIER / 2), PIER]))

  const p: Part[] = [
    // one clean hover outline round the whole block (everything else is `detail`)
    { ...box(0, SUNK, yTop + 0.01, 0, W + 0.02, D + 0.02, BRICK), detail: false, hullOnly: true },
    // the body: four wings round the light court, and the lobby under it
    blocks([
      [0, (zF + cz0) / 2, W, cz0 - zF, SUNK, yTop],
      [0, (cz1 + zR) / 2, W, zR - cz1, SUNK, yTop],
      [(-W / 2 + cx0) / 2, (cz0 + cz1) / 2, cx0 + W / 2, cz1 - cz0, SUNK, yTop],
      [(cx1 + W / 2) / 2, (cz0 + cz1) / 2, W / 2 - cx1, cz1 - cz0, SUNK, yTop],
      [(cx0 + cx1) / 2, (cz0 + cz1) / 2, cx1 - cx0, cz1 - cz0, SUNK, yBase],
    ], BRICK),
    // roof: tar-and-gravel over the wings, a coping round the edge and the court, two penthouses at the back
    blocks([
      [0, (zF + cz0) / 2, W - 0.012, cz0 - zF - 0.012, yTop, yTop + 0.002],
      [0, (cz1 + zR) / 2, W - 0.012, zR - cz1 - 0.012, yTop, yTop + 0.002],
      [(-W / 2 + cx0) / 2, (cz0 + cz1) / 2, cx0 + W / 2 - 0.012, cz1 - cz0 + 0.012, yTop, yTop + 0.002],
      [(cx1 + W / 2) / 2, (cz0 + cz1) / 2, W / 2 - cx1 - 0.012, cz1 - cz0 + 0.012, yTop, yTop + 0.002],
    ], ROOF),
    blocks([
      [0, zF + 0.004, W, 0.008, yTop, yTop + 0.012], [0, zR - 0.004, W, 0.008, yTop, yTop + 0.012],
      [-W / 2 + 0.004, 0, 0.008, D, yTop, yTop + 0.012], [W / 2 - 0.004, 0, 0.008, D, yTop, yTop + 0.012],
    ], TERRA),
    blocks([[-0.14, 0.17, 0.09, 0.11, yTop, yTop + H(3.6)], [0.13, 0.19, 0.06, 0.07, yTop, yTop + H(2.6)], [0.15, -0.09, 0.05, 0.05, yTop, yTop + H(1.8)]], PLANT),

    // --- the base: shopfronts in warmer stone, the band over them, the sill course over the second floor
    box(0, SUNK, yBase, zF - 0.001, W + 0.004, 0.006, BASE),
    openings(bayX(1), 0, H(0.3), H(4.1), BAY * 3, D + 0.006, 3, BAY * 0.84, { side: -1, color: SHOP }),
    openings(bayX(5), 0, H(0.3), H(4.1), BAY * 3, D + 0.006, 3, BAY * 0.84, { side: -1, color: SHOP }),
    blocks([[-(W / 2 + 0.03) / 2 - 0.001, zF - 0.006, W / 2 - 0.028, 0.012, H(4.5), H(5.2)], [(W / 2 + 0.03) / 2 + 0.001, zF - 0.006, W / 2 - 0.028, 0.012, H(4.5), H(5.2)]], TERRA),
    box(0, H(8.3), H(8.9), zF - 0.004, W + 0.008, 0.01, TERRA),
    // second-floor windows, all but the middle bay, where the entrance arch rises into the storey
    ...[0, 1, 2, 4, 5, 6].map((k) => openings(bayX(k), 0, H(5.9), H(2), BAY * 0.86, D + 0.006, 3, 0.0125, { side: -1 })),
    // the entrance: a terracotta surround, the painted fan of the lobby showing through it, the bronze sign band and doors,
    // and the cartouche over the keystone
    openings(0, 0, 0, H(7.8), 0.054, D + 0.008, 1, 0.054, { side: -1, arch: true, color: TERRA }),
    openings(0, 0, 0, H(7.3), 0.04, D + 0.01, 1, 0.04, { side: -1, arch: true, color: GLASS }),
    openings(0, 0, H(3.6), H(0.8), 0.04, D + 0.012, 1, 0.04, { side: -1, color: BRONZE }),
    openings(0, 0, 0, H(3.5), 0.04, D + 0.012, 1, 0.036, { side: -1, color: SHOP }),
    box(0, H(7.8), H(8.4), zF - 0.007, 0.016, 0.006, TERRA),

    // --- the shaft: six storeys of windows in bays of three, between plain end piers
    ...Array.from({ length: 7 }, (_, k) => openings(bayX(k), 0, H(9.4), H(2.3), BAY * 0.86, D, 3, 0.0125, { side: -1, rows: 6, storey: H(3.4) })),
    blocks([[-W / 2 + PIER / 2, zF - 0.002, PIER, 0.004, yBase, yString], [W / 2 - PIER / 2, zF - 0.002, PIER, 0.004, yBase, yString]], TERRA),
    box(0, yString, yString + H(0.6), zF - 0.004, W + 0.008, 0.01, TERRA),

    // --- the ninth storey between pilasters with their capitals, the frieze, the bracketed cornice
    ...Array.from({ length: 7 }, (_, k) => openings(bayX(k), 0, H(30.1), H(2.4), BAY * 0.86, D, 3, 0.0125, { side: -1 })),
    blocks(pilasters.map(([x, w]) => [x, zF - 0.003, w, 0.006, yString + H(0.6), yFrieze]), TERRA),
    blocks(pilasters.map(([x, w]) => [x, zF - 0.005, w + 0.005, 0.01, yFrieze - H(0.7), yFrieze]), TERRA),
    box(0, yFrieze, yFrieze + H(0.7), zF - 0.004, W + 0.01, 0.01, TERRA),
    blocks(Array.from({ length: 29 }, (_, k) => [-W / 2 + 0.008 + (k * (W - 0.016)) / 28, zF - 0.01, 0.005, 0.02, yFrieze + H(0.6), yCornice - H(0.6)]), TERRA),
    // the cornice slab runs a short way round both corners
    blocks([[0, zF + 0.004, W + 0.024, 0.05, yCornice - H(0.6), yCornice]], TERRA),

    // --- the attic storey over the cornice, and the top cornice
    ...Array.from({ length: 7 }, (_, k) => openings(bayX(k), 0, H(35.2), H(1.8), BAY * 0.86, D, 3, 0.0125, { side: -1 })),
    blocks([[0, zF + 0.002, W + 0.012, 0.024, yTop - H(0.8), yTop + 0.004]], TERRA),

    // --- the plainer back and the east side over the alley by the Palace Hotel; the west wall is against the Hearst Building
    openings(0, 0, H(5.9), H(2.2), W - 0.05, D, 13, 0.013, { side: 1, rows: 9, storey: H(3.4) }),
    openings(0, 0, H(5.9), H(2.2), D - 0.06, W, 12, 0.013, { side: 1, axis: 1, rows: 9, storey: H(3.4) }),
    // windows round the light court, on its four walls facing in
    openings(cx0, (cz0 + cz1) / 2, H(9.4), H(2.2), cz1 - cz0 - 0.02, 0, 4, 0.012, { side: 1, axis: 1, rows: 9, storey: H(3.15) }),
    openings(cx1, (cz0 + cz1) / 2, H(9.4), H(2.2), cz1 - cz0 - 0.02, 0, 4, 0.012, { side: -1, axis: 1, rows: 9, storey: H(3.15) }),
    openings((cx0 + cx1) / 2, cz0, H(9.4), H(2.2), cx1 - cx0 - 0.02, 0, 4, 0.012, { side: 1, rows: 9, storey: H(3.15) }),
    openings((cx0 + cx1) / 2, cz1, H(9.4), H(2.2), cx1 - cx0 - 0.02, 0, 4, 0.012, { side: -1, rows: 9, storey: H(3.15) }),
  ]
  return p
}
