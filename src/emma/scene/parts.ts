/**
 * Helpers for the models only Emma's page has (monadnock.ts, hallidie.ts): parts in the shared part geometries of
 * scene/LandmarkModel.tsx (`partGeometry`), every one `detail` so the hover outline goes round the whole building.
 */
import { UNIT, BUILDING_EXAGGERATION } from '../../lib/geo'
import type { Part } from '../../scene/LandmarkModel'

export const H = (m: number) => m * UNIT * BUILDING_EXAGGERATION
export const r4 = (v: number) => +v.toFixed(4)
/** the default colour of `openings`: a dark window */
export const WIN = '#5a5a58'

export const box = (x: number, y0: number, y1: number, z: number, sx: number, sz: number, color: string): Part =>
  ({ geo: 'box', pos: [x, (y0 + y1) / 2, z], scale: [sx, y1 - y0, sz], color, detail: true })
/**
 * Many boxes of one colour as one part (the `blocks` geometry), each [x, z, width, length, y0, y1], placed on its own bounds:
 * flat-topped, or `gabled` with the ridge along z (true, so the gable ends face -z and +z) or along x ('x').
 */
export const blocks = (list: number[][], color: string, o: { gabled?: boolean | 'x' } = {}): Part => {
  const l = list.map((b) => b.map(r4))
  const x0 = Math.min(...l.map((b) => b[0] - b[2] / 2)), x1 = Math.max(...l.map((b) => b[0] + b[2] / 2))
  const z0 = Math.min(...l.map((b) => b[1] - b[3] / 2)), z1 = Math.max(...l.map((b) => b[1] + b[3] / 2))
  const y0 = Math.min(...l.map((b) => b[4])), y1 = Math.max(...l.map((b) => b[5]))
  return { geo: 'blocks', pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], scale: [x1 - x0, y1 - y0, z1 - z0], color, detail: true,
    args: [o.gabled === 'x' ? 2 : o.gabled ? 1 : 0, ...l.flat()] }
}
/** a round drum (unit-normalised `cyl`) of radius r standing between y0 and y1 at x, z */
export const drum = (x: number, z: number, y0: number, y1: number, r: number, color: string, segments = 16): Part =>
  ({ geo: 'cyl', pos: [x, (y0 + y1) / 2, z], scale: [2 * r, y1 - y0, 2 * r], color, detail: true, args: [0.5, 0.5, segments] })
/**
 * Openings painted a hair proud of a wall (the `arches` geometry): `n` of them `w` wide spread along `len`, in `rows` storeys
 * `storey` apart, each `tall` high from y0. The wall runs along x (axis 0, facing -z or +z by `side`) or along z (axis 1,
 * facing -x or +x); `depth` is the distance from the part's centre line to the wall times two. `arch` rounds their heads.
 */
export const openings = (x: number, z: number, y0: number, tall: number, len: number, depth: number, n: number, w: number,
  o: { side: -1 | 1; axis?: 0 | 1; rows?: number; storey?: number; arch?: boolean; color?: string }): Part => {
  const rows = o.rows ?? 1, span = (o.storey ?? 0) * (rows - 1) + tall, d = depth + 0.006, axis = o.axis ?? 0
  const gap = rows > 1 ? (o.storey! - tall) / span : 0
  return { geo: 'arches', pos: [x, y0 + span / 2, z], scale: axis ? [d, span, len] : [len, span, d], color: o.color ?? WIN, detail: true,
    args: [n, r4(w / len), o.arch ? r4(w / 2 / span) : 0, rows, r4(gap), axis, o.side] }
}
