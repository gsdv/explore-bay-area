import * as THREE from 'three'
import type { Landmark } from '../data/landmarks'
import { project, UNIT, BUILDING_EXAGGERATION, elevationToY } from '../lib/geo'
import * as TP from './twinPeaksData'
import { sausalito, townGeometry } from './sausalito'

export interface Part {
  geo: 'box' | 'cyl' | 'cone' | 'sphere' | 'ring' | 'stack' | 'fluted' | 'arcade' | 'arches' | 'ringwall' | 'archwall' | 'columns' | 'sector' | 'blocks' | 'strokes' | 'hill' | 'ribbons' | 'pad' | 'rblocks' | 'blobs'
  pos: [number, number, number]
  rot?: [number, number, number]
  scale: [number, number, number]
  color: string
  args?: (number | boolean)[]
  /** surface detail (stripes, struts): left out of the hover outline, whose hull would swallow anything this thin */
  detail?: boolean
  /** never drawn itself, only as the hover outline: one clean hull round a huddle of `detail` parts (and it sizes the pipeline's clearing) */
  hullOnly?: boolean
  /** context beside the landmark (the Quad next to Hoover Tower): drawn, but outside the hover box and the label height */
  scenery?: boolean
  /** never drawn: an invisible box the pointer can hit (rotation honoured). When a model has any, they replace the automatic hover
   *  box, which can only be axis-aligned: the Bay Bridge bends at Yerba Buena Island */
  hit?: boolean
}

const ORANGE = '#f04a00'
const STONE = '#efe8d8'
const CONCRETE = '#d9d5cc'
const GREEN = '#6fa35a'
const RED = '#c9463d'
const SHADE = '#5f594e'
const H = (m: number) => m * UNIT * BUILDING_EXAGGERATION

const box = (x: number, y0: number, y1: number, z: number, sx: number, sz: number, color: string, detail = false): Part =>
  ({ geo: 'box', pos: [x, (y0 + y1) / 2, z], scale: [sx, y1 - y0, sz], color, detail })
// round parts are unit-normalised (radius 0.5, height 1) so the hover hull and bounds see their true size
const drum = (y0: number, y1: number, rb: number, rt: number, color: string, detail = false): Part =>
  ({ geo: 'cyl', pos: [0, (y0 + y1) / 2, 0], scale: [2 * rb, y1 - y0, 2 * rb], color, detail, args: [+(0.5 * rt / rb).toFixed(4), 0.5, 24] })
// dark openings painted a hair proud of a drum of radius r: eight bays of `group` panels, arched unless `flat`
const drumOpenings = (y0: number, y1: number, r: number, width: number, group = 1, flat = false): Part => {
  const d = 2 * (r + 0.003)
  return { geo: 'arcade', pos: [0, (y0 + y1) / 2, 0], scale: [d, y1 - y0, d], color: SHADE, detail: true,
    args: [8, +(width / d).toFixed(4), flat ? 0 : +(width / 2 / (y1 - y0)).toFixed(4), group, +((width * 1.9) / r).toFixed(4)] }
}
/**
 * The same for a flat façade: `n` openings `w` wide in `rows` storeys between y0 and y1, on a wall `len` long. The wall runs
 * along x and faces z (`axis` 0) or the reverse (1); `depth` is the distance between the two opposite walls, centred on the
 * part, and `sides` picks the +face (1), the -face (-1) or both (0).
 */
const wallOpenings = (x: number, z: number, y0: number, y1: number, len: number, depth: number, n: number, w: number,
  o: { rows?: number; axis?: 0 | 1; sides?: -1 | 0 | 1; flat?: boolean } = {}): Part => {
  const d = depth + 0.006, axis = o.axis ?? 0
  return { geo: 'arches', pos: [x, (y0 + y1) / 2, z], scale: axis ? [d, y1 - y0, len] : [len, y1 - y0, d], color: SHADE, detail: true,
    args: [n, +(w / len).toFixed(4), o.flat ? 0 : +(w / 2 / (y1 - y0)).toFixed(4), o.rows ?? 1, 0.12, axis, o.sides ?? 0] }
}
const r4 = (v: number) => +v.toFixed(4)
/** a regular prism standing on a face-to-the-front footing: `n` sides, circumradius r (unit-normalised like `drum`) */
const prism = (z: number, y0: number, y1: number, r: number, n: number, color: string, detail = false): Part =>
  ({ geo: 'cyl', pos: [0, (y0 + y1) / 2, z], scale: [2 * r, y1 - y0, 2 * r], color, detail, args: [0.5, 0.5, n, 1, false, Math.PI / n] })
/**
 * Curved walls: annular sectors about a centre on the model's z axis at `zc`, between radii ri..ro, one per [from, to] range.
 * Angles are radians from the -z direction, positive towards +x. Normalised to their own bounding box, so pos/scale stay true.
 */
const sector = (zc: number, y0: number, y1: number, ri: number, ro: number, ranges: [number, number][], color: string, detail = false): Part => {
  const args = [r4(ri), r4(ro), ...ranges.flat().map(r4)]
  const b = planBox(sectorRings(args).flatMap((s) => [...s.inner, ...s.outer]))
  return { geo: 'sector', pos: [b.cx, (y0 + y1) / 2, zc + b.cz], scale: [b.sx, y1 - y0, b.sz], color, detail, args }
}
/** free-standing round columns of radius r at the given plan spots, as one part (always `detail`: a hull can't follow them) */
const columns = (spots: [number, number][], y0: number, y1: number, r: number, color: string): Part => {
  const args = [r4(r), ...spots.flat().map(r4)]
  const b = planBox(columnSpots(args), r)
  return { geo: 'columns', pos: [b.cx, (y0 + y1) / 2, b.cz], scale: [b.sx, y1 - y0, b.sz], color, detail: true, args }
}
/**
 * Many axis-aligned blocks of one colour as a single part: flat-topped boxes, `gabled` roofs (ridge along z, or 'x'), or pyramids.
 * Each is [x, z, width, length, y0, y1] in model units; like `sector`, the part is normalised to its own bounds.
 */
const blocks = (list: number[][], color: string, o: { gabled?: boolean | 'x'; pyramid?: boolean; detail?: boolean } = {}): Part => {
  const args = [o.pyramid ? 3 : o.gabled === 'x' ? 2 : o.gabled ? 1 : 0, ...list.flat().map(r4)]
  const b = blocksBox(args)
  return { geo: 'blocks', pos: [b.cx, b.cy, b.cz], scale: [b.sx, b.sy, b.sz], color, detail: o.detail, args }
}
/** a part moved in plan (helpers build round things on the model's axis) */
const at = (p: Part, x: number, z: number): Part => ({ ...p, pos: [p.pos[0] + x, p.pos[1], p.pos[2] + z] })
const asDetail = (p: Part): Part => ({ ...p, detail: true })
/** a rounded-rectangle slab that tapers from (w0 x d0) at y0 to (w1 x d1) at y1: rock terraces, podiums */
const slab = (x: number, z: number, y0: number, y1: number, w0: number, d0: number, taper: number, color: string, corner = 0.7): Part =>
  ({ geo: 'stack', pos: [x, (y0 + y1) / 2, z], scale: [w0, y1 - y0, d0], color, args: [corner, 5, -0.5, 0.5, 0.5, r4(0.5 * taper)] })
/** a low-poly hill tier: a frustum of `n` sides */
const tier = (z: number, y0: number, y1: number, rb: number, rt: number, color: string, n = 11): Part =>
  ({ geo: 'cyl', pos: [0, (y0 + y1) / 2, z], scale: [2 * rb, y1 - y0, 2 * rb], color, args: [r4(0.5 * rt / rb), 0.5, n] })
const shift = (p: Part, z: number): Part => ({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2] + z] })

/**
 * Returns primitive parts in landmark-local space (y up, origin at ground). Bridges take the ground profile from `bridgeGround`;
 * Twin Peaks, which brings its own hill, takes the drawn terrain round it so the hill can rise out of it.
 */
export function landmarkParts(l: Landmark, ground?: BridgeGround, terrain?: Terrain): Part[] {
  switch (l.kind) {
    case 'bridge':
      return (l.id === 'baybridge' ? bayBridge(l, ground) : goldenGate(l, ground)).parts
    case 'tower': {
      // Salesforce Tower: a rounded square that stays plumb for its lower third and then curves in to a flat, open top;
      // glass wrapped in white sunshade rings at every floor, a paler perforated crown for the top seventh with a
      // vertical slot down the middle of each face. As with the pyramid, plan size is ~1.8x true so the height
      // exaggeration keeps the real silhouette.
      const h = H(l.height ?? 326)
      const GLASS = '#a3b8c8', RING = '#f1f2ee', CROWN = '#dbe3e6', LOBBY = '#56626a', VOID = '#6f7d86'
      const a0 = 0.45, CORNER = 0.42, SEGS = 4
      const halfAt = (y: number) => a0 * (1 - 0.4 * Math.pow(Math.max(0, y / h), 2.4))
      // slabs [y0, y1] following the taper, `proud` of the face, normalised into a unit box so bounds and the hover hull work
      const stack = (slabs: [number, number][], color: string, proud = 0, detail = false): Part => {
        const y0 = slabs[0][0], y1 = slabs[slabs.length - 1][1], w = 2 * (halfAt(y0) + proud)
        const u = (y: number) => [+((y - (y0 + y1) / 2) / (y1 - y0)).toFixed(4), +((halfAt(y) + proud) / w).toFixed(4)]
        return { geo: 'stack', pos: [0, (y0 + y1) / 2, 0], scale: [w, y1 - y0, w], color, detail, args: [CORNER, SEGS, ...slabs.flatMap(([a, b]) => [...u(a), ...u(b)])] }
      }
      const run = (from: number, to: number, n: number): [number, number][] =>
        Array.from({ length: n }, (_, i) => [from + ((to - from) * i) / n, from + ((to - from) * (i + 1)) / n])
      const yLobby = 0.035 * h, yCrown = 0.86 * h
      const floors = 34, t = 0.034
      const p: Part[] = [
        stack([[0, yLobby]], LOBBY, -0.03),
        stack(run(yLobby, yCrown, 14), GLASS),
        stack(run(yCrown, h, 4), CROWN),
        stack(Array.from({ length: floors }, (_, i) => { const y = yLobby + ((h - yLobby) * (i + 0.5)) / floors; return [y - t / 2, y + t / 2] as [number, number] }), RING, 0.006, true),
        // the crown is a hollow screen: a dark inset on the roof reads as the opening
        stack([[h, h + 0.004]], VOID, -0.05, true),
      ]
      // slots: a strip through the rings on each face, leaning with the taper
      const ySlot = 0.76 * h, yMid = (ySlot + h) / 2
      const lean = Math.atan2(halfAt(ySlot) - halfAt(h), h - ySlot), len = Math.hypot(halfAt(ySlot) - halfAt(h), h - ySlot)
      for (const side of [-1, 1]) {
        p.push({ geo: 'box', pos: [side * (halfAt(yMid) + 0.004), yMid, 0], rot: [0, 0, side * lean], scale: [0.02, len, 0.075], color: CROWN, detail: true })
        p.push({ geo: 'box', pos: [0, yMid, side * (halfAt(yMid) + 0.004)], rot: [-side * lean, 0, 0], scale: [0.075, len, 0.02], color: CROWN, detail: true })
      }
      return p
    }
    case 'pyramid': {
      // Transamerica: a truss colonnade under the widest floor (the 5th), 48 tapering floors of white precast, two blank
      // wings (elevators east, stairs west) that start flush with the face at the 29th floor and stand proud of it as the
      // floors shrink, and an aluminium spire for the top quarter. Horizontal size is ~2x true so the 1.8x height
      // exaggeration keeps the real silhouette.
      const h = H(l.height ?? 260)
      const BODY = '#ece8df', BAND = '#c9c5b9', SPIRE = '#d5d8d8', GLASS = '#4a4f4e'
      const yBase = 0.07 * h, ySpire = 0.75 * h
      const a0 = 0.44, a1 = 0.136
      const halfAt = (y: number) => a0 + ((a1 - a0) * (y - yBase)) / (ySpire - yBase)
      // square frustum between two heights; a 4-sided cylinder has its corners on the axes, so start it an eighth of a
      // turn round (in the geometry rather than `rot`, which would inflate the hover box)
      const frustum = (y0: number, y1: number, r0: number, r1: number, color: string): Part => ({
        geo: 'cyl', pos: [0, (y0 + y1) / 2, 0], scale: [1, y1 - y0, 1], color,
        args: [+(r1 * Math.SQRT2).toFixed(4), +(r0 * Math.SQRT2).toFixed(4), 4, 1, false, Math.PI / 4],
      })
      const p: Part[] = [
        frustum(yBase, ySpire, a0, a1, BODY),
        frustum(ySpire, h, a1, 0.014, SPIRE),
        // lobby glass set back behind the trusses, and the skirt slab they carry
        { geo: 'box', pos: [0, yBase / 2, 0], scale: [a0 * 1.45, yBase, a0 * 1.45], color: GLASS },
        { geo: 'box', pos: [0, yBase, 0], scale: [a0 * 2 + 0.05, 0.05, a0 * 2 + 0.05], color: BODY, detail: true },
      ]
      // window bands: thin frustums standing a hair proud of the face read as painted stripes
      const floors = 20
      for (let i = 0; i < floors; i++) {
        const y = yBase + ((ySpire - yBase) * (i + 0.5)) / floors, t = 0.045
        p.push({ ...frustum(y - t / 2, y + t / 2, halfAt(y - t / 2) + 0.004, halfAt(y + t / 2) + 0.004, BAND), detail: true })
      }
      // wings: one box through the tower, as wide as the face at the 29th floor
      const yWing = ySpire * (29 / 48), yWingTop = ySpire + 0.03 * h
      p.push({ geo: 'box', pos: [0, (yWing + yWingTop) / 2, 0], scale: [halfAt(yWing) * 2, yWingTop - yWing, 0.17], color: BODY })
      // truss colonnade: a zigzag of struts on each face
      const cells = 3, w = (a0 * 2) / cells, lean = Math.atan2(w / 2, yBase), len = Math.hypot(w / 2, yBase)
      for (let c = 0; c < cells; c++) {
        for (const dir of [-1, 1]) {
          const u = -a0 + w * (c + 0.5) + (dir * w) / 4
          for (const side of [-1, 1]) {
            p.push({ geo: 'box', pos: [u, yBase / 2, side * a0], rot: [0, 0, dir * lean], scale: [0.04, len, 0.04], color: BODY, detail: true })
            p.push({ geo: 'box', pos: [side * a0, yBase / 2, u], rot: [-dir * lean, 0, 0], scale: [0.04, len, 0.04], color: BODY, detail: true })
          }
        }
      }
      return p
    }
    case 'coit': {
      // Coit Tower: a stepped plinth (the mural rooms), a fluted shaft with a slight taper, then the open-air loggia:
      // eight tall arches, a row of slit windows in threes, and a narrower roofless ring of small arches. The real tower
      // is only 64 m by 10 m, so the whole model is 1.5x the usual building scale (and ~2.7x in plan) to read as an icon.
      const h = H(l.height ?? 64) * 1.5
      const PLINTH = '#e6dfcd', KNOLL = '#b3cc96'
      const yShaft = 0.2 * h, yLoggia = 0.72 * h, yRing = yLoggia + 0.64 * (h - yLoggia)
      const r0 = 0.155, r1 = 0.135, rRing = 0.122
      const hl = h - yLoggia
      return [
        // knoll and plinth run below the origin: the hilltop falls away from the centre point the model stands on
        // (the knoll is ground, not tower, so it stays out of the hover outline)
        drum(-0.4, 0.02, 0.66, 0.47, KNOLL, true),
        { geo: 'box', pos: [0, (0.11 * h - 0.4) / 2, 0], scale: [0.62, 0.11 * h + 0.4, 0.62], color: PLINTH },
        { geo: 'box', pos: [0, 0.155 * h, 0], scale: [0.45, 0.09 * h, 0.45], color: PLINTH },
        { geo: 'box', pos: [0, 0.045 * h, 0.311], scale: [0.09, 0.09 * h, 0.006], color: SHADE, detail: true },
        drum(yShaft - 0.04, yShaft + 0.03, 0.19, 0.175, STONE),
        { geo: 'fluted', pos: [0, (yShaft + yLoggia) / 2, 0], scale: [2 * r0, yLoggia - yShaft, 2 * r0], color: STONE, args: [+(r1 / r0).toFixed(4), 24, 0.07] },
        // balcony line under the arches, loggia drum, upper ring, and the dark well of the open top
        drum(yLoggia - 0.012, yLoggia + 0.012, r1 + 0.01, r1 + 0.01, STONE, true),
        drum(yLoggia, yRing, r1, r1, STONE),
        drum(yRing, h, rRing, rRing, STONE),
        drum(h, h + 0.004, rRing - 0.025, rRing - 0.025, SHADE, true),
        drumOpenings(yLoggia + 0.06 * hl, yLoggia + 0.46 * hl, r1, 0.062),
        drumOpenings(yLoggia + 0.53 * hl, yLoggia + 0.6 * hl, r1, 0.011, 3, true),
        drumOpenings(yRing + 0.2 * (h - yRing), yRing + 0.78 * (h - yRing), rRing, 0.04),
      ]
    }
    case 'sutro': {
      // Three legs flare out at the base and lean in to a "waist", then three straight masts rise to the top,
      // tied by crossbars. Painted in red and white bands like the real one.
      const h = H(l.height ?? 298)
      const RED = '#d9462d', WHITE = '#f4f1ea'
      const waist = 0.58 * h
      const rBase = 0.5, rWaist = 0.15
      const phi = Math.atan((rBase - rWaist) / waist)
      const p: Part[] = []
      const bands = [0, 0.22, 0.44, 0.66, 0.85, 1]
      for (let k = 0; k < 3; k++) {
        const th = (k / 3) * Math.PI * 2 + Math.PI / 6
        const cx = Math.cos(th), cz = Math.sin(th)
        // leaning lower leg in alternating bands
        for (let b = 0; b < bands.length - 1; b++) {
          const t0 = bands[b], t1 = bands[b + 1], tm = (t0 + t1) / 2
          const r = rBase + (rWaist - rBase) * tm
          const len = ((t1 - t0) * waist) / Math.cos(phi)
          p.push({ geo: 'cyl', pos: [cx * r, tm * waist, cz * r], rot: [0, -th, phi], scale: [1, len, 1], color: b % 2 ? WHITE : RED, args: [0.055 + 0.03 * (1 - t1), 0.055 + 0.03 * (1 - t0), 8] })
        }
        // upper mast, straight
        const mastH = h - waist
        p.push({ geo: 'cyl', pos: [cx * rWaist, waist + mastH * 0.25, cz * rWaist], scale: [1, mastH * 0.5, 1], color: WHITE, args: [0.05, 0.055, 8] })
        p.push({ geo: 'cyl', pos: [cx * rWaist, waist + mastH * 0.75, cz * rWaist], scale: [1, mastH * 0.5, 1], color: RED, args: [0.04, 0.05, 8] })
        // antenna tip
        p.push({ geo: 'cyl', pos: [cx * rWaist, h + 0.25, cz * rWaist], scale: [1, 0.5, 1], color: WHITE, args: [0.015, 0.03, 6] })
      }
      // waist platform and crossbars (triangular prisms)
      p.push({ geo: 'cyl', pos: [0, waist, 0], rot: [0, Math.PI / 6, 0], scale: [1, 0.1, 1], color: RED, args: [rWaist + 0.06, rWaist + 0.06, 3] })
      for (const f of [0.74, 0.9]) p.push({ geo: 'cyl', pos: [0, waist + (h - waist) * (f - 0.58) / 0.42, 0], rot: [0, Math.PI / 6, 0], scale: [1, 0.06, 1], color: WHITE, args: [rWaist + 0.04, rWaist + 0.04, 3] })
      p.push({ geo: 'cyl', pos: [0, h, 0], rot: [0, Math.PI / 6, 0], scale: [1, 0.08, 1], color: RED, args: [rWaist + 0.05, rWaist + 0.05, 3] })
      // base building
      p.push({ geo: 'box', pos: [0, 0.12, 0], scale: [0.5, 0.24, 0.4], color: '#d9d5cc' })
      return p
    }
    case 'ferry': {
      // Ferry Building: a 200 m, three-storey arcaded hall along the Embarcadero (local +z is the street front) under a
      // long skylit roof, pavilions at the centre and both ends, and the Giralda-style clock tower rising just behind the
      // central pavilion: plain shaft, four dials, a colonnaded belfry, two shrinking stages, a lantern, bronze dome and
      // flag. Plan is 1.2x true (any longer and it runs into Pier 1); the tower is ~1.8x in plan to keep its silhouette.
      const WALL = '#e3dfd3', TRIM = '#efece3', TOWER = '#eae7dd', ROOF = '#7d7e78', GLASS = '#a9b6b8', DIAL = '#f6f1e2', BRONZE = '#a98a4e'
      const L = 2.4, D = 0.56, EAVE = 0.3, SUNK = -0.15
      const tz = 0.17, TW = 0.21
      const p: Part[] = [
        box(0, SUNK, EAVE, 0, L, D, WALL),
        box(0, EAVE - 0.012, EAVE + 0.018, 0, L + 0.04, D + 0.04, TRIM, true),
        box(0, EAVE + 0.018, EAVE + 0.06, 0, L - 0.12, D - 0.12, ROOF),
        box(0, EAVE + 0.06, EAVE + 0.095, -0.03, L - 0.5, 0.14, GLASS, true),
        box(0, SUNK, EAVE + 0.07, D / 2 + 0.02, 0.52, 0.12, WALL),
        wallOpenings(0, 0, 0.03, 0.28, 0.44, 2 * (D / 2 + 0.08), 3, 0.1, { sides: 1 }),
        wallOpenings(0, 0, 0.02, 0.27, L - 0.5, D, 21, 0.055, { rows: 2, sides: -1 }),
        wallOpenings(0, 0, 0.02, 0.27, D - 0.12, L, 4, 0.055, { rows: 2, axis: 1 }),
      ]
      for (const side of [-1, 1]) {
        p.push(box(side * (L / 2 - 0.11), SUNK, EAVE + 0.04, 0, 0.22, D + 0.05, WALL))
        p.push(wallOpenings(side * 0.62, 0, 0.02, 0.27, 0.7, D, 8, 0.055, { rows: 2, sides: 1 }))
      }
      // tower, bottom to top
      const yClock = 0.7, yBelfry = 0.86, yStage = 1.04, yLantern = 1.16, yDome = 1.28
      p.push(
        box(0, 0.2, yBelfry, tz, TW, TW, TOWER),
        box(0, yBelfry, yBelfry + 0.025, tz, TW + 0.05, TW + 0.05, TRIM, true),
        box(0, yBelfry + 0.025, yStage, tz, TW - 0.02, TW - 0.02, TOWER),
        box(0, yStage - 0.01, yStage + 0.012, tz, TW + 0.03, TW + 0.03, TRIM, true),
        box(0, yStage + 0.012, yLantern, tz, 0.135, 0.135, TOWER),
        box(0, yLantern - 0.008, yLantern + 0.01, tz, 0.165, 0.165, TRIM, true),
        shift(drum(yLantern + 0.01, yDome, 0.042, 0.042, TOWER), tz),
        shift(drum(yDome - 0.006, yDome + 0.008, 0.052, 0.052, TRIM, true), tz),
        shift(drumOpenings(yLantern + 0.03, yDome - 0.02, 0.042, 0.018), tz),
        { geo: 'sphere', pos: [0, yDome + 0.008, tz], scale: [0.04, 0.06, 0.04], color: BRONZE, args: [1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2] },
        box(0, yDome + 0.06, yDome + 0.26, tz, 0.008, 0.008, SHADE, true),
        box(0.04, yDome + 0.21, yDome + 0.255, tz, 0.07, 0.004, RED, true),
      )
      // belfry colonnade and the stage above it, on all four faces
      for (const axis of [0, 1] as const) {
        p.push(shift(wallOpenings(0, 0, yBelfry + 0.05, yStage - 0.03, TW - 0.06, TW - 0.02, 4, 0.021, { axis, flat: true }), tz))
        p.push(shift(wallOpenings(0, 0, yStage + 0.03, yLantern - 0.025, 0.1, 0.135, 2, 0.032, { axis }), tz))
      }
      // clocks: a rim, a dial and two hands, each run straight through the shaft so one part shows on two opposite faces
      const hand = (len: number, deg: number, axis: 0 | 1): Part => {
        const a = (deg * Math.PI) / 180, u = (-Math.sin(a) * len) / 2, v = (Math.cos(a) * len) / 2
        return axis
          ? { geo: 'box', pos: [0, yClock + v, tz - u], rot: [a, 0, 0], scale: [TW + 0.034, len, 0.009], color: SHADE, detail: true }
          : { geo: 'box', pos: [u, yClock + v, tz], rot: [0, 0, a], scale: [0.009, len, TW + 0.034], color: SHADE, detail: true }
      }
      for (const axis of [0, 1] as const) {
        const rot: [number, number, number] = axis ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]
        p.push({ geo: 'cyl', pos: [0, yClock, tz], rot, scale: [0.17, TW + 0.012, 0.17], color: SHADE, args: [0.5, 0.5, 24], detail: true })
        p.push({ geo: 'cyl', pos: [0, yClock, tz], rot, scale: [0.142, TW + 0.022, 0.142], color: DIAL, args: [0.5, 0.5, 24], detail: true })
        p.push(hand(0.062, -60, axis), hand(0.045, 55, axis))
      }
      return p
    }
    case 'rotunda': {
      // Palace of Fine Arts: the open octagonal rotunda (eight real arches you can see through, paired terracotta columns
      // at the piers, entablature, an attic of relief panels, a shallow dome) standing in front of a curved double
      // colonnade, with the crescent exhibition hall behind it; all three are concentric, as measured from the city's
      // footprints. Local +z faces the lagoon. The arcs are 1.15x true plan; the rotunda is ~1.5x so it keeps its
      // squat silhouette under the height exaggeration. The origin is the middle of the complex, not the rotunda, so
      // the pipeline's clearing (symmetric about the origin) doesn't reach across the lagoon into the Marina's houses.
      const BUFF = '#e2c896', OCHRE = '#d9b47c', TERRACOTTA = '#c27e55', RELIEF = '#c9955c', DOME = '#dcd7c4', HALL = '#d6c4a0', ROOF = '#b4ae9e', STEP = '#d3c6a8', LAGOON = '#74add0'
      const ZR = 0.25, ZC = 1.07 // rotunda centre, and the centre the arcs are struck from
      const deg = Math.PI / 180
      const onArc = (r: number, a: number): [number, number] => [r * Math.sin(a), ZC - r * Math.cos(a)]
      const yWall = 0.42, yAttic = 0.49, yCornice = 0.64, yDome = 0.72, top = H(49)
      const wallD = 0.8, wallH = yWall - 0.03, archW = 0.19
      const p: Part[] = [
        prism(ZR, -0.1, 0.03, 0.5, 8, STEP),
        { geo: 'ringwall', pos: [0, (0.03 + yWall) / 2, ZR], scale: [wallD, wallH, wallD], color: OCHRE,
          args: [8, r4(0.07 / wallD), r4(archW / wallD), r4((yWall - 0.065) / wallH), r4(archW / 2 / wallH)] },
        prism(ZR, yWall, yAttic, 0.485, 8, BUFF),
        prism(ZR, yAttic, yCornice, 0.41, 8, OCHRE),
        { ...shift(drumOpenings(yAttic + 0.025, yCornice - 0.02, 0.41 * Math.cos(Math.PI / 8), 0.21, 1, true), ZR), color: RELIEF },
        prism(ZR, yCornice, yCornice + 0.03, 0.435, 8, BUFF, true),
        shift(drum(yCornice + 0.03, yDome, 0.365, 0.355, BUFF), ZR),
        { geo: 'sphere', pos: [0, yDome, ZR], scale: [0.345, top - yDome, 0.345], color: DOME, args: [1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2] },
      ]
      // paired columns either side of each pier
      const pier: [number, number][] = []
      for (let k = 0; k < 8; k++) for (const d of [-6.5, 6.5]) {
        const a = (22.5 + 45 * k + d) * deg
        pier.push([0.437 * Math.cos(a), ZR + 0.437 * Math.sin(a)])
      }
      p.push(columns(pier, 0.03, yWall, 0.022, TERRACOTTA))
      // colonnade: two rows of columns from the rotunda's flanks round to 72 degrees, an entablature, and the boxes on top
      const RC = 1.13, from = 19 * deg, to = 72 * deg, bays = 12
      const row: [number, number][] = []
      for (const side of [-1, 1]) for (let i = 0; i <= bays; i++) for (const r of [RC - 0.036, RC + 0.036]) row.push(onArc(r, side * (from + ((to - from) * i) / bays)))
      const both = (rs: [number, number][]): [number, number][] => [...rs.map(([a, b]) => [-b * deg, -a * deg] as [number, number]).reverse(), ...rs.map(([a, b]) => [a * deg, b * deg] as [number, number])]
      p.push(
        columns(row, -0.12, 0.27, 0.017, TERRACOTTA), // sunk: the park dips towards the ends of the wings
        sector(ZC, 0.27, 0.335, RC - 0.06, RC + 0.06, both([[18.5, 72.5]]), BUFF),
        sector(ZC, 0.335, 0.4, RC - 0.07, RC + 0.07, both([[18.5, 22.5], [36, 40], [53, 57], [68.5, 72.5]]), OCHRE, true),
        // exhibition hall
        sector(ZC, -0.1, 0.25, 1.385, 1.87, [[-55 * deg, 55 * deg]], HALL),
        sector(ZC, 0.25, 0.285, 1.43, 1.825, [[-54 * deg, 54 * deg]], ROOF, true),
        // the lagoon the rotunda is mirrored in; the ground texture doesn't have it. A thin plate a hair above the lawn,
        // because the whole model lifts on hover and a thick slab would rise out of the ground with it
        { geo: 'cyl', pos: [0, 0.005, 1.03], scale: [2.2, 0.02, 0.56], color: LAGOON, detail: true, args: [0.5, 0.5, 32] },
      )
      return p
    }
    case 'stadium':
      return [
        { geo: 'cyl', pos: [0, 0.35, 0], scale: [1.4, 0.7, 1.1], color: '#d5cbb8', args: [1, 1.1, 20, 1, true] },
        { geo: 'cyl', pos: [0, 0.02, 0], scale: [1.4, 0.04, 1.1], color: GREEN, args: [0.85, 0.85, 20] },
      ]
    case 'alcatraz': {
      // Alcatraz, at true size (510 m long; local -z is the north-west tip, +x the dock side). The heightmap only knows the
      // island as an 80 m-pixel bump, so the model brings its own rock in three terraces, a little bigger than that bump:
      // the cellhouse along the top with the lighthouse at its south-east end, the water tower and the power house's stack
      // to the north-west, the long industries building on the west shore, Building 64 above the dock, and the ferry in.
      const CLIFF = '#b9ab8c', ROCK = '#c6b999', TOP = '#cfc4a5', CREAM = '#ebe4d0', ROOFING = '#c4c0b3', RUST = '#a9694a', SCRUB = '#7f9a5e'
      const y1 = 0.14, y2 = 0.42, y3 = 0.7
      const p: Part[] = [
        slab(-0.2, -0.1, -0.3, y1, 2.5, 5.4, 0.93, CLIFF),
        slab(0, 0.05, y1, y2, 1.55, 4.3, 0.88, ROCK),
        slab(0.05, 0.1, y2, y3, 1.05, 3.1, 0.9, TOP),
        // cellhouse, its roof and skylights, the administration wing towards the lighthouse
        box(0.05, y3, y3 + 0.26, 0, 0.5, 1.5, CREAM),
        box(0.05, y3 + 0.26, y3 + 0.285, 0, 0.44, 1.44, ROOFING, true),
        asDetail(blocks([-0.12, 0, 0.12].map((dx) => [0.05 + dx, -0.05, 0.05, 1.2, y3 + 0.285, y3 + 0.31]), '#a9b8ba')),
        box(0.05, y3, y3 + 0.18, 0.92, 0.42, 0.34, CREAM),
        wallOpenings(0.05, 0, y3 + 0.04, y3 + 0.22, 1.4, 0.5, 14, 0.035, { axis: 1, flat: true }),
        wallOpenings(0.05, 0.92, y3 + 0.03, y3 + 0.14, 0.34, 0.34, 4, 0.03, { sides: 1, flat: true }),
        // lighthouse
        at(drum(y3, y3 + 0.5, 0.04, 0.028, '#f4f2ec'), -0.22, 1.0),
        at(drum(y3 + 0.5, y3 + 0.56, 0.036, 0.036, SHADE, true), -0.22, 1.0),
        { geo: 'cone', pos: [-0.22, y3 + 0.59, 1.0], scale: [0.09, 0.06, 0.09], color: '#3b3b3b', args: [0.5, 8], detail: true },
        box(-0.22, y3, y3 + 0.1, 1.0, 0.16, 0.16, CREAM, true),
        // water tower
        columns([[-0.31, -1.06], [-0.19, -1.06], [-0.19, -0.94], [-0.31, -0.94]], y2, y2 + 0.5, 0.008, '#8d8d86'),
        at(drum(y2 + 0.5, y2 + 0.64, 0.085, 0.085, '#d9d5c8', true), -0.25, -1.0),
        { geo: 'cone', pos: [-0.25, y2 + 0.67, -1.0], scale: [0.19, 0.06, 0.19], color: RUST, args: [0.5, 12], detail: true },
        // power house and stack at the north-west tip; industries building along the west shore
        box(0.2, y1, y1 + 0.16, -2.0, 0.4, 0.3, CREAM, true),
        at(drum(y1, y1 + 0.62, 0.03, 0.022, CREAM, true), 0.32, -1.9),
        box(-0.72, y1, y1 + 0.15, -1.35, 0.22, 1.1, CREAM, true),
        { ...wallOpenings(-0.72, -1.35, y1 + 0.03, y1 + 0.12, 1.0, 0.22, 16, 0.03, { axis: 1, flat: true }) },
        // Building 64 above the dock, the dock, and the ferry
        box(0.62, y1, y1 + 0.3, 1.15, 0.2, 0.95, '#ddd3bb', true),
        wallOpenings(0.62, 1.15, y1 + 0.03, y1 + 0.27, 0.88, 0.2, 12, 0.03, { axis: 1, rows: 3, flat: true, sides: 1 }),
        box(0.98, -0.2, 0.06, 1.3, 0.34, 0.6, '#cfcabd', true),
        asDetail(blocks([[1.26, 1.3, 0.11, 0.36, 0, 0.06]], '#f4f2ec')),
        asDetail(blocks([[1.26, 1.27, 0.08, 0.2, 0.06, 0.1]], '#2f6ea5')),
      ]
      // scrub and the old gardens on the slopes
      for (const [x, y, z, r] of [[-0.6, y2, 0.5, 0.2], [0.75, y2, -0.3, 0.22], [-0.75, y1 + 0.05, -0.3, 0.18], [0.55, y2, -1.2, 0.2], [-0.3, y2, 1.6, 0.22], [0.5, y1 + 0.05, 2.0, 0.2], [-0.5, y3 - 0.02, -0.55, 0.13]])
        p.push({ geo: 'sphere', pos: [x, y, z], scale: [r, r * 0.35, r * 1.3], color: SCRUB, detail: true, args: [1, 8, 6] })
      return p
    }
    case 'twinpeaks':
      return twinPeaks(terrain)
    case 'ballpark': {
      // Oracle Park. Local axes are the foul lines, which follow the SoMa grid: third base runs up King St (-z), first base
      // along 3rd St towards the cove (+x), home plate in the corner by Willie Mays Plaza. A quarter-circle of grass and
      // infield dirt; the brick grandstand in three rising decks round the infield, longer on the third-base side, with a
      // roof, light towers and clock towers; bleachers from left to centre, the scoreboard, the low brick arcade along the
      // cove in right, and the glove and bottle behind left field. OSM has no footprint for it, so sizes are 1.1x the real
      // field (LF 103 m, CF 122 m, RF 94 m) and stands judged from aerials.
      const GRASS_ = '#6fa35a', DIRT = '#b98a5e', SEATS = '#2f5d46', BRICK = '#a5553f', CANOPY = '#d9d5cc', BOARD = '#2a2f2e'
      const hx = -0.5, hz = 0.5, R = 1.25, q = Math.PI / 2
      const field = (p: Part): Part => asDetail(at(p, hx, 0))
      const p: Part[] = [{ ...box(-0.08, -0.1, 0.34, 0.08, 2.15, 2.15, BRICK), hullOnly: true }]
      p.push(
        field(sector(hz, -0.1, 0.03, 0, R, [[0, q]], GRASS_)),
        field(sector(hz, 0.03, 0.036, 0, 0.42, [[0, q]], DIRT)),
        field(sector(hz, 0.036, 0.04, 0, 0.27, [[0.12, q - 0.12]], GRASS_)),
        field(sector(hz, 0.03, 0.036, R - 0.06, R, [[0, q]], DIRT)),
        asDetail(at(drum(0.03, 0.05, 0.035, 0.03, DIRT), hx + 0.135, hz - 0.135)),
        // outfield: bleachers left to centre, the brick arcade in right
        field(sector(hz, -0.1, 0.13, R, R + 0.12, [[0, 0.95]], SEATS)),
        field(sector(hz, -0.1, 0.22, R + 0.12, R + 0.24, [[0, 0.95]], SEATS)),
        field(sector(hz, -0.1, 0.16, R, R + 0.07, [[0.95, q]], BRICK)),
      )
      // grandstand decks: each is a strip along third base, a strip along first base, and the corner behind home
      const decks: number[][][] = [[], [], []], walls: number[][] = [], roofs: number[][] = []
      const len3 = 1.3, len1 = 0.85
      // [distance behind the foul line, depth, top]
      ;[[0.04, 0.15, 0.15], [0.15, 0.17, 0.27], [0.32, 0.15, 0.43]].forEach(([off, depth, top], i) => {
        decks[i].push([hx - off - depth / 2, hz - len3 / 2 + off + depth, depth, len3 + off + depth, -0.1, top], [hx + len1 / 2 - off - depth, hz + off + depth / 2, len1 + off + depth, depth, -0.1, top])
      })
      walls.push([hx - 0.5, hz - len3 / 2 + 0.5, 0.06, len3 + 0.5, -0.1, 0.46], [hx + len1 / 2 - 0.5, hz + 0.5, len1 + 0.5, 0.06, -0.1, 0.46])
      roofs.push([hx - 0.42, hz - len3 / 2 + 0.47, 0.2, len3 + 0.47, 0.5, 0.52], [hx + len1 / 2 - 0.47, hz + 0.42, len1 + 0.47, 0.2, 0.5, 0.52])
      decks.forEach((list, i) => p.push(asDetail(blocks(list, i === 1 ? '#37694f' : SEATS))))
      p.push(
        asDetail(blocks(walls, BRICK)),
        asDetail(blocks(roofs, CANOPY)),
        wallOpenings(hx - 0.5, hz - len3 / 2 + 0.5, 0.02, 0.3, len3 + 0.3, 0.06, 12, 0.06, { axis: 1, rows: 2, sides: -1 }),
        wallOpenings(hx + len1 / 2 - 0.5, hz + 0.5, 0.02, 0.3, len1 + 0.3, 0.06, 9, 0.06, { rows: 2, sides: 1 }),
        // clock towers at the plaza corner and the left-field gate
        asDetail(blocks([[hx - 0.5, hz + 0.5, 0.14, 0.14, -0.1, 0.62], [hx - 0.5, hz - len3, 0.12, 0.12, -0.1, 0.55]], BRICK)),
        asDetail(blocks([[hx - 0.5, hz + 0.5, 0.17, 0.17, 0.62, 0.74], [hx - 0.5, hz - len3, 0.15, 0.15, 0.55, 0.66]], '#4f7a63', { pyramid: true })),
        // light towers on the roof
        columns([[hx - 0.44, hz - 0.9], [hx - 0.44, hz - 0.3], [hx - 0.2, hz + 0.44], [hx + 0.2, hz + 0.44]], 0.52, 0.8, 0.008, '#8d8d86'),
        asDetail(blocks([[hx - 0.44, hz - 0.9, 0.03, 0.16, 0.78, 0.86], [hx - 0.44, hz - 0.3, 0.03, 0.16, 0.78, 0.86], [hx - 0.2, hz + 0.44, 0.16, 0.03, 0.78, 0.86], [hx + 0.2, hz + 0.44, 0.16, 0.03, 0.78, 0.86]], '#e9e7e0')),
      )
      // scoreboard in centre field, facing home; the glove and the bottle behind left
      const cf = R + 0.2, a = Math.PI / 4
      p.push(
        { geo: 'box', pos: [hx + cf * Math.sin(a), 0.37, hz - cf * Math.cos(a)], rot: [0, -a, 0], scale: [0.62, 0.3, 0.05], color: BOARD, detail: true },
        { geo: 'box', pos: [hx + (cf - 0.03) * Math.sin(a), 0.37, hz - (cf - 0.03) * Math.cos(a)], rot: [0, -a, 0], scale: [0.5, 0.2, 0.01], color: '#51697a', detail: true },
        { geo: 'sphere', pos: [hx + 0.42, 0.3, hz - R - 0.2], scale: [0.07, 0.06, 0.05], color: '#8a5a3c', detail: true },
        { geo: 'cyl', pos: [hx + 0.24, 0.31, hz - R - 0.2], rot: [0, 0, 0.9], scale: [0.045, 0.2, 0.045], color: '#3d7a4a', detail: true, args: [0.3, 0.5, 10] },
      )
      return p
    }
    case 'arena': {
      // Chase Center, on its OSM footprint (150 m across, 38 m tall): a glazed podium, the white drum flaring slightly as it
      // rises, wrapped in tilted bands (the facade's swirl), a flat white roof with the blue mark in the middle, and the
      // glass gatehouse wedge on the plaza side. The Uber towers beside it are real footprints.
      const WHITE = '#f3f1ea', BAND = '#c6cbce', GLAZING = '#8fa3ad', h = H(l.height ?? 38)
      const p: Part[] = [
        slab(0, 0, -0.1, 0.17, 1.5, 1.5, 0.96, GLAZING, 0.5),
        { geo: 'cyl', pos: [0, (0.17 + h) / 2, 0], scale: [1.36, h - 0.17, 1.36], color: WHITE, args: [0.5, 0.46, 40] },
        asDetail(drum(h, h + 0.03, 0.64, 0.6, '#fbfaf6')),
        asDetail(drum(h + 0.034, h + 0.04, 0.13, 0.13, '#2f6ea5')),
        asDetail(drum(h + 0.03, h + 0.034, 0.4, 0.4, '#e6e4dc')),
        box(0.62, -0.1, 0.3, 0.45, 0.3, 0.4, '#a9c0cb', true),
      ]
      ;[[0.3, 0.07, 0.03], [0.4, -0.06, 0.05], [0.5, 0.05, -0.05], [0.6, -0.04, -0.03]].forEach(([y, rx, rz]) => {
        const r = 0.626 + ((y - 0.17) / (h - 0.17)) * 0.054 + 0.004
        p.push({ geo: 'cyl', pos: [0, y, 0], rot: [rx, 0, rz], scale: [2 * r, 0.035, 2 * r], color: BAND, detail: true, args: [0.5, 0.496, 40, 1, true] })
      })
      return p
    }
    case 'museum': {
      // Exploratorium at Pier 15, on its OSM footprint (230 m pier shed, local -z out into the bay): the classical bulkhead
      // building on the Embarcadero with its arched entrance, the long shed under a roof of solar panels split by a white
      // clerestory, doors down both sides, the apron round it, and the glass Bay Observatory at the far end.
      const WALL = '#d8d5cb', BULKHEAD = '#efece3', SOLAR = '#3d5a80', WHITE = '#f1efe9', GLASS_ = '#9fc3d2', APRON = '#cfcabd'
      const L = 2.3, zb = L / 2
      return [
        box(0, -0.12, 0.05, 0, 0.72, L + 0.1, APRON),
        box(0, 0.05, 0.22, -0.05, 0.52, L - 0.4, WALL),
        asDetail(blocks([[0, -0.05, 0.54, L - 0.42, 0.22, 0.29]], SOLAR, { gabled: true })),
        box(0, 0.27, 0.315, -0.05, 0.07, L - 0.5, WHITE, true),
        { ...wallOpenings(0, -0.05, 0.06, 0.16, L - 0.5, 0.52, 20, 0.05, { axis: 1, flat: true }), color: '#7f8f96' },
        // bulkhead building
        box(0, 0.05, 0.3, zb - 0.1, 0.62, 0.2, BULKHEAD),
        box(0, 0.3, 0.33, zb - 0.1, 0.4, 0.22, BULKHEAD, true),
        wallOpenings(0, 0, 0.06, 0.25, 0.16, 2 * zb, 1, 0.13, { sides: 1 }),
        wallOpenings(-0.2, 0, 0.08, 0.2, 0.16, 2 * zb, 2, 0.04, { sides: 1 }),
        wallOpenings(0.2, 0, 0.08, 0.2, 0.16, 2 * zb, 2, 0.04, { sides: 1 }),
        // Bay Observatory
        box(0, 0.05, 0.27, -zb + 0.17, 0.36, 0.3, GLASS_),
        box(0, 0.27, 0.29, -zb + 0.17, 0.4, 0.34, WHITE, true),
        { ...wallOpenings(0, -zb + 0.17, 0.06, 0.26, 0.34, 0.3, 5, 0.006, { sides: -1, flat: true }), color: WHITE },
        { ...wallOpenings(0, -zb + 0.17, 0.06, 0.26, 0.28, 0.36, 4, 0.006, { axis: 1, flat: true }), color: WHITE },
      ]
    }
    case 'tamalpais': {
      // Mount Tamalpais: the terrain already has the mountain, so the model is what stands on East Peak: the Gardner fire
      // lookout (1936), a rough stone base tapering up two storeys to a wooden cab with windows all round, a catwalk, a hipped
      // roof and a flagpole, on the summit's rocky knoll. ~5x true size, or it vanishes on a 784 m mountain. The whole State
      // Park is the landmark's hoverable outline (areas.json).
      const ROCK = '#a9a08a', STONE_ = '#9d958a', WOOD = '#6e4e36', CAB = '#e9e2d0', GLASS_ = '#3e4a52', ROOF_ = '#5a3f2e'
      const sq = (y0: number, y1: number, r0: number, r1: number, color: string, detail = false): Part =>
        ({ geo: 'cyl', pos: [0, (y0 + y1) / 2, 0], scale: [2 * r0 * Math.SQRT2, y1 - y0, 2 * r0 * Math.SQRT2], color, detail, args: [r4(0.5 * r1 / r0), 0.5, 4, 1, false, Math.PI / 4] })
      const yb = 0.05, yc = 0.42, yr = 0.58
      return [
        // the summit's rocky crown, sunk deep: the terrain's 80 m pixels round the real peak off, and any skirt wide enough to
        // meet the slopes stood out from them like a pedestal
        tier(0, -0.7, 0.02, 0.42, 0.3, ROCK, 9),
        { geo: 'sphere', pos: [0.22, 0.02, 0.1], scale: [0.14, 0.07, 0.11], color: ROCK, detail: true, args: [1, 7, 5] },
        { geo: 'sphere', pos: [-0.2, 0.0, -0.14], scale: [0.12, 0.06, 0.1], color: ROCK, detail: true, args: [1, 7, 5] },
        sq(yb - 0.1, yc, 0.21, 0.16, STONE_),
        // the door and a window in the stone, the stair up the south side
        box(0, yb, yb + 0.14, 0.17, 0.07, 0.02, '#3b3127', true),
        box(0.09, yb + 0.2, yb + 0.27, 0.19 - 0.012, 0.05, 0.02, '#3b3127', true),
        box(-0.16, yb - 0.06, yb + 0.09, 0.22, 0.12, 0.12, STONE_, true),
        // the catwalk, the cab with its band of windows, the roof and the flag
        box(0, yc, yc + 0.025, 0, 0.44, 0.44, WOOD),
        blocks([-1, 1].flatMap((sd) => [[0, sd * 0.215, 0.44, 0.008, yc + 0.025, yc + 0.075], [sd * 0.215, 0, 0.008, 0.44, yc + 0.025, yc + 0.075]]), WOOD, { detail: true }),
        box(0, yc + 0.025, yr, 0, 0.3, 0.3, CAB),
        box(0, yc + 0.06, yr - 0.02, 0, 0.306, 0.306, GLASS_, true),
        blocks([-1, 0, 1].flatMap((k) => [[k * 0.1, 0.153, 0.012, 0.004, yc + 0.06, yr - 0.02], [k * 0.1, -0.153, 0.012, 0.004, yc + 0.06, yr - 0.02], [0.153, k * 0.1, 0.004, 0.012, yc + 0.06, yr - 0.02], [-0.153, k * 0.1, 0.004, 0.012, yc + 0.06, yr - 0.02]]), CAB, { detail: true }),
        blocks([[0, 0, 0.4, 0.4, yr, yr + 0.12]], ROOF_, { pyramid: true }),
        box(0.12, yr + 0.05, yr + 0.36, 0.12, 0.008, 0.008, '#4a4a4a', true),
        box(0.16, yr + 0.29, yr + 0.35, 0.12, 0.08, 0.004, ORANGE, true),
      ]
    }
    case 'peak':
      return [
        { geo: 'cone', pos: [0, 0.35, 0], scale: [1, 0.7, 1], color: '#c9b98f', args: [0.55, 6] },
        { geo: 'box', pos: [0, 0.9, 0], scale: [0.05, 0.6, 0.05], color: '#4a4a4a' },
        { geo: 'box', pos: [0.13, 1.08, 0], scale: [0.26, 0.16, 0.02], color: ORANGE },
      ]
    case 'park':
      return [
        { geo: 'sphere', pos: [-0.5, 0.45, 0.1], scale: [0.5, 0.5, 0.5], color: GREEN },
        { geo: 'sphere', pos: [0.2, 0.55, -0.2], scale: [0.6, 0.6, 0.6], color: '#5c9350' },
        { geo: 'sphere', pos: [0.6, 0.4, 0.35], scale: [0.45, 0.45, 0.45], color: '#7db068' },
        { geo: 'cyl', pos: [-0.5, 0.15, 0.1], scale: [1, 0.3, 1], color: '#8a5a3c', args: [0.06, 0.08, 6] },
        { geo: 'cyl', pos: [0.2, 0.2, -0.2], scale: [1, 0.4, 1], color: '#8a5a3c', args: [0.07, 0.09, 6] },
        { geo: 'cyl', pos: [0.6, 0.12, 0.35], scale: [1, 0.25, 1], color: '#8a5a3c', args: [0.05, 0.07, 6] },
      ]
    case 'forest': {
      // Muir Woods: a grove of old-growth coast redwoods along Redwood Creek, the main trail heading up the canyon from the
      // entrance (local -z, turned up-canyon by the landmark's bearing). Trees at true height (the tallest ~75 m): straight red-
      // brown trunks, bare for their lower half, under narrow dark crowns, with ferns at their feet; the creek and the boardwalk
      // wind between them. The National Monument's outline is the landmark's hoverable area (areas.json).
      const TRUNK = '#8a4b32', CROWN_A = '#2f5d3a', CROWN_B = '#3a6b44', FERN = '#5f8f4a', BOARD = '#b89a6a', CREEK = '#6f9fbf'
      const p: Part[] = []
      // the creek and the boardwalk as gentle zigzags up the canyon
      const creek: [number, number][] = [[0.02, 0.75], [-0.05, 0.4], [0.06, 0.05], [-0.03, -0.3], [0.05, -0.65], [-0.02, -0.95]]
      const walk: [number, number][] = creek.map(([x, z], k) => [x + (k % 2 ? 0.07 : -0.07), z])
      const strip = (pts: [number, number][], w: number, y: number, color: string) => {
        const r = road(pts, [[0, y]])
        return r.deck(0, r.length, 0, w, 0.01, color, 0, true)
      }
      p.push(...strip(creek, 0.035, 0.005, CREEK), ...strip(walk, 0.03, 0.012, BOARD))
      // trees: a pseudo-random scatter either side of the creek, denser in the middle of the grove
      let seed = 7
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      const trunks: [number, number, number][] = []
      for (let k = 0; k < 34; k++) {
        const z = 0.8 - 1.75 * rnd(), side = rnd() < 0.5 ? -1 : 1
        const x = side * (0.09 + 0.22 * rnd()) + 0.03 * Math.sin(z * 4)
        trunks.push([x, z, H(45 + 30 * rnd())])
      }
      for (const [x, z, h] of trunks) {
        const r = 0.012 + h * 0.006
        p.push({ geo: 'cyl', pos: [x, (h * 0.55 - 0.3) / 2, z], scale: [1, h * 0.55 + 0.3, 1], color: TRUNK, args: [r * 0.8, r, 7], detail: true })
        p.push({ geo: 'cone', pos: [x, h * 0.72, z], scale: [r * 6, h * 0.56, r * 6], color: rnd() < 0.5 ? CROWN_A : CROWN_B, args: [0.5, 7], detail: true })
      }
      for (let k = 0; k < 18; k++) {
        const z = 0.75 - 1.6 * rnd(), x = (rnd() - 0.5) * 0.5
        p.push({ geo: 'sphere', pos: [x, 0.01, z], scale: [0.05, 0.025, 0.05], color: FERN, detail: true, args: [1, 7, 4] })
      }
      // the grove's hover box (the trees are all detail: their hulls would be a forest of outlines)
      p.push({ geo: 'box', pos: [0, H(75) / 2, -0.07], scale: [0.7, H(75), 1.85], color: '#000', hit: true })
      return p
    }
    case 'beach':
      return [
        { geo: 'box', pos: [0, 0.03, 0], rot: [0, 0.4, 0], scale: [1.8, 0.06, 0.8], color: '#f0e2b8' },
        { geo: 'sphere', pos: [0.4, 0.2, 0.15], scale: [0.22, 0.22, 0.22], color: '#3f6fb0' },
        { geo: 'box', pos: [-0.4, 0.25, -0.1], scale: [0.06, 0.5, 0.06], color: '#e35c3b' },
      ]
    case 'houses': {
      // The Painted Ladies, 710-722 Steiner: six near-identical gabled Victorians stepping up the hill to the south (+x) and the
      // bigger hip-roofed house on the Grove St corner, all facing Alamo Square (+z). About 2x true size so a 6 m house reads;
      // each has its painted pediment under a dark roof, a white two-storey bay, a porch with steps, and a clipped street tree.
      const W = 0.12, D = 0.26, BIG = 0.17, F = D / 2, SUNK = -0.15
      const TRIM = '#fbf8f0', SLATE = '#4d4846', GLASS = '#5b5f66', STEPS = '#d8d2c4'
      const PAINT = ['#e9b9d4', '#a9d6a3', '#f0dc8c', '#f3e3cf', '#9cc3e6', '#efe6d8']
      const x0 = -(BIG + 6 * W) / 2
      // the hull stops at the eaves: grown, it reaches the ridges, so the outline shows in the notches between the gables
      const p: Part[] = [{ ...box(0, SUNK, 0.34, 0, BIG + 6 * W, D, TRIM), hullOnly: true }]
      const roofs: number[][] = [], white: number[][] = [], glass: number[][] = [], steps: number[][] = []
      for (let i = 0; i < 6; i++) {
        const x = x0 + BIG + (i + 0.5) * W, s = 0.014 * (i + 1), eave = 0.27 + s
        p.push(blocks([[x, 0, W, D, SUNK, eave]], PAINT[i], { detail: true }))
        p.push(blocks([[x, 0, W - 0.004, D, eave, eave + 0.075]], i === 3 ? '#c0473c' : PAINT[i], { gabled: true, detail: true }))
        // the roof is a hair bigger than the pediment and stops short of the front, so the painted gable shows under a dark edge
        roofs.push([x, -0.009, W + 0.006, D - 0.018, eave + 0.008, eave + 0.088])
        const bx = x - W * 0.2, px = x + W * 0.27
        white.push([bx, F + 0.015, W * 0.5, 0.03, 0.03 + s, eave - 0.02], [x, F + 0.002, W - 0.008, 0.004, 0.15 + s, 0.162 + s], [px, F + 0.02, W * 0.36, 0.04, s, 0.125 + s])
        for (const y of [0.06, 0.18]) for (const dx of [-0.014, 0.014]) glass.push([bx + dx, F + 0.0305, 0.017, 0.002, y + s, y + 0.055 + s])
        glass.push([px, F + 0.0405, 0.022, 0.002, 0.03 + s, 0.095 + s], [px, F + 0.0025, 0.02, 0.002, 0.18 + s, 0.235 + s], [x, F + 0.0005, 0.024, 0.002, eave + 0.012, eave + 0.04])
        steps.push([px, F + 0.06, W * 0.3, 0.04, SUNK, 0.035 + s * 0.5])
      }
      // 722 on the corner: wider, teal, hipped
      const xb = x0 + BIG / 2
      p.push(blocks([[xb, 0, BIG, D, SUNK, 0.29]], '#9fcfc3', { detail: true }))
      p.push(blocks([[xb, 0, BIG + 0.012, D + 0.012, 0.29, 0.39]], '#6b5a4e', { pyramid: true, detail: true }))
      white.push([xb - 0.035, F + 0.015, 0.07, 0.03, 0.03, 0.27], [xb, F + 0.002, BIG - 0.008, 0.004, 0.15, 0.162], [xb + 0.045, F + 0.02, 0.05, 0.04, 0, 0.12])
      for (const y of [0.06, 0.18]) for (const dx of [-0.017, 0.017]) glass.push([xb - 0.035 + dx, F + 0.0305, 0.02, 0.002, y, y + 0.06])
      glass.push([xb + 0.045, F + 0.0405, 0.024, 0.002, 0.03, 0.095], [xb + 0.045, F + 0.0025, 0.022, 0.002, 0.18, 0.24])
      steps.push([xb + 0.045, F + 0.06, 0.045, 0.04, SUNK, 0.03])
      p.push(
        blocks(roofs, SLATE, { gabled: true, detail: true }),
        blocks(white, TRIM, { detail: true }),
        blocks(glass, GLASS, { detail: true }),
        blocks(steps, STEPS, { detail: true }),
      )
      // the clipped trees along Steiner
      const trees: [number, number][] = [-0.36, -0.2, -0.04, 0.12, 0.28, 0.42].map((x) => [x, F + 0.13])
      p.push(columns(trees, -0.1, 0.07, 0.006, '#8a5a3c'))
      for (const [x, z] of trees) p.push({ geo: 'sphere', pos: [x, 0.085 + (x + 0.45) * 0.09, z], scale: [0.032, 0.03, 0.032], color: x > 0 ? '#5c9350' : GREEN, detail: true })
      return p
    }
    case 'island':
      return [
        { geo: 'box', pos: [0, 0.3, 0], scale: [1.2, 0.6, 0.6], color: CONCRETE },
        { geo: 'cyl', pos: [0.4, 0.85, 0], scale: [1, 0.5, 1], color: '#ecebe6', args: [0.12, 0.14, 10] },
        { geo: 'cone', pos: [0.4, 1.18, 0], scale: [1, 0.18, 1], color: RED, args: [0.16, 8] },
      ]
    case 'campanile':
      return [
        { geo: 'box', pos: [0, H(l.height ?? 90) / 2, 0], scale: [0.36, H(l.height ?? 90), 0.36], color: STONE },
        { geo: 'cone', pos: [0, H(l.height ?? 90) + 0.22, 0], scale: [1, 0.45, 1], color: '#b0a894', args: [0.3, 4] },
      ]
    case 'campus': {
      // Stanford. Hoover Tower is the landmark: a broad base block, a plain cream shaft with slit windows, the belfry with
      // three tall arches a side and a pinnacle on each corner, an octagonal arcaded drum, the red-tile dome and its lantern
      // (plan ~1.8x true, to keep the silhouette). The Main Quad beside it is `scenery`, at its true place and size in the
      // campus grid (bearing 15, local -z towards Palm Drive): an outer and an inner ring of arcaded sandstone wings under
      // red roofs, and Memorial Church with its mosaic gable. The real Quad is one solid 5 ha footprint: `covers` drops it.
      const h = H(l.height ?? 87)
      const STONE_ = '#ece2c8', TILE = '#b5482f', SAND = '#dcc8a0', MOSAIC = '#c9a24e'
      const TW = 0.29, yBase = 0.22, yBelfry = 0.64 * h, yDrum = 0.79 * h, yDome = 0.875 * h, yLantern = 0.955 * h
      const p: Part[] = [
        box(0, -0.1, yBase, 0, 0.56, 0.56, STONE_),
        box(0, yBase, yBase + 0.02, 0, 0.6, 0.6, STONE_, true),
        box(0, yBase, yBelfry, 0, TW, TW, STONE_),
        box(0, yBelfry, yBelfry + 0.02, 0, TW + 0.03, TW + 0.03, STONE_, true),
        box(0, yBelfry + 0.02, yDrum, 0, TW - 0.02, TW - 0.02, STONE_),
        box(0, yDrum - 0.005, yDrum + 0.015, 0, TW + 0.02, TW + 0.02, STONE_, true),
        prism(0, yDrum + 0.015, yDome, 0.115, 8, STONE_),
        drumOpenings(yDrum + 0.035, yDome - 0.02, 0.115 * Math.cos(Math.PI / 8), 0.04),
        shift(drum(yDome - 0.004, yDome + 0.01, 0.125, 0.125, STONE_, true), 0),
        { geo: 'sphere', pos: [0, yDome + 0.01, 0], scale: [0.112, yLantern - yDome - 0.01, 0.112], color: TILE, args: [1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2] },
        drum(yLantern - 0.01, yLantern + 0.035, 0.024, 0.024, STONE_, true),
        { geo: 'cone', pos: [0, (yLantern + 0.035 + h) / 2, 0], scale: [0.07, h - yLantern - 0.035, 0.07], color: TILE, args: [0.5, 8], detail: true },
      ]
      for (const axis of [0, 1] as const) {
        p.push(wallOpenings(0, 0, 0, 0.17, 0.2, 0.56, 1, 0.1, { axis }))
        p.push(wallOpenings(0, 0, yBase + 0.12, yBelfry - 0.1, TW - 0.1, TW, 2, 0.016, { axis, rows: 5, flat: true }))
        p.push(wallOpenings(0, 0, yBelfry + 0.05, yDrum - 0.03, TW - 0.07, TW - 0.02, 3, 0.042, { axis }))
      }
      // corner pinnacles on the belfry
      const c = (TW - 0.02) / 2 - 0.02
      const corners = [[-c, -c], [c, -c], [c, c], [-c, c]]
      p.push(blocks(corners.map(([x, z]) => [x, z, 0.045, 0.045, yDrum, yDrum + 0.06]), STONE_, { detail: true }))
      p.push(blocks(corners.map(([x, z]) => [x, z, 0.055, 0.055, yDrum + 0.06, yDrum + 0.11]), TILE, { pyramid: true, detail: true }))

      // the Main Quad
      const QX = -2.75, QZ = 0.86, wall = 0.2
      const ring = (w: number, d: number, t: number, zc: number) => ({
        x: [[QX, zc - d / 2 + t / 2, w, t], [QX, zc + d / 2 - t / 2, w, t]],
        z: [[QX - w / 2 + t / 2, zc, t, d - 2 * t], [QX + w / 2 - t / 2, zc, t, d - 2 * t]],
      })
      const outer = ring(2.8, 2.4, 0.3, QZ), inner = ring(1.75, 1.15, 0.24, QZ + 0.1)
      const scenery = (q: Part): Part => ({ ...q, detail: true, scenery: true })
      const wingsX = [...outer.x, ...inner.x], wingsZ = [...outer.z, ...inner.z]
      p.push(
        scenery(blocks([...wingsX, ...wingsZ].map(([x, z, w, d]) => [x, z, w, d, -0.1, wall]), SAND)),
        scenery(blocks(wingsX.map(([x, z, w, d]) => [x, z, w + 0.03, d + 0.04, wall, wall + 0.09]), TILE, { gabled: 'x' })),
        scenery(blocks(wingsZ.map(([x, z, w, d]) => [x, z, w + 0.04, d + 0.03, wall, wall + 0.09]), TILE, { gabled: true })),
        scenery(wallOpenings(QX, QZ, 0.02, 0.15, 2.6, 2.4, 26, 0.06)),
        scenery(wallOpenings(QX, QZ, 0.02, 0.15, 2.2, 2.8, 22, 0.06, { axis: 1 })),
        scenery(wallOpenings(QX, QZ + 0.1, 0.02, 0.15, 1.6, 1.15, 16, 0.06)),
        scenery(wallOpenings(QX, QZ + 0.1, 0.02, 0.15, 1.0, 1.75, 10, 0.06, { axis: 1 })),
        // corner pavilions of the outer ring
        scenery(blocks([-1, 1].flatMap((sx) => [-1, 1].map((sz) => [QX + sx * 1.25, QZ + sz * 1.05, 0.36, 0.36, -0.1, 0.3])), SAND)),
        scenery(blocks([-1, 1].flatMap((sx) => [-1, 1].map((sz) => [QX + sx * 1.25, QZ + sz * 1.05, 0.4, 0.4, 0.3, 0.42])), TILE, { pyramid: true })),
        // Memorial Church, on the far side of the inner court, facing up Palm Drive
        scenery(blocks([[QX, QZ + 0.62, 0.34, 0.55, -0.1, 0.34], [QX, QZ + 0.75, 0.62, 0.22, -0.1, 0.3]], SAND)),
        scenery(blocks([[QX, QZ + 0.62, 0.37, 0.57, 0.34, 0.47]], TILE, { gabled: true })),
        scenery(blocks([[QX, QZ + 0.75, 0.64, 0.24, 0.3, 0.4]], TILE, { gabled: 'x' })),
        scenery(blocks([[QX, QZ + 0.75, 0.2, 0.2, 0.4, 0.5]], TILE, { pyramid: true })),
        scenery(blocks([[QX, QZ + 0.342, 0.3, 0.006, 0.2, 0.34]], MOSAIC)),
        scenery(blocks([[QX, QZ + 0.339, 0.26, 0.004, 0.345, 0.44]], MOSAIC, { gabled: true })),
        scenery(wallOpenings(QX, QZ + 0.62, 0.02, 0.16, 0.28, 0.564, 3, 0.06, { sides: -1 })),
      )
      return p
    }
    case 'legion': {
      // Legion of Honor: a closed square round the Court of Honor, after the Paris original. The front (+z) is an open screen
      // of paired columns between two blank end pavilions, broken by the triumphal arch (a real opening: the portico shows
      // through it); colonnades line the court; the main block at the back has a six-column pedimented portico and a raised,
      // skylit centre with a small dome; the glass pyramid and The Thinker stand in the court. The city's survey has no
      // footprint here, so the size (1.1x of ~105 m by 118 m) and the axis (parallel to Legion of Honor Drive) are read off the roads.
      const LIME = '#ebe4d2', PANEL = '#d8cfba', COLUMN = '#f4efe2', ROOF = '#b7c3bd', PAVING = '#d9d3c4', BRONZE = '#4f4a40'
      const W = 1.15, ZB = -0.65, ZF = 0.65, SUNK = -0.2, EAVE = 0.25
      const wing = 0.28, xw = W / 2 - wing / 2, zs = 0.575 // wing width and centre line; the front screen's line
      const p: Part[] = [{ ...box(0, SUNK, EAVE + 0.02, 0, W, ZF - ZB, LIME), hullOnly: true }]
      const d = (q: Part): Part => ({ ...q, detail: true })
      p.push(
        // court floor, side wings, main block, its raised centre, end pavilions
        d(box(0, SUNK, 0.03, 0.1, W - 2 * wing, 1.1, PAVING)),
        d(blocks([[-xw, -0.075, wing, 1.15, SUNK, EAVE], [xw, -0.075, wing, 1.15, SUNK, EAVE], [0, -0.475, W, 0.35, SUNK, EAVE + 0.02]], LIME)),
        d(blocks([[-xw, 0.575, wing + 0.03, 0.15, SUNK, EAVE + 0.025], [xw, 0.575, wing + 0.03, 0.15, SUNK, EAVE + 0.025], [0, -0.43, 0.4, 0.46, SUNK, 0.33]], LIME)),
        // skylit roofs, a hair inside the parapets
        d(blocks([[-xw, -0.1, wing - 0.07, 1.05, EAVE, EAVE + 0.03], [xw, -0.1, wing - 0.07, 1.05, EAVE, EAVE + 0.03], [-0.39, -0.475, 0.3, 0.27, EAVE + 0.02, EAVE + 0.05], [0.39, -0.475, 0.3, 0.27, EAVE + 0.02, EAVE + 0.05]], ROOF)),
        d(blocks([[0, -0.43, 0.36, 0.42, 0.33, 0.39]], ROOF, { gabled: true })),
        d(shift(drum(0.36, 0.41, 0.05, 0.05, LIME), -0.47)),
        { geo: 'sphere', pos: [0, 0.41, -0.47], scale: [0.05, 0.045, 0.05], color: ROOF, args: [1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2], detail: true },
        // blank outer walls articulated with shallow panels; a niche on each end pavilion
        { ...wallOpenings(0, -0.075, 0.05, 0.2, 1.0, W, 8, 0.07, { axis: 1, flat: true }), color: PANEL },
        { ...wallOpenings(0, 0, 0.05, 0.2, 0.95, ZF - ZB, 9, 0.065, { sides: -1, flat: true }), color: PANEL },
        wallOpenings(-xw, 0, 0.04, 0.2, 0.12, 2 * ZF, 1, 0.08, { sides: 1 }),
        wallOpenings(xw, 0, 0.04, 0.2, 0.12, 2 * ZF, 1, 0.08, { sides: 1 }),
      )
      // the triumphal arch in the middle of the front screen
      p.push(
        { geo: 'archwall', pos: [0, (SUNK + 0.34) / 2, zs], scale: [0.24, 0.34 - SUNK, 0.13], color: LIME, detail: true, args: [r4(0.12 / 0.24), r4((0.26 - SUNK) / (0.34 - SUNK)), r4(0.06 / (0.34 - SUNK))] },
        d(box(0, 0.34, 0.365, zs, 0.27, 0.16, LIME)),
      )
      // columns: the front screen (two rows each side of the arch), the court colonnades, the portico
      const cols: [number, number][] = []
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) for (const dz of [-0.03, 0.03]) cols.push([side * (0.155 + i * 0.032), zs + dz])
        for (let i = 0; i < 15; i++) cols.push([side * (xw - wing / 2 - 0.04), -0.26 + i * 0.052])
        for (let i = 0; i < 2; i++) cols.push([side * (0.2 + i * 0.05), -0.26])
      }
      p.push(columns(cols, 0.03, 0.21, 0.011, COLUMN))
      p.push(columns([-0.14, -0.084, -0.028, 0.028, 0.084, 0.14].map((x) => [x, -0.165]), 0.03, 0.25, 0.013, COLUMN))
      p.push(
        // entablatures over them, and the portico's pediment
        d(blocks([[-0.225, zs, 0.2, 0.1, 0.21, 0.255], [0.225, zs, 0.2, 0.1, 0.21, 0.255], [-(xw - wing / 2 - 0.035), 0.1, 0.07, 0.8, 0.21, 0.245], [xw - wing / 2 - 0.035, 0.1, 0.07, 0.8, 0.21, 0.245], [0, -0.265, 0.62, 0.05, 0.21, 0.245], [0, -0.185, 0.34, 0.09, 0.25, 0.285]], LIME)),
        d(blocks([[0, -0.185, 0.34, 0.09, 0.285, 0.335]], LIME, { gabled: true })),
        wallOpenings(0, -0.43, 0.04, 0.19, 0.2, 0.46, 3, 0.04, { sides: 1 }),
        // glass pyramid and The Thinker
        d(blocks([[0, 0.02, 0.1, 0.1, 0.03, 0.09]], '#9fc3d2', { pyramid: true })),
        d(box(0, 0.03, 0.06, 0.3, 0.03, 0.03, LIME)),
        { geo: 'sphere', pos: [0, 0.075, 0.3], scale: [0.013, 0.017, 0.013], color: BRONZE, detail: true },
      )
      return p
    }
    case 'wharf': {
      // Fisherman's Wharf & Pier 39 as a diorama. The pier is true to the city's footprints (local -z runs out into the bay,
      // origin mid-pier, deck 100 m by 280 m): two rows of gabled, weathered-paint shops either side of a boardwalk, the
      // carousel in its plaza, the PIER 39 gateway with its crab. Around it, all `detail` so the pipeline's clearing stays
      // the size of the pier: both marinas behind their breakwaters with a few hundred berthed boats, the fishing fleet, the
      // sea lions on their floats off the west side, and (pulled in from Taylor St, 450 m west, and drawn big) the ship's-wheel
      // Fisherman's Wharf sign and the SkyStar wheel.
      const DECK = '#b39a72', ROOFS = '#857f73', CONCRETE_ = '#cfcabd', DOCK = '#c9bea6', WHITE = '#f4f2ec', STEEL = '#eceae4'
      const PAINT = ['#8fa9b8', '#d7c9a8', '#b5735a', '#a9bfae', '#c9b28a']
      const Z0 = -1.47, Z1 = 1.35, TOP = 0.07
      const p: Part[] = [box(0, -0.12, TOP, (Z0 + Z1) / 2, 1.0, Z1 - Z0, DECK)]
      // shops: [from, to] along the pier, skipping the carousel's plaza
      const runs = [[1.3, 0.95], [0.9, 0.5], [0.45, 0.15], [0.1, -0.25], [-0.3, -0.62], [-0.98, -1.2], [-1.23, -1.42]]
      const walls: number[][][] = PAINT.map(() => []), roofs: number[][] = []
      runs.forEach(([a, b], i) => {
        for (const side of [-1, 1]) {
          const k = i * 2 + (side + 1) / 2, h = 0.22 + ((k * 7) % 4) * 0.025, w = 0.38 - ((k * 3) % 3) * 0.03
          const x = side * (0.08 + w / 2)
          walls[(k * 2 + (side + 1)) % PAINT.length].push([x, (a + b) / 2, w, a - b, TOP, TOP + h])
          roofs.push([x, (a + b) / 2, w + 0.01, a - b + 0.01, TOP + h, TOP + h + 0.07])
        }
      })
      // (detail: packed this tightly, each shop's hover hull would smear over its neighbours' roofs; one hull-only box outlines them all)
      p.push({ ...box(0, TOP, TOP + 0.27, -0.06, 0.94, 2.72, DECK), hullOnly: true })
      walls.forEach((list, i) => list.length && p.push(blocks(list, PAINT[i], { detail: true })))
      p.push(blocks(roofs, ROOFS, { gabled: true, detail: true }))
      // carousel
      p.push(shift(drum(TOP, TOP + 0.09, 0.085, 0.085, '#f1e6c8'), -0.8))
      p.push({ geo: 'cone', pos: [0, TOP + 0.13, -0.8], scale: [0.24, 0.08, 0.24], color: RED, args: [0.5, 12] })
      // the gateway: two posts, the blue board, and the crab on top
      const zGate = 1.38
      p.push(
        box(-0.21, 0, 0.36, zGate, 0.028, 0.028, '#4a4a4a', true),
        box(0.21, 0, 0.36, zGate, 0.028, 0.028, '#4a4a4a', true),
        box(0, 0.28, 0.39, zGate, 0.5, 0.035, '#2f6ea5', true),
        { geo: 'sphere', pos: [0, 0.42, zGate], scale: [0.055, 0.032, 0.035], color: RED, detail: true },
        { geo: 'sphere', pos: [-0.06, 0.455, zGate], scale: [0.02, 0.02, 0.02], color: RED, detail: true },
        { geo: 'sphere', pos: [0.06, 0.455, zGate], scale: [0.02, 0.02, 0.02], color: RED, detail: true },
      )
      // marinas: long docks square to the pier, boats nose-in on both sides of each, breakwaters round the outside
      const docks: number[][] = [], hulls: number[][][] = [[], []], masts: [number, number][] = []
      const marina = (x0: number, x1: number, zs: number[], seed: number) => zs.forEach((z, d) => {
        docks.push([(x0 + x1) / 2, z, Math.abs(x1 - x0), 0.028, 0, 0.03])
        const n = Math.floor((Math.abs(x1 - x0) - 0.1) / 0.085)
        for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
          const k = i * 7 + d * 3 + side + seed
          if (k % 5 === 0) continue // an empty berth
          const len = 0.085 + (k % 3) * 0.02, x = Math.min(x0, x1) + 0.08 + i * 0.085, zb = z + side * (0.02 + len / 2)
          hulls[k % 4 === 1 ? 1 : 0].push([x, zb, 0.032, len, 0, 0.035])
          if (k % 3 === 0) masts.push([x, zb])
        }
      })
      marina(0.56, 1.95, [-1.1, -0.6, -0.1, 0.4, 0.85], 0)
      marina(-0.56, -1.3, [-0.3, 0.15], 2)
      p.push(
        blocks(docks, DOCK, { detail: true }),
        blocks(hulls[0], WHITE, { detail: true }),
        blocks(hulls[1], '#9fb9cf', { detail: true }),
        columns(masts, 0.03, 0.17, 0.004, STEEL),
        blocks([[1.4, -1.5, 1.45, 0.05, -0.05, 0.06], [2.1, -0.45, 0.05, 2.15, -0.05, 0.06], [-1.4, -0.25, 0.05, 1.85, -0.05, 0.06], [-1.07, -1.15, 0.7, 0.05, -0.05, 0.06]], CONCRETE_, { detail: true }),
      )
      // the fishing fleet on the inner west dock: painted hulls, white wheelhouses
      const fleet: number[][][] = [[], []], cabins: number[][] = []
      for (let i = 0; i < 7; i++) {
        const x = -0.64 - i * 0.1
        fleet[i % 2].push([x, 0.68, 0.05, 0.15, 0, 0.05])
        cabins.push([x, 0.71, 0.036, 0.055, 0.05, 0.09])
      }
      p.push(
        blocks([[-0.95, 0.58, 0.8, 0.028, 0, 0.03]], DOCK, { detail: true }),
        blocks(fleet[0], '#3f6fb0', { detail: true }),
        blocks(fleet[1], '#2f8f5b', { detail: true }),
        blocks(cabins, WHITE, { detail: true }),
      )
      // sea lions hauled out on their floats
      const floats: number[][] = []
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) floats.push([-0.66 - i * 0.13, -0.62 - j * 0.1, 0.11, 0.075, 0, 0.025])
      p.push(blocks(floats, '#b89b6e', { detail: true }))
      ;[[0, 0, 0.3], [0, 1, 1.2], [1, 0, 2.0], [1, 2, 0.6], [2, 1, 2.6], [2, 2, 1.7], [0, 2, 0.9]].forEach(([i, j, turn], n) =>
        p.push({ geo: 'sphere', pos: [-0.66 - i * 0.13, 0.043, -0.62 - j * 0.1], rot: [0, turn, 0], scale: [0.024, 0.02, 0.044], color: n % 2 ? '#7d6a58' : '#6b5b4b', detail: true }))
      // the Fisherman's Wharf sign: a ship's wheel round a disc with the crab, on a pole
      const sx = -0.74, sz = 1.43, sy = 0.56
      p.push(
        box(sx, 0, sy - 0.12, sz, 0.03, 0.03, '#4a4a4a', true),
        { geo: 'ring', pos: [sx, sy, sz], scale: [0.125, 0.125, 0.1], color: '#8a5a3c', detail: true },
        { geo: 'cyl', pos: [sx, sy, sz], rot: [Math.PI / 2, 0, 0], scale: [0.23, 0.02, 0.23], color: '#f3ead2', detail: true, args: [0.5, 0.5, 24] },
        { geo: 'sphere', pos: [sx, sy, sz], scale: [0.05, 0.034, 0.018], color: RED, detail: true },
      )
      // the SkyStar observation wheel on the promenade west of the pier
      const wx = -1.02, wz = 1.2, R = 0.36, wy = 0.08 + R + 0.04
      p.push(
        box(wx, 0, 0.08, wz, 0.62, 0.2, CONCRETE_, true),
        { geo: 'ring', pos: [wx, wy, wz], scale: [R, R, R * 0.45], color: STEEL, detail: true },
        { geo: 'cyl', pos: [wx, wy, wz], rot: [Math.PI / 2, 0, 0], scale: [0.07, 0.12, 0.07], color: STEEL, detail: true, args: [0.5, 0.5, 12] },
      )
      for (let k = 0; k < 4; k++) p.push({ geo: 'box', pos: [wx, wy, wz], rot: [0, 0, (k * Math.PI) / 4], scale: [0.012, 2 * R, 0.012], color: STEEL, detail: true })
      const lean = Math.atan2(0.22, wy), leg = Math.hypot(0.22, wy)
      for (const side of [-1, 1]) for (const zz of [-0.06, 0.06]) p.push({ geo: 'box', pos: [wx + side * 0.11, wy / 2, wz + zz], rot: [0, 0, side * lean], scale: [0.02, leg, 0.02], color: STEEL, detail: true })
      p.push(blocks(Array.from({ length: 12 }, (_, k) => [wx + R * Math.cos((k * Math.PI) / 6), wz, 0.045, 0.05, wy + R * Math.sin((k * Math.PI) / 6) - 0.05, wy + R * Math.sin((k * Math.PI) / 6) - 0.005]), '#3f6fb0', { detail: true }))
      return p
    }
    case 'lombard': {
      // Lombard Street's crooked block, Hyde down to Leavenworth: the real switchbacks (OSM way 402111597, in this frame) drawn
      // 1.8x in plan, or the 13 m swings would vanish; a red-brick road snaking down terraced beds of hedge and hydrangeas, the
      // stairs on both sides, and the houses that line the block (`scenery`: they replace the real ones the clearing takes, but
      // the hover box and label stay on the street). The terrain falls ~0.36 units per unit east here; the model follows it.
      // lifted 15 m: the terrain mesh (a vertex every ~150 m) runs above the finer heightmap on this hill, and buried the beds
      const S = 1.8, slope = -0.36, LIFT = 0.15
      const yAt = (x: number) => slope * x + LIFT
      const ZIG: [number, number][] = [[-0.735, 0.009], [-0.649, 0.019], [-0.628, 0.016], [-0.608, 0.006], [-0.535, -0.056], [-0.512, -0.065], [-0.485, -0.063], [-0.462, -0.052], [-0.444, -0.033], [-0.395, 0.046], [-0.375, 0.061], [-0.352, 0.067], [-0.328, 0.062], [-0.308, 0.047], [-0.264, -0.033], [-0.25, -0.051], [-0.228, -0.064], [-0.201, -0.066], [-0.185, -0.061], [-0.168, -0.051], [-0.154, -0.036], [-0.108, 0.04], [-0.09, 0.056], [-0.069, 0.065], [-0.051, 0.066], [-0.027, 0.057], [-0.01, 0.04], [0.034, -0.04], [0.051, -0.056], [0.074, -0.066], [0.101, -0.064], [0.117, -0.057], [0.136, -0.04], [0.181, 0.034], [0.197, 0.051], [0.218, 0.063], [0.243, 0.066], [0.266, 0.057], [0.283, 0.04], [0.324, -0.033], [0.337, -0.051], [0.359, -0.064], [0.385, -0.066], [0.41, -0.057], [0.43, -0.04], [0.478, 0.04], [0.496, 0.056], [0.519, 0.065], [0.543, 0.064], [0.566, 0.05], [0.623, -0.013], [0.655, -0.017], [0.735, -0.009]]
      const pts = ZIG.map(([x, z]) => [x * S, z * S] as [number, number])
      const X0 = pts[0][0], X1 = pts[pts.length - 1][0]
      // the profile follows x, so sample it at every polyline vertex (s -> y)
      const cum = [0]
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
      const street = road(pts, pts.map((q, i) => [cum[i], yAt(q[0]) + 0.035] as [number, number]))
      const BRICK = '#a4533d', BED = '#6aa457', HEDGE = '#3f7d42', STEP = '#d6d0c2', SIDEWALK = '#c9c3b5'
      const bedW = 0.27, SKIRT = 0.45
      const p: Part[] = []
      // terraced beds: ten level slices down the hill, each sunk into the slope below it
      const n = 10, w = (X1 - X0) / n
      for (let i = 0; i < n; i++) {
        const xm = X0 + w * (i + 0.5), top = yAt(xm) + 0.01
        p.push(box(xm, top - SKIRT, top, 0, w + 0.004, bedW, BED))
        p.push(box(xm, top, top + 0.012, -bedW / 2 + 0.008, w, 0.016, HEDGE, true), box(xm, top, top + 0.012, bedW / 2 - 0.008, w, 0.016, HEDGE, true))
      }
      p.push(...street.deck(0, cum[cum.length - 1], 0, 0.05, 0.02, BRICK, 0, true))
      // hydrangeas on the inside of each hairpin, alternating sides
      const blooms: [number, number, string][] = []
      ZIG.forEach(([x, z], i) => {
        if (i % 3 !== 1 || Math.abs(z) < 0.05) return
        const c = ['#e58fb5', '#8f6cc4', '#7fa6dd', '#d9463d'][i % 4]
        blooms.push([x * S + 0.02, -Math.sign(z) * 0.02 + z * S * 0.4, c], [x * S - 0.03, z * S * 0.15, c])
      })
      for (const [x, z, c] of blooms) p.push({ geo: 'sphere', pos: [x, yAt(x) + 0.03, z], scale: [0.022, 0.018, 0.022], color: c, detail: true })
      // stairs down both sides of the block, and the straight street beyond each end
      const stairs: number[][] = []
      for (const side of [-1, 1]) for (let i = 0; i < 24; i++) {
        const x = X0 + ((X1 - X0) * (i + 0.5)) / 24
        stairs.push([x, side * (bedW / 2 + 0.025), (X1 - X0) / 24 + 0.002, 0.04, yAt(x) - SKIRT, yAt(x) + 0.012])
      }
      p.push(blocks(stairs, STEP, { detail: true }))
      p.push(box(X0 - 0.25, yAt(X0) - SKIRT, yAt(X0) + 0.02, 0, 0.5, bedW + 0.1, SIDEWALK, true), box(X1 + 0.25, yAt(X1) - SKIRT, yAt(X1) + 0.02, 0, 0.5, bedW + 0.1, SIDEWALK, true))
      // the houses that line it, stepping down the hill: pastel walls, flat roofs, a white bay on each
      const PAINT = ['#e9dcc4', '#c9d8e2', '#ead2c4', '#d6e2c8', '#f0e6cf', '#d9cde4', '#e6c9b8']
      const walls: number[][][] = PAINT.map(() => []), bays: number[][] = [], roofs: number[][] = []
      for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
        const w0 = (X1 - X0 + 0.5) / 9, x = X0 - 0.25 + w0 * (i + 0.5), k = i * 2 + (side + 1) / 2
        const base = yAt(x) - LIFT, h = 0.13 + ((k * 7) % 4) * 0.025, z = side * (bedW / 2 + 0.17)
        walls[k % PAINT.length].push([x, z, w0 - 0.012, 0.22, base - SKIRT, base + h])
        roofs.push([x, z, w0 - 0.004, 0.225, base + h, base + h + 0.015])
        bays.push([x, z - side * 0.115, w0 * 0.45, 0.02, base + 0.05, base + h - 0.03])
      }
      const scenery = (q: Part): Part => ({ ...q, detail: true, scenery: true })
      walls.forEach((list, i) => list.length && p.push(scenery(blocks(list, PAINT[i]))))
      p.push(scenery(blocks(roofs, '#8d877b')), scenery(blocks(bays, '#f7f4ee')))
      // one invisible box over the whole block: the hover target, and what sizes the pipeline's clearing (houses included)
      p.push({ geo: 'box', pos: [0, 0, 0], scale: [X1 - X0 + 1.0, 1.1, 2 * (bedW / 2 + 0.29)], color: '#000', hit: true })
      return p
    }
    case 'street':
      return [
        { geo: 'box', pos: [0, 0.05, 0], rot: [0, 0, 0.18], scale: [0.9, 0.1, 0.5], color: '#f7f4ee' },
        { geo: 'box', pos: [-0.3, 0.16, -0.14], scale: [0.14, 0.14, 0.14], color: '#d96c9a' },
        { geo: 'box', pos: [0.05, 0.22, 0.12], scale: [0.14, 0.14, 0.14], color: '#7f8ed0' },
        { geo: 'box', pos: [0.32, 0.27, -0.1], scale: [0.14, 0.14, 0.14], color: '#e6a94f' },
      ]
    case 'gate': {
      // The Dragon Gate at Grant and Bush, facing south (+z) down Grant Avenue: four grey stone pillars making a wide central
      // opening over the street and a narrower one over each sidewalk; a red and green painted frieze with the blue plaque; green
      // tiled roofs with upturned corners, the central one highest, two dragons chasing a gold pearl along its ridge and fish at
      // the ends; foo dogs out front; and red lanterns strung up the avenue behind (`scenery`, so the hover box stays on the
      // gate). About 2.4x true size.
      const STONE_ = '#cfcac0', TILE = '#3f8f6a', TILE_DARK = '#2c6b4e', RED_ = '#b33a2b', GOLD = '#d9b44a', BLUE = '#2f5f9e', LANTERN = '#d23b2a'
      const pw = 0.045, pz = 0.07, xc = 0.15, xs = 0.31 // pillar size; inner and outer pillar centres
      const p: Part[] = [
        blocks([-xs, -xc, xc, xs].map((x) => [x, 0, pw, pz, -0.05, x === -xc || x === xc ? 0.33 : 0.25]), STONE_),
        // friezes over each opening, and the plinths
        blocks([[0, 0, 2 * xc + pw, 0.05, 0.27, 0.33], [-(xc + xs) / 2, 0, xs - xc + pw, 0.045, 0.2, 0.25], [(xc + xs) / 2, 0, xs - xc + pw, 0.045, 0.2, 0.25]], RED_),
        blocks([[0, 0, 2 * xc + pw + 0.004, 0.052, 0.296, 0.304], [-(xc + xs) / 2, 0, xs - xc + pw + 0.004, 0.047, 0.222, 0.228], [(xc + xs) / 2, 0, xs - xc + pw + 0.004, 0.047, 0.222, 0.228]], GOLD, { detail: true }),
        blocks([-xs, -xc, xc, xs].map((x) => [x, 0, pw + 0.02, pz + 0.02, -0.05, 0.03]), STONE_, { detail: true }),
        // the plaque between the central roof and its frieze
        box(0, 0.335, 0.39, 0, 0.11, 0.058, BLUE, true),
        box(0, 0.345, 0.38, 0, 0.08, 0.06, GOLD, true),
      ]
      // roofs: a hipped body, an overhanging eave a tone darker underneath, and four upturned corner tips
      const roof = (x: number, w: number, y: number, h: number) => {
        p.push(blocks([[x, 0, w + 0.06, pz + 0.07, y, y + 0.014]], TILE_DARK))
        p.push(blocks([[x, 0, w + 0.03, pz + 0.04, y + 0.014, y + h]], TILE, { gabled: 'x' }))
        p.push(blocks([[x, 0, w - 0.04, 0.012, y + h - 0.004, y + h + 0.012]], TILE_DARK, { detail: true }))
        p.push(blocks([-1, 1].flatMap((sx) => [-1, 1].map((sz) => [x + sx * (w / 2 + 0.025), sz * (pz / 2 + 0.032), 0.014, 0.014, y + 0.008, y + 0.035])), TILE, { detail: true }))
      }
      roof(0, 2 * xc + pw, 0.39, 0.075)
      roof(-(xc + xs) / 2, xs - xc + pw, 0.255, 0.06)
      roof((xc + xs) / 2, xs - xc + pw, 0.255, 0.06)
      // dragons chasing the pearl along the central ridge, fish at the ends of the side ridges
      for (const sx of [-1, 1]) {
        p.push({ geo: 'sphere', pos: [sx * 0.065, 0.485, 0], scale: [0.04, 0.014, 0.01], color: TILE_DARK, detail: true })
        p.push({ geo: 'sphere', pos: [sx * 0.03, 0.495, 0], scale: [0.012, 0.012, 0.01], color: TILE_DARK, detail: true })
        p.push({ geo: 'sphere', pos: [sx * ((xc + xs) / 2 + 0.05), 0.33, 0], scale: [0.01, 0.018, 0.008], color: GOLD, detail: true })
      }
      p.push({ geo: 'sphere', pos: [0, 0.5, 0], scale: [0.013, 0.013, 0.013], color: GOLD, detail: true })
      // foo dogs on plinths before the inner pillars
      for (const sx of [-1, 1]) {
        p.push(box(sx * (xc + 0.04), 0, 0.05, 0.1, 0.035, 0.035, STONE_, true))
        p.push({ geo: 'sphere', pos: [sx * (xc + 0.04), 0.07, 0.1], scale: [0.016, 0.022, 0.018], color: '#b7b1a5', detail: true })
      }
      // lanterns strung across Grant Avenue going uphill behind the gate
      const scenery = (q: Part): Part => ({ ...q, detail: true, scenery: true })
      const wires: number[][] = [], lamps: [number, number][] = []
      for (let z = -0.25; z > -1.4; z -= 0.17) {
        wires.push([0, z, 0.36, 0.004, 0.3, 0.304])
        for (const x of [-0.12, -0.04, 0.04, 0.12]) lamps.push([x, z])
      }
      p.push(scenery(blocks(wires, '#4a4a4a')))
      for (const [x, z] of lamps) p.push(scenery({ geo: 'sphere', pos: [x, 0.28, z], scale: [0.014, 0.018, 0.014], color: LANTERN }))
      return p
    }
    case 'town':
      // Sausalito, the whole town (sausalito.ts), standing on the drawn terrain
      return sausalito(terrain)
    case 'cityhall':
      return cityHall().parts
    case 'ghirardelli':
      return ghirardelli().parts
    case 'cathedral':
      return graceCathedral().parts
    case 'mission':
      return missionDolores().parts
  }
}

/**
 * San Francisco City Hall (Arthur Brown Jr., 1915). Local axes are the building's: +x is the Polk Street front on Civic Center
 * Plaza, -x the matching Van Ness front, -z McAllister Street (bearing -9, the Western Addition grid, as the city's footprint
 * survey has it). A grey granite block of 124 m by 83 m: a rusticated ground floor, a giant colonnade along both long fronts
 * between corner pavilions, a cornice and an attic, skylit roofs over the two light courts. Each front has a pedimented central
 * portico, and one gabled roof runs between the two into the square base of the rotunda. On that: a stepped plinth, the drum
 * (sixteen tall windows, eight buttress piers with paired columns and a statue each), an attic of small round-headed windows,
 * the slate dome with gilded ribs (`landmarkLines`) and cartouches, the gilt lantern, and the spire, 93.7 m up. The block is
 * 1.2x true in plan; the dome and drum are 1.5x, so the height exaggeration doesn't stretch them into a bullet.
 */
const CH_DOME = { y: H(57.5) + 0.01, r: 0.222, h: H(15) }
function cityHall(): { parts: Part[]; lines: number[] } {
  const GRANITE = '#dddad2', BASE = '#cfcbc1', TRIM = '#ebe8e0', RELIEF = '#c7c2b5', ROOF = '#8f9b9b', GLASS = '#5f6e76', SLATE = '#6a737a', GOLD = '#d2a64a'
  const W = 1.0, L = 1.48, SUNK = -0.06
  const yBase = H(9), yCols = H(21.5), yCornice = H(23.5), yAttic = H(26.5), yPed = yAttic + H(6.5)
  const yRot = H(34), yDrum = H(36.5), yDrumTop = H(51), yAtticTop = H(57.5)
  const rDrum = 0.24, { y: yDome, r: rDome, h: hDome } = CH_DOME
  const yLantern = yDome + hDome - 0.01, yCupola = H(81)
  const d = (q: Part): Part => ({ ...q, detail: true })
  const wingZ = 0.405, wingLen = 0.39 // the colonnaded stretch between the portico and a corner pavilion
  // the parts list's first colour is the line colour (Landmarks.tsx), so the hover-only block carries the gilding's
  const p: Part[] = [
    { ...box(0, SUNK, yAttic + 0.02, 0, W + 0.06, L + 0.04, GOLD), hullOnly: true },
    { ...box(0, SUNK, yAttic, 0, W + 0.2, 0.44, GOLD), hullOnly: true },
    // body, rusticated ground floor, cornice band, roof and the light courts' skylights
    d(box(0, SUNK, yAttic, 0, W, L, GRANITE)),
    d(box(0, SUNK, yBase, 0, W + 0.05, L + 0.03, BASE)),
    d(box(0, yCols, yCornice, 0, W + 0.05, L + 0.03, TRIM)),
    d(box(0, yAttic - 0.01, yAttic + 0.012, 0, W + 0.03, L + 0.02, TRIM)),
    d(box(0, yAttic, yAttic + 0.02, 0, W - 0.08, L - 0.08, ROOF)),
    d(blocks([[-0.3, 0, 0.2, L - 0.3, yAttic, yAttic + 0.05], [0.3, 0, 0.2, L - 0.3, yAttic, yAttic + 0.05]], ROOF, { gabled: true })),
    d(blocks([[0, -wingZ - 0.02, 0.36, 0.3, yAttic, yAttic + 0.06], [0, wingZ + 0.02, 0.36, 0.3, yAttic, yAttic + 0.06]], GLASS, { gabled: 'x' })),
    // corner pavilions, standing a little proud of both faces and above the attic, each with a tall arched window
    d(blocks([-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * (W / 2 - 0.06), sz * (L / 2 - 0.07), 0.16, 0.18, SUNK, yAttic + 0.025])), GRANITE)),
    d(blocks([-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * (W / 2 - 0.06), sz * (L / 2 - 0.07), 0.18, 0.2, yAttic + 0.025, yAttic + 0.04])), TRIM)),
  ]
  for (const sz of [-1, 1]) {
    p.push(
      wallOpenings(0, sz * (L / 2 - 0.07), yBase + 0.03, yCols - 0.02, 0.1, W + 0.04, 1, 0.07, { axis: 1 }),
      // the colonnaded wings: windows on two storeys behind the columns, square ones in the base and the attic
      wallOpenings(0, sz * wingZ, yBase + 0.02, yCols - 0.01, wingLen, W, 8, 0.022, { axis: 1, rows: 2, flat: true }),
      wallOpenings(0, sz * wingZ, 0.03, yBase - 0.04, wingLen, W + 0.05, 8, 0.024, { axis: 1, flat: true }),
      wallOpenings(0, sz * wingZ, yCornice + 0.015, yAttic - 0.02, wingLen, W, 8, 0.02, { axis: 1, flat: true }),
    )
  }
  for (const sx of [-1, 1]) p.push(wallOpenings(sx * (W / 2 - 0.06), 0, yBase + 0.03, yCols - 0.02, 0.1, L + 0.04, 1, 0.07))
  // the McAllister and Grove ends: a shallow centre pavilion and three storeys of windows either side of it
  p.push(
    d(box(0, SUNK, yAttic + 0.015, 0, 0.3, L + 0.05, GRANITE)),
    wallOpenings(0, 0, 0.03, yBase - 0.04, W - 0.34, L + 0.03, 12, 0.024, { flat: true }),
    wallOpenings(0, 0, yBase + 0.02, yAttic - 0.02, W - 0.34, L, 12, 0.022, { rows: 3, flat: true }),
    wallOpenings(0, 0, 0.03, yCols - 0.04, 0.2, L + 0.05, 3, 0.04, {}),
  )
  // the giant order on both long fronts, standing on the base in front of the wall
  const cols: [number, number][] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 9; i++) cols.push([sx * (W / 2 + 0.014), sz * (wingZ - wingLen / 2 + (wingLen * (i + 0.5)) / 9)])
  p.push(columns(cols, yBase, yCols, 0.011, TRIM))
  // the porticos: a rusticated base with three arched doors, solid end piers, six columns, entablature, and the pediment
  // with its relief, as one gabled roof run through the building so its triangle shows on both fronts
  const portico: [number, number][] = []
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) portico.push([sx * (W / 2 + 0.075), -0.13 + i * 0.052])
  p.push(
    d(box(0, SUNK, yBase, 0, W + 0.18, 0.42, BASE)),
    wallOpenings(0, 0, 0.02, yBase - 0.02, 0.24, W + 0.18, 3, 0.05, { axis: 1 }),
    d(blocks([-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * (W / 2 + 0.045), sz * 0.185, 0.09, 0.05, yBase, yCornice])), GRANITE)),
    columns(portico, yBase, yCornice, 0.013, TRIM),
    wallOpenings(0, 0, yBase + 0.03, yCornice - 0.02, 0.26, W + 0.004, 5, 0.03, { axis: 1, rows: 2, flat: true }),
    d(box(0, yCornice, yAttic, 0, W + 0.19, 0.43, TRIM)),
    { ...blocks([[0, 0, W + 0.2, 0.44, yAttic, yPed]], GRANITE, { gabled: 'x' }) },
    d(blocks([[0, 0, W + 0.204, 0.34, yAttic + 0.015, yPed - 0.03]], RELIEF, { gabled: 'x' })),
  )
  // the rotunda's square base and the stepped plinth with its balustrade
  p.push(
    box(0, yAttic - 0.1, yRot, 0, 0.56, 0.56, GRANITE),
    d(box(0, yRot - 0.012, yRot + 0.004, 0, 0.58, 0.58, TRIM)),
    drum(yRot, yDrum - 0.02, 0.3, 0.29, TRIM),
    d(drum(yDrum - 0.02, yDrum, 0.27, 0.27, GRANITE)),
  )
  // the drum: bays of two windows between the buttress piers, each pier faced with a pair of columns and crowned by a statue
  const deg = Math.PI / 180
  p.push(
    drum(yDrum, yDrumTop, rDrum, rDrum, GRANITE),
    drumOpenings(yDrum + 0.04, yDrumTop - 0.05, rDrum, 0.042, 2, true),
    d(drum(yDrumTop - 0.015, yDrumTop + 0.02, rDrum + 0.025, rDrum + 0.025, TRIM)),
    drum(yDrumTop + 0.02, yAtticTop, rDome + 0.008, rDome + 0.004, GRANITE),
    drumOpenings(yDrumTop + 0.035, yAtticTop - 0.02, rDome + 0.008, 0.026, 2),
    d(drum(yAtticTop - 0.008, yDome, rDome + 0.014, rDome + 0.014, TRIM)),
  )
  const pairs: [number, number][] = []
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + 45 * k) * deg
    p.push(d({ geo: 'box', pos: [Math.cos(a) * (rDrum + 0.01), (yDrum + yDrumTop) / 2, Math.sin(a) * (rDrum + 0.01)], rot: [0, -a, 0], scale: [0.05, yDrumTop - yDrum, 0.07], color: GRANITE }))
    for (const s of [-1, 1]) pairs.push([Math.cos(a + (s * 0.024) / rDrum) * (rDrum + 0.04), Math.sin(a + (s * 0.024) / rDrum) * (rDrum + 0.04)])
    p.push(d({ geo: 'cone', pos: [Math.cos(a) * (rDrum + 0.02), yDrumTop + 0.06, Math.sin(a) * (rDrum + 0.02)], scale: [0.04, 0.08, 0.04], color: TRIM, args: [0.5, 6] }))
  }
  p.push(columns(pairs, yDrum, yDrumTop - 0.015, 0.011, TRIM))
  // the dome, its gilded cartouches between the ribs, the iron ring at its crown, the gilt lantern, the cupola and the spire
  p.push({ geo: 'sphere', pos: [0, yDome, 0], scale: [rDome, hDome, rDome], color: SLATE, args: [1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2] })
  for (let k = 0; k < 8; k++) {
    const a = (11.25 + 45 * k) * deg, t = 0.62, rr = rDome * Math.sqrt(1 - t * t) + 0.006
    p.push({ geo: 'sphere', pos: [Math.cos(a) * rr, yDome + hDome * t, Math.sin(a) * rr], scale: [0.022, 0.03, 0.022], color: GOLD, detail: true, args: [1, 8, 6] })
  }
  p.push(
    d(drum(yLantern - 0.01, yLantern + 0.012, 0.08, 0.08, SHADE)),
    drum(yLantern + 0.012, yCupola, 0.058, 0.054, TRIM),
    { ...drumOpenings(yLantern + 0.03, yCupola - 0.02, 0.058, 0.022), color: SHADE },
    columns(Array.from({ length: 8 }, (_, k) => [Math.cos((22.5 + 45 * k) * deg) * 0.066, Math.sin((22.5 + 45 * k) * deg) * 0.066] as [number, number]), yLantern + 0.012, yCupola, 0.008, GOLD),
    d(drum(yCupola - 0.004, yCupola + 0.012, 0.072, 0.072, GOLD)),
    { geo: 'sphere', pos: [0, yCupola + 0.012, 0], scale: [0.05, 0.05, 0.05], color: SLATE, detail: true, args: [1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2] },
    d(drum(yCupola + 0.055, yCupola + 0.085, 0.022, 0.018, GOLD)),
    { geo: 'cone', pos: [0, (yCupola + 0.085 + H(92.5)) / 2, 0], scale: [0.032, H(92.5) - yCupola - 0.085, 0.032], color: SLATE, detail: true, args: [0.5, 8] },
    { geo: 'sphere', pos: [0, H(92.5), 0], scale: [0.012, 0.012, 0.012], color: GOLD, detail: true, args: [1, 8, 6] },
  )
  // gilded ribs down the dome and the garland round its foot, a hair proud of the surface
  const lines: number[] = []
  const onDome = (a: number, t: number): [number, number, number] => {
    const rr = rDome * Math.sqrt(1 - t * t) * 1.012
    return [Math.cos(a) * rr, yDome + hDome * t * 1.012, Math.sin(a) * rr]
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    for (let i = 0; i < 10; i++) seg(lines, onDome(a, (i / 10) * 0.95), onDome(a, ((i + 1) / 10) * 0.95))
  }
  for (const t of [0.04, 0.9]) for (let k = 0; k < 32; k++) seg(lines, onDome((k / 32) * Math.PI * 2, t), onDome(((k + 1) / 32) * Math.PI * 2, t))
  return { parts: p, lines }
}

/**
 * Ghirardelli Square: the chocolate factory's red-brick ring round its terraced plaza, on the block between North Point St
 * (+z, uphill) and Beach St (-z, by the bay), Larkin (+x) and Polk (-x), bearing -9. Every building is its OSM outline at true
 * size (origin mid-block): along North Point the Chocolate and Cocoa buildings (five storeys) and the lower Mustard building,
 * the 1916 Clock Tower building on the Larkin corner with its Blois-style tower (white stone quoins, four clocks, corner
 * turrets, a steep slate roof with dormers), the Apartment and Carousel buildings down Larkin (the glass octagon on its
 * corner), Wurster's tile-roofed, glazed building along Beach, the Power House and the skewed 1860s Woolen Mill on Polk. In the
 * middle, brick paving over the one-storey Plaza and Infill buildings, trees and Ruth Asawa's mermaid fountain. On the roofs
 * of Cocoa and Mustard, facing the bay, the white GHIRARDELLI letters (`strokes`) on their steel lattice (`landmarkLines`).
 * The ground falls ~11 m to Beach St, so each building stands on its own slice of the slope.
 */
function ghirardelli(): { parts: Part[]; lines: number[] } {
  const BRICK = '#a9553f', BRICK2 = '#b9684d', DARK = '#91483a', TRIM = '#efe8da', ROOF = '#8f8a83', TILE = '#b5573a', COPPER = '#7fa596',
    GLASS = '#86a2ab', PAVING = '#b9705a', SLATE = '#5c6570', LEAF = '#6c9a55', SIGN = '#f6f3ea', STEEL = '#8d9396', BRONZE = '#5b5040', WATER = '#74add0'
  const K = 0.2 // ground rise per unit towards North Point
  const d0 = asDetail
  const g = (z: number) => K * z
  /** a building on the slope: [x0, x1, z0 (north), z1, height in m] -> its box, standing below the downhill edge, measured from its middle */
  const top = (z0: number, z1: number, h: number) => g((z0 + z1) / 2) + H(h)
  const foot = (z0: number) => g(z0) - 0.12
  const bld = (x0: number, x1: number, z0: number, z1: number, h: number, color: string) =>
    box((x0 + x1) / 2, foot(z0), top(z0, z1, h), (z0 + z1) / 2, x1 - x0, z1 - z0, color, true)
  /** windows on the faces of a building: `faces` from n, s, e, w; rows of square-headed openings from its mid-ground to the eaves */
  const windows = (x0: number, x1: number, z0: number, z1: number, h: number, rows: number, faces: string, from = g((z0 + z1) / 2) + 0.03): Part[] => {
    const y1 = top(z0, z1, h) - 0.03, out: Part[] = []
    const ns = faces.includes('n') && faces.includes('s') ? 0 : faces.includes('n') ? -1 : faces.includes('s') ? 1 : null
    const ew = faces.includes('e') && faces.includes('w') ? 0 : faces.includes('w') ? -1 : faces.includes('e') ? 1 : null
    if (ns !== null) out.push(wallOpenings((x0 + x1) / 2, (z0 + z1) / 2, from, y1, x1 - x0 - 0.03, z1 - z0, Math.max(1, Math.floor((x1 - x0) / 0.042)), 0.018, { rows, sides: ns, flat: true }))
    if (ew !== null) out.push(wallOpenings((x0 + x1) / 2, (z0 + z1) / 2, from, y1, z1 - z0 - 0.03, x1 - x0, Math.max(1, Math.floor((z1 - z0) / 0.042)), 0.018, { rows, axis: 1, sides: ew, flat: true }))
    return out
  }
  // a white cornice band round the eaves, and the tar roof inside it
  const cornice = (x0: number, x1: number, z0: number, z1: number, h: number) => blocks([
    [(x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 0.012, z1 - z0 + 0.012, top(z0, z1, h) - 0.012, top(z0, z1, h) + 0.006],
  ], TRIM, { detail: true })
  const roof = (x0: number, x1: number, z0: number, z1: number, h: number) =>
    box((x0 + x1) / 2, top(z0, z1, h) + 0.006, top(z0, z1, h) + 0.008, (z0 + z1) / 2, x1 - x0 - 0.008, z1 - z0 - 0.008, ROOF, true)
  const eaves = (x0: number, x1: number, z0: number, z1: number, h: number) => [cornice(x0, x1, z0, z1, h), roof(x0, x1, z0, z1, h)]
  const ring = (x0: number, x1: number, z0: number, z1: number, h: number, extra = 0): Part =>
    ({ ...box((x0 + x1) / 2, foot(z0), top(z0, z1, h) + extra, (z0 + z1) / 2, x1 - x0, z1 - z0, STEEL), hullOnly: true })

  // the tower and the sign set the hover outline's skyline; the rest of the ring is a few plain boxes. The first part's colour
  // is the line colour (Landmarks.tsx): the sign's lattice
  const TX = 0.545, TZ = 0.37, TW = 0.11, yRoofCT = top(0.165, 0.425, 16)
  const yShaft = g(TZ) + H(27), yRoof = g(TZ) + H(36)
  const p: Part[] = [
    ring(-0.623, 0.6, 0.088, 0.428, 22),
    ring(-0.631, -0.17, -0.408, 0.088, 12),
    ring(-0.184, 0.479, -0.427, -0.184, 10, 0.05),
    ring(0.456, 0.631, -0.304, 0.049, 12),
    { ...box(TX, yRoofCT, yRoof, TZ, TW, TW, STEEL), hullOnly: true },
  ]

  // along North Point: Chocolate, Cocoa (its lower north wing carries half the sign), Mustard, the Clock Tower building
  p.push(
    bld(-0.623, -0.463, 0.088, 0.428, 22, DARK), ...eaves(-0.623, -0.463, 0.088, 0.428, 22),
    ...windows(-0.623, -0.463, 0.088, 0.428, 22, 5, 'nsw'),
    bld(-0.464, 0, 0.21, 0.426, 22, BRICK), ...eaves(-0.464, 0, 0.21, 0.426, 22),
    ...windows(-0.464, 0, 0.21, 0.426, 22, 5, 's'),
    ...windows(-0.464, 0, 0.21, 0.426, 22, 2, 'n', top(0.13, 0.21, 13) + 0.02),
    bld(-0.43, 0, 0.13, 0.21, 13, BRICK), ...eaves(-0.43, 0, 0.13, 0.21, 13),
    ...windows(-0.43, 0, 0.13, 0.21, 13, 3, 'n'),
    bld(0, 0.4, 0.222, 0.424, 13, BRICK2), ...eaves(0, 0.4, 0.222, 0.424, 13),
    ...windows(0, 0.4, 0.222, 0.424, 13, 3, 'ns'),
    bld(0.399, 0.6, 0.165, 0.425, 16, BRICK2), ...eaves(0.399, 0.6, 0.165, 0.425, 16),
    ...windows(0.399, 0.6, 0.165, 0.425, 16, 4, 'nsew'),
    // the strip of shops in front of the Clock Tower building
    bld(0.424, 0.504, 0.127, 0.166, 4, BRICK2),
  )
  // down Larkin: the Apartment building, then the Carousel building with its glass octagon and copper cap
  p.push(
    bld(0.456, 0.631, -0.086, 0.049, 12, BRICK), ...eaves(0.456, 0.631, -0.086, 0.049, 12),
    ...windows(0.456, 0.631, -0.086, 0.049, 12, 3, 'ew'),
    bld(0.456, 0.631, -0.304, -0.086, 9, BRICK2), ...eaves(0.456, 0.631, -0.304, -0.086, 9),
    ...windows(0.456, 0.631, -0.304, -0.086, 9, 2, 'new'),
  )
  const yOct = top(-0.304, -0.086, 9)
  p.push(
    d0(at(prism(0, yOct, yOct + H(5), 0.075, 8, GLASS), 0.5, -0.24)),
    d0(at(prism(0, yOct + H(5), yOct + H(5) + 0.012, 0.082, 8, TRIM), 0.5, -0.24)),
    d0(at({ ...tier(0, yOct + H(5) + 0.012, yOct + H(5) + 0.06, 0.082, 0.01, COPPER, 8), args: [r4(0.01 / 0.082 / 2), 0.5, 8, 1, false, Math.PI / 8] }, 0.5, -0.24)),
  )
  // along Beach: Wurster's building, brick below a glazed storey under a hipped tile roof; the Power House on the Polk corner
  const yW = top(-0.427, -0.184, 10)
  p.push(
    bld(-0.184, 0.479, -0.427, -0.184, 7, BRICK),
    ...windows(-0.184, 0.479, -0.427, -0.184, 7, 1, 'n', g(-0.3) - 0.05),
    d0(box(0.15, yW - H(3), yW, -0.3, 0.64, 0.22, GLASS)),
    d0(blocks([[0.15, -0.3, 0.68, 0.26, yW, yW + 0.05]], TILE, { gabled: 'x' })),
    d0(blocks([[-0.16, -0.3, 0.06, 0.26, yW, yW + 0.05], [0.46, -0.3, 0.06, 0.26, yW, yW + 0.05]], TILE, { pyramid: true })),
    bld(-0.631, -0.258, -0.408, -0.326, 10, BRICK), ...eaves(-0.631, -0.258, -0.408, -0.326, 10),
    ...windows(-0.631, -0.258, -0.408, -0.326, 10, 2, 'nw'),
    bld(-0.631, -0.344, -0.326, -0.19, 10, BRICK),
    // the brick link between the Chocolate building and the Woolen Mill, on Polk
    bld(-0.629, -0.466, -0.082, 0.089, 9, DARK), ...windows(-0.629, -0.466, -0.082, 0.089, 9, 2, 'w'),
  )
  // the Woolen Mill (1861) is older than the street grid and sits skewed across the west side of the square
  const wm = { x: -0.399, z: -0.11, len: 0.433, d: 0.16, rot: 0.24 }, yWm = g(wm.z) + H(12)
  const turn = (q: Part): Part => ({ ...q, pos: [wm.x, q.pos[1], wm.z], rot: [0, wm.rot, 0] })
  p.push(
    turn(box(0, foot(-0.24), yWm, 0, wm.len, wm.d, BRICK, true)),
    turn(box(0, yWm - 0.012, yWm + 0.006, 0, wm.len + 0.012, wm.d + 0.012, TRIM, true)),
    turn(box(0, yWm + 0.006, yWm + 0.008, 0, wm.len - 0.008, wm.d - 0.008, ROOF, true)),
    turn(wallOpenings(0, 0, g(wm.z) + 0.03, yWm - 0.03, wm.len - 0.04, wm.d, 10, 0.018, { rows: 3, flat: true })),
  )

  // the plaza: brick paving on two terraces over the one-storey Plaza and Infill buildings, the fountain, and trees
  const yUp = 0.04, yLow = yUp - H(4)
  p.push(
    d0(box(-0.04, foot(-0.19), yLow, -0.115, 0.85, 0.15, PAVING)),
    d0(box(0.02, foot(-0.04), yUp, 0.105, 0.92, 0.29, PAVING)),
    d0(box(0.075, yLow - 0.05, yUp, -0.13, 0.37, 0.176, BRICK2)),
    d0(box(0.075, yUp, yUp + 0.008, -0.13, 0.37, 0.176, PAVING)),
    wallOpenings(0.075, -0.13, yLow + 0.012, yUp - 0.012, 0.34, 0.176, 8, 0.022, { sides: -1, flat: true }),
    // Andrea: a round basin with the bronze mermaids on a rock in the middle
    d0(at(drum(yUp, yUp + 0.018, 0.045, 0.045, TRIM), 0.2, 0.04)),
    d0(at(drum(yUp + 0.018, yUp + 0.02, 0.038, 0.038, WATER), 0.2, 0.04)),
    d0(at(drum(yUp + 0.02, yUp + 0.045, 0.012, 0.008, BRONZE), 0.2, 0.04)),
    { geo: 'sphere', pos: [0.2, yUp + 0.05, 0.04], scale: [0.01, 0.012, 0.01], color: BRONZE, detail: true, args: [1, 8, 6] },
  )
  const trees: [number, number, number][] = [[-0.3, 0.09, yUp], [-0.14, 0.11, yUp], [0.32, 0.03, yUp], [0.36, 0.2, yUp], [-0.3, -0.12, yLow], [-0.05, -0.12, yLow], [0.4, -0.12, yLow]]
  for (const [x, z, y] of trees) {
    p.push(d0(at(drum(y, y + 0.04, 0.006, 0.006, '#6b5a48'), x, z)))
    p.push({ geo: 'sphere', pos: [x, y + 0.065, z], scale: [0.035, 0.032, 0.035], color: LEAF, detail: true, args: [1, 8, 6] })
  }

  // the clock tower: brick shaft with white quoins, a clock on each face, a white cornice with corner turrets, a steep slate
  // roof with a dormer each side, and a spike. Plan ~1.2x true
  p.push(
    d0(box(TX, yRoofCT - 0.05, yShaft, TZ, TW, TW, BRICK2)),
    d0(blocks([-1, 1].flatMap((sx) => [-1, 1].map((sz) => [TX + sx * (TW / 2 - 0.004), TZ + sz * (TW / 2 - 0.004), 0.016, 0.016, yRoofCT, yShaft])), TRIM)),
    d0(box(TX, yShaft - 0.09, yShaft - 0.08, TZ, TW + 0.008, TW + 0.008, TRIM)),
    d0(box(TX, yShaft, yShaft + 0.022, TZ, TW + 0.016, TW + 0.016, TRIM)),
    d0(blocks([-1, 1].flatMap((sx) => [-1, 1].map((sz) => [TX + sx * (TW / 2 + 0.002), TZ + sz * (TW / 2 + 0.002), 0.026, 0.026, yShaft + 0.022, yShaft + 0.07])), TRIM)),
    d0(blocks([-1, 1].flatMap((sx) => [-1, 1].map((sz) => [TX + sx * (TW / 2 + 0.002), TZ + sz * (TW / 2 + 0.002), 0.03, 0.03, yShaft + 0.07, yShaft + 0.11])), SLATE, { pyramid: true })),
    d0(blocks([[TX, TZ, TW - 0.01, TW - 0.01, yShaft + 0.022, yRoof]], SLATE, { pyramid: true })),
    d0(blocks([[TX, TZ, 0.05, TW - 0.004, yShaft + 0.035, yShaft + 0.07], [TX, TZ, TW - 0.004, 0.05, yShaft + 0.035, yShaft + 0.07]], TRIM)),
    d0(blocks([[TX, TZ, 0.056, TW + 0.002, yShaft + 0.07, yShaft + 0.1]], SLATE, { gabled: true })),
    d0(blocks([[TX, TZ, TW + 0.002, 0.056, yShaft + 0.07, yShaft + 0.1]], SLATE, { gabled: 'x' })),
    d0(box(TX, yRoof - 0.01, yRoof + 0.07, TZ, 0.006, 0.006, SHADE)),
    wallOpenings(TX, TZ, yRoofCT + 0.02, yShaft - 0.13, 0.05, TW, 1, 0.03, {}),
    wallOpenings(TX, TZ, yRoofCT + 0.02, yShaft - 0.13, 0.05, TW, 1, 0.03, { axis: 1 }),
    wallOpenings(TX, TZ, yShaft + 0.04, yShaft + 0.065, 0.03, TW + 0.006, 1, 0.016, {}),
    wallOpenings(TX, TZ, yShaft + 0.04, yShaft + 0.065, 0.03, TW + 0.006, 1, 0.016, { axis: 1 }),
  )
  const yClock = yShaft - 0.035
  const hand = (len: number, deg: number, axis: 0 | 1): Part => {
    const a = (deg * Math.PI) / 180, u = (-Math.sin(a) * len) / 2, v = (Math.cos(a) * len) / 2
    return axis
      ? { geo: 'box', pos: [TX, yClock + v, TZ - u], rot: [a, 0, 0], scale: [TW + 0.014, len, 0.005], color: SHADE, detail: true }
      : { geo: 'box', pos: [TX + u, yClock + v, TZ], rot: [0, 0, a], scale: [0.005, len, TW + 0.014], color: SHADE, detail: true }
  }
  for (const axis of [0, 1] as const) {
    const rot: [number, number, number] = axis ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]
    p.push({ geo: 'cyl', pos: [TX, yClock, TZ], rot, scale: [0.07, TW + 0.006, 0.07], color: TRIM, args: [0.5, 0.5, 20], detail: true })
    p.push({ geo: 'cyl', pos: [TX, yClock, TZ], rot, scale: [0.056, TW + 0.01, 0.056], color: '#f7f1df', args: [0.5, 0.5, 20], detail: true })
    p.push(hand(0.024, -60, axis), hand(0.018, 60, axis))
  }

  // the sign: GHIRARDELLI in white letters along the line where Cocoa meets Mustard, facing the bay, on a steel lattice that
  // stands on both roofs (Cocoa's high, Mustard's low)
  const ZS = 0.27, yBase = 0.52, em = 0.105
  const roofAt = (x: number) => (x < 0 ? top(0.21, 0.426, 22) : top(0.222, 0.424, 13))
  const text = signText('Ghirardelli', em, -0.1, yBase)
  p.push(strokes(text.segs, 0.02, 0.012, ZS - 0.006, SIGN))
  const lines: number[] = []
  const posts = Math.round((text.x1 - text.x0) / 0.036)
  for (const z of [ZS, ZS + 0.025]) {
    for (let i = 0; i <= posts; i++) {
      const x = text.x0 + ((text.x1 - text.x0) * i) / posts
      seg(lines, [x, roofAt(x), z], [x, yBase + 0.02, z])
      if (z === ZS) seg(lines, [x, yBase, ZS], [x, yBase, ZS + 0.025])
      if (i === posts) break
      // cross-braced panels from the top rail down to the roof under this bay
      const xb = text.x0 + ((text.x1 - text.x0) * (i + 1)) / posts, w = xb - x, low = Math.max(roofAt(x), roofAt(xb))
      for (let y = yBase; y - w > low - 1e-6; y -= w) { seg(lines, [x, y, z], [xb, y - w, z]); seg(lines, [xb, y, z], [x, y - w, z]) }
    }
    seg(lines, [text.x0, yBase, z], [text.x1, yBase, z])
    seg(lines, [text.x0, yBase + 0.02, z], [text.x1, yBase + 0.02, z])
  }
  p.push({ ...box((text.x0 + text.x1) / 2, top(0.222, 0.424, 13), yBase + em * 1.05, ZS + 0.01, text.x1 - text.x0, 0.03, STEEL), hullOnly: true })
  return { parts: p, lines }
}

/**
 * Grace Cathedral on Nob Hill (Lewis Hobart, 1928-1964): French Gothic in concrete, on its OSM outline at 1.2x (origin mid-nave,
 * bearing -9, local +x the Taylor Street front, the apse to the west). The front: two flat-topped towers with paired belfry
 * lancets and corner pinnacles, a gabled centre with the rose window over the deep portal and its gilded Ghiberti doors, and the
 * flight of steps down to Taylor. Behind it the nave with lean-to aisles, buttresses and pinnacles, tall clerestory lancets and a
 * steep slate roof; the transept with a rose in each gable; the choir ending in the round apse; the verdigris flèche over the
 * crossing with its gold cross, 75 m up. The cathedral stands on a raised floor 6 m above the street; the ground falls to Taylor.
 * On the plaza north of the front, the outdoor labyrinth (rings drawn as `landmarkLines`, in the first part's colour).
 */
function graceCathedral(): { parts: Part[]; lines: number[] } {
  const STONE = '#cfc8b8', TRIM = '#ddd7c9', SLATE = '#6c6f70', VERDIGRIS = '#5d7f73', GOLD = '#c9a24e', TERRAZZO = '#86827a', BRONZE = '#b8924a'
  const S = 1.2 // plan scale; numbers below are true local metres / 100 before it
  const s = (v: number) => v * S
  const d = asDetail
  const xF = s(0.353), xT = s(0.461), xP = s(0.48), xN0 = s(-0.066) // tower line, front face, porch, nave's west end
  const xX0 = s(-0.197), xC = s(-0.131), xA = s(-0.39) // transept's west wall, crossing, apse centre
  const zA = s(0.134), zN = s(0.06), zT = s(0.217), zC = s(0.088), zTw = s(0.045) // aisle, nave, transept, choir half-widths; towers' inner edge
  const yP = H(5), yA = yP + H(12), yN = yP + H(28), yR = yN + H(12), yTower = H(53), SUNK = -0.18
  const naveX = (xN0 + xF) / 2, naveL = xF - xN0
  const p: Part[] = [
    // the raised floor the whole cathedral stands on, and the steps down to Taylor Street
    d(box((xA - zC + xP) / 2, SUNK, yP, 0, xP - xA + zC + 0.04, 2 * zT + 0.04, TRIM)),
    // nave walls and roof, the aisles' lean-to roofs either side
    box(naveX, SUNK, yN, 0, naveL, 2 * zN, STONE),
    d(box(naveX, SUNK, yA, 0, naveL, 2 * zA, STONE)),
    d(blocks([[naveX, 0, naveL, 2 * zA + 0.012, yA - 0.004, yA + H(8)]], SLATE, { gabled: 'x' })),
    blocks([[naveX - 0.01, 0, naveL + 0.02, 2 * zN + 0.016, yN - 0.004, yR]], SLATE, { gabled: 'x' }),
    // transept and choir, the same height as the nave, and the round apse under a cone
    box(xC, SUNK, yN, 0, xN0 - xX0 + 0.004, 2 * zT, STONE),
    blocks([[xC, 0, xN0 - xX0 + 0.016, 2 * zT + 0.02, yN - 0.004, yR]], SLATE, { gabled: true }),
    // stone gable ends: a steeper stone gable just inside the roof, a hair longer, so only its end triangles show
    d(blocks([[xC, 0, xN0 - xX0, 2 * zT + 0.026, yN - 0.004, yR - 0.004]], STONE, { gabled: true })),
    box((xA + xX0) / 2, SUNK, yN, 0, xX0 - xA, 2 * zC, STONE),
    blocks([[(xA + xX0) / 2, 0, xX0 - xA, 2 * zC + 0.016, yN - 0.004, yR]], SLATE, { gabled: 'x' }),
    at(prism(0, SUNK, yN, zC / Math.cos(Math.PI / 10), 10, STONE), xA, 0),
    { ...at(tier(0, yN - 0.004, yR, zC + 0.01, 0.004, SLATE, 10), xA, 0) },
    // eaves lines
    d(box(naveX, yN - 0.012, yN + 0.002, 0, naveL, 2 * zN + 0.012, TRIM)),
    d(box(naveX, yA - 0.012, yA + 0.002, 0, naveL, 2 * zA + 0.01, TRIM)),
  ]
  // windows: clerestory and aisle lancets in seven bays, the choir's, the apse's round, and the transept walls
  p.push(
    wallOpenings(naveX, 0, yA + H(7), yN - 0.03, naveL - 0.05, 2 * zN, 7, 0.032),
    wallOpenings(naveX, 0, yP + 0.035, yA - 0.03, naveL - 0.05, 2 * zA, 7, 0.03),
    wallOpenings((xA + xX0) / 2, 0, yP + 0.04, yN - 0.04, xX0 - xA - 0.02, 2 * zC, 3, 0.032),
    at(drumOpenings(yP + 0.04, yN - 0.04, zC, 0.03), xA, 0),
    wallOpenings(xC, s(0.165), yP + 0.04, yN - 0.05, s(0.09), xN0 - xX0, 2, 0.03, { axis: 1 }),
    wallOpenings(xC, -s(0.165), yP + 0.04, yN - 0.05, s(0.09), xN0 - xX0, 2, 0.03, { axis: 1 }),
    wallOpenings(xC, 0, yP + 0.04, yN - H(12), xN0 - xX0 - 0.05, 2 * zT, 3, 0.026),
  )
  // buttresses between the bays, each topped by a pinnacle, and pinnacles on the transept corners
  const bays = 7, butt: number[][] = [], pins: number[][] = []
  for (let i = 0; i <= bays; i++) {
    const x = xN0 + 0.012 + ((naveL - 0.024) * i) / bays
    for (const sz of [-1, 1]) { butt.push([x, sz * (zA + 0.012), 0.022, 0.028, SUNK, yA + 0.03]); pins.push([x, sz * (zA + 0.012), 0.026, 0.026, yA + 0.03, yA + 0.1]) }
  }
  for (const sx of [xX0, xN0]) for (const sz of [-1, 1]) { butt.push([sx, sz * (zT - 0.006), 0.03, 0.03, SUNK, yN + 0.02]); pins.push([sx, sz * (zT - 0.006), 0.034, 0.034, yN + 0.02, yN + 0.11]) }
  p.push(d(blocks(butt, STONE)), d(blocks(pins, TRIM, { pyramid: true })))
  // rose windows: a stone ring, dark glass and a stone hub, on both transept gables and the front
  const rose = (x: number, y: number, z: number, r: number, axis: 'x' | 'z'): Part[] => {
    const rot: [number, number, number] = axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]
    return [[r + 0.012, 0.004, TRIM], [r, 0.008, SHADE], [r * 0.25, 0.012, TRIM]].map(([rr, t, c]) =>
      ({ geo: 'cyl', pos: [x, y, z], rot, scale: [2 * (rr as number), t as number, 2 * (rr as number)], color: c as string, args: [0.5, 0.5, 20], detail: true }))
  }
  for (const sz of [-1, 1]) p.push(...rose(xC, yN - 0.01, sz * (zT + 0.002), 0.052, 'z'))

  // the front: two towers, the gabled centre between them with the rose, the portal and its doors
  const towerZ = (zA + zTw) / 2, tW = zA - zTw, tD = xT - xF
  p.push(
    box(xF + tD / 2, SUNK, yN, 0, tD, 2 * zTw + 0.004, STONE),
    blocks([[xF + tD / 2 + 0.004, 0, tD - 0.008, 2 * zTw + 0.008, yN, yR + 0.03]], STONE, { gabled: 'x' }),
    ...rose(xT + 0.002, yP + H(22), 0, 0.058, 'x'),
    d(box(xP / 2 + xT / 2, SUNK, yP + H(13), 0, xP - xT + 0.01, s(0.102), TRIM)),
    d(blocks([[xP / 2 + xT / 2, 0, xP - xT + 0.014, s(0.102) + 0.01, yP + H(13), yP + H(19)]], TRIM, { gabled: 'x' })),
    wallOpenings(xP / 2 + xT / 2, 0, yP + 0.01, yP + H(10), 0.06, xP - xT + 0.014, 1, 0.05, { axis: 1, sides: 1 }),
    d(box(xP + 0.012, yP + 0.01, yP + H(6), 0, 0.004, 0.034, BRONZE)),
    d(box(xT - 0.002, yN + 0.03, yN + 0.05, 0, 0.012, 2 * zTw, TRIM)),
  )
  for (const sz of [-1, 1]) {
    const tz = sz * towerZ
    p.push(
      box(xF + tD / 2, SUNK, yTower, tz, tD, tW, STONE),
      d(box(xF + tD / 2, yTower - 0.02, yTower + 0.012, tz, tD + 0.012, tW + 0.012, TRIM)),
      // belfry: two tall lancets a face, a lower pair, and a door at the foot
      wallOpenings(xF + tD / 2, tz, yTower - H(14), yTower - H(2.5), tW - 0.03, tD, 2, 0.026, { axis: 1 }),
      wallOpenings(xF + tD / 2, tz, yTower - H(14), yTower - H(2.5), tD - 0.03, tW, 2, 0.026),
      wallOpenings(xF + tD / 2, tz, yN - H(10), yN - H(1), tW - 0.03, tD, 2, 0.018, { axis: 1, sides: 1 }),
      wallOpenings(xF + tD / 2, tz, yP + 0.01, yP + H(6), 0.03, tD + 0.004, 1, 0.026, { axis: 1, sides: 1 }),
      // stepped buttresses on the outer corners, a pinnacle on every corner of the top
      d(blocks([-1, 1].map((sx) => [xF + tD / 2 + sx * (tD / 2 - 0.008), tz + sz * (tW / 2 + 0.008), 0.022, 0.018, SUNK, yTower - H(10)]), STONE)),
      d(blocks([-1, 1].flatMap((sx) => [-1, 1].map((s2) => [xF + tD / 2 + sx * (tD / 2 - 0.008), tz + s2 * (tW / 2 - 0.008), 0.018, 0.018, yTower + 0.012, yTower + 0.07])), TRIM, { pyramid: true })),
    )
  }
  // the steps: five broad flights from the raised floor down to the street, as wide as the front
  const steps: number[][] = []
  for (let i = 0; i < 5; i++) steps.push([xP + 0.02 + i * 0.024 + 0.012, 0, 0.024 + 0.004, 2 * zA + 0.02, SUNK, yP - ((yP + 0.08) * (i + 1)) / 5])
  p.push(d(blocks(steps, TRIM)))

  // the flèche: an open octagonal lantern, a ring of pinnacles, and the needle with its gold cross
  const yL0 = yR - 0.04, yL1 = yR + H(9), yTip = H(73)
  p.push(
    at(prism(0, yL0, yL1, 0.034, 8, VERDIGRIS), xC, 0),
    { ...at(drumOpenings(yL0 + 0.05, yL1 - 0.02, 0.034 * Math.cos(Math.PI / 8), 0.012), xC, 0), color: SHADE },
    d(at(prism(0, yL1 - 0.008, yL1 + 0.006, 0.042, 8, VERDIGRIS), xC, 0)),
    d(blocks(Array.from({ length: 8 }, (_, k) => { const a = ((k + 0.5) / 8) * Math.PI * 2; return [xC + Math.cos(a) * 0.036, Math.sin(a) * 0.036, 0.01, 0.01, yL1, yL1 + 0.05] }), VERDIGRIS, { pyramid: true })),
    { geo: 'cone', pos: [xC, (yL1 + yTip) / 2, 0], scale: [0.06, yTip - yL1, 0.06], color: VERDIGRIS, detail: true, args: [0.5, 8] },
    d(box(xC, yTip - 0.01, H(76), 0, 0.006, 0.006, GOLD)),
    d(box(xC, H(74.6), H(75.2), 0, 0.006, 0.03, GOLD)),
  )

  // beside the choir, at their true size: the Chapel of Grace to the south and the lower wing to the north
  const yCh = yP + H(12), yWg = yP + H(8)
  p.push(
    d(box(-0.351, SUNK, yCh, 0.141, 0.308, 0.136, STONE)),
    d(blocks([[-0.351, 0.141, 0.316, 0.146, yCh - 0.004, yCh + H(7)]], SLATE, { gabled: 'x' })),
    wallOpenings(-0.351, 0.141, yP + 0.03, yCh - 0.03, 0.27, 0.136, 5, 0.026, { sides: 1 }),
    d(box(-0.347, SUNK, yWg, -0.186, 0.308, 0.246, STONE)),
    d(blocks([[-0.347, -0.186, 0.316, 0.254, yWg - 0.004, yWg + H(5)]], SLATE, { gabled: 'x' })),
    wallOpenings(-0.347, -0.186, yP + 0.02, yWg - 0.02, 0.27, 0.246, 8, 0.018, { rows: 2, sides: -1, flat: true }),
  )

  // the hover target follows the massing: roofs, towers and a slim flèche, not the automatic box, which would reach the
  // cross over the whole plan and catch the air above the nave and apse
  const hit = (x0: number, x1: number, z0: number, z1: number, y1: number): Part =>
    ({ ...box((x0 + x1) / 2, SUNK, y1, (z0 + z1) / 2, x1 - x0, z1 - z0, '#000'), hit: true })
  p.push(
    hit(xA - zC, xP + 0.16, -zT, zT, yP), // the raised floor and the steps
    hit(xN0, xP, -zA, zA, yR), // nave, aisles and the gabled front
    hit(xX0, xN0, -zT, zT, yR), // transept
    hit(xA - zC, xX0, -zC, zC, yR), // choir and apse
    hit(xF, xT, zTw, zA, yTower + 0.07),
    hit(xF, xT, -zA, -zTw, yTower + 0.07),
    hit(xC - 0.04, xC + 0.04, -0.04, 0.04, H(76)), // the flèche and its cross
    hit(-0.351 - 0.158, -0.351 + 0.158, 0.141 - 0.073, 0.141 + 0.073, yCh + H(7)), // Chapel of Grace
    hit(-0.347 - 0.158, -0.347 + 0.158, -0.186 - 0.127, -0.186 + 0.127, yWg + H(5)), // north wing
  )

  // the outdoor labyrinth on the plaza beside the front steps: a terrazzo disc and its rings
  const LX = 0.4, LZ = -0.36, LR = 0.055
  p.push(d(at(drum(SUNK, 0.006, LR + 0.006, LR + 0.006, TERRAZZO), LX, LZ)))
  const lines: number[] = []
  for (let r = 1; r <= 7; r++) {
    const rr = (LR * r) / 7.4, n = 12 + r * 4
    for (let k = 0; k < n; k++) {
      // a gap at a different place in each ring, the way the path turns
      if (k === (r * 5) % n) continue
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2
      seg(lines, [LX + Math.cos(a0) * rr, 0.008, LZ + Math.sin(a0) * rr], [LX + Math.cos(a1) * rr, 0.008, LZ + Math.sin(a1) * rr])
    }
  }
  return { parts: p, lines }
}

/**
 * Mission Dolores: the 1791 adobe chapel of Mission San Francisco de Asís and the 1918 Basilica beside it, on their DataSF
 * footprints at 1.1x (origin between them, bearing -4 for the Basilica; the older Mission sits another 4 degrees round, off the
 * street grid). Both fronts face Dolores Street (+x). The Mission: thick whitewashed walls under a low, deep-eaved tile gable,
 * four columns round the arched door, the dark wooden balcony across the front, the engaged columns and three bell niches above
 * it and a wooden cross on the gable. The Basilica: a cream body under a tile roof, the round apse, the red-tile dome over the
 * crossing, and the Churrigueresque front: two plain towers rising into ornate belfries with turquoise cupolas, the carved
 * frontispiece between them with its big arched window, three portals and the steps. South of the Mission, the cemetery garden
 * behind its adobe wall (`scenery`): headstones, roses, trees and the Ohlone tule hut.
 */
function missionDolores(): { parts: Part[]; lines: number[] } {
  const ADOBE = '#f6f3ec', TILE = '#9d4c34', WOOD = '#4a3426', CREAM = '#efe6d2', RELIEF = '#e1d3b5', RED = '#b45a3c', TURQUOISE = '#5aa89e',
    LAWN = '#8bb070', STONE = '#a7a49c', LEAF = '#5f8f4c', ROSE = '#d86f7f', TULE = '#8a6b45'
  const S = 1.1, s = (v: number) => v * S, d = asDetail, SUNK = -0.08
  const p: Part[] = []

  // --- the Basilica (true local metres / 100 before the 1.1x)
  const zM = s(-0.082), xB0 = s(-0.264), xF0 = s(0.204), xF = s(0.321), zB0 = s(-0.221), zB1 = s(0.057)
  const yBody = H(14), yRoofB = H(18)
  p.push(
    box((xB0 + xF0) / 2, SUNK, yBody, (zB0 + zB1) / 2, xF0 - xB0, zB1 - zB0, CREAM),
    blocks([[(xB0 + xF0) / 2, (zB0 + zB1) / 2, xF0 - xB0 + 0.012, zB1 - zB0 + 0.012, yBody - 0.004, yRoofB]], TILE, { gabled: 'x' }),
    d(box((xB0 + xF0) / 2, yBody - 0.01, yBody + 0.004, (zB0 + zB1) / 2, xF0 - xB0 + 0.008, zB1 - zB0 + 0.008, RELIEF)),
    d(box(s(-0.2385), SUNK, H(9), s(0.0875), s(0.101), s(0.061), CREAM)),
    d(box(s(-0.2385), H(9), H(9) + 0.008, s(0.0875), s(0.101) + 0.006, s(0.061) + 0.006, TILE)),
    wallOpenings((xB0 + xF0) / 2, (zB0 + zB1) / 2, H(5), yBody - H(2.5), xF0 - xB0 - 0.06, zB1 - zB0, 6, 0.026),
    at(prism(0, SUNK, yBody, s(0.056), 10, CREAM), s(-0.264), zM),
    at(tier(0, yBody - 0.004, H(17), s(0.056) + 0.008, 0.004, TILE, 10), s(-0.264), zM),
  )
  // the dome over the crossing: an octagonal drum with windows, the red-tile dome, a little lantern and a cross
  const xD = s(-0.17), rD = s(0.06), yD0 = yRoofB - 0.03, yD1 = H(22.5), hDome = H(7)
  p.push(
    at(prism(0, yD0, yD1, rD, 8, CREAM), xD, zM),
    { ...at(drumOpenings(yD0 + 0.03, yD1 - 0.02, rD * Math.cos(Math.PI / 8), 0.02), xD, zM) },
    d(at(prism(0, yD1 - 0.006, yD1 + 0.008, rD + 0.008, 8, RELIEF), xD, zM)),
    { geo: 'sphere', pos: [xD, yD1 + 0.008, zM], scale: [rD - 0.004, hDome, rD - 0.004], color: RED, args: [1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2] },
    d(at(drum(yD1 + hDome, yD1 + hDome + 0.04, 0.012, 0.012, CREAM), xD, zM)),
    d(box(xD, yD1 + hDome + 0.04, yD1 + hDome + 0.09, zM, 0.005, 0.005, WOOD)),
    d(box(xD, yD1 + hDome + 0.07, yD1 + hDome + 0.077, zM, 0.005, 0.026, WOOD)),
  )
  // the front: the block behind the towers, two towers with ornate belfries, the carved frontispiece, portals and steps
  const yFront = H(16), xT0 = s(0.241), tw = s(0.08), towers = [s(-0.164), s(0.001)]
  p.push(box((xF0 + xF) / 2, SUNK, yFront, (s(-0.204) + s(0.041)) / 2, xF - xF0, s(0.245), CREAM))
  const yShaft = H(22), yBelfry = H(29), yLantern = H(32), hCup = H(3.5)
  for (const tz of towers) {
    const tx = (xT0 + xF) / 2
    p.push(
      box(tx, SUNK, yShaft, tz, tw, tw, CREAM),
      d(box(tx, yShaft - 0.012, yShaft + 0.006, tz, tw + 0.01, tw + 0.01, RELIEF)),
      wallOpenings(tx, tz, yShaft - H(7), yShaft - H(5), 0.03, tw, 2, 0.006, { axis: 1, sides: 1, flat: true }),
      wallOpenings(tx, tz, H(9), H(11.5), 0.02, tw, 1, 0.012, { axis: 1, sides: 1, flat: true }),
      // belfry: an octagon with an arched opening each side, a carved cornice, a smaller stage, the tiled cupola and the cross
      at(prism(0, yShaft + 0.006, yBelfry, s(0.034), 8, CREAM), tx, tz),
      { ...at(drumOpenings(yShaft + 0.03, yBelfry - 0.02, s(0.034) * Math.cos(Math.PI / 8), 0.016), tx, tz) },
      d(at(prism(0, yBelfry - 0.008, yBelfry + 0.008, s(0.039), 8, RELIEF), tx, tz)),
      at(prism(0, yBelfry + 0.008, yLantern, s(0.026), 8, CREAM), tx, tz),
      { ...at(drumOpenings(yBelfry + 0.02, yLantern - 0.012, s(0.026) * Math.cos(Math.PI / 8), 0.01), tx, tz) },
      { geo: 'sphere', pos: [tx, yLantern, tz], scale: [s(0.027), hCup, s(0.027)], color: TURQUOISE, detail: true, args: [1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2] },
      d(box(tx, yLantern + hCup - 0.005, yLantern + hCup + 0.05, tz, 0.004, 0.004, WOOD)),
      d(box(tx, yLantern + hCup + 0.03, yLantern + hCup + 0.036, tz, 0.004, 0.02, WOOD)),
      // the finials round the belfry and the shaft's top
      d(blocks([-1, 1].flatMap((a) => [-1, 1].map((b) => [tx + a * (tw / 2 - 0.006), tz + b * (tw / 2 - 0.006), 0.01, 0.01, yShaft + 0.006, yShaft + 0.04])), RELIEF, { pyramid: true })),
    )
  }
  // the frontispiece between the towers: carved and stepped, twisted columns round the big arched window, a crest on top
  const zc = s(-0.0815), fw = s(0.085), yFr = H(21)
  p.push(
    d(box(xF + 0.004, SUNK, yFr, zc, 0.012, fw, RELIEF)),
    d(blocks([[xF + 0.004, zc, 0.012, fw * 0.7, yFr, yFr + H(2.5)], [xF + 0.004, zc, 0.012, fw * 0.36, yFr + H(2.5), yFr + H(4.5)]], RELIEF)),
    d(blocks([[xF + 0.004, zc, 0.014, fw * 0.36, yFr + H(4.5), yFr + H(6)]], RELIEF, { gabled: 'x' })),
    wallOpenings(xF + 0.004, zc, H(10), H(17), 0.03, 0.012, 1, 0.028, { axis: 1, sides: 1 }),
    columns([-1, 1].flatMap((a) => [[xF + 0.016, zc + a * 0.026], [xF + 0.016, zc + a * 0.036]] as [number, number][]), H(9.5), H(18), 0.0045, CREAM),
    d(blocks([-1, 1].map((a) => [xF + 0.016, zc + a * 0.031, 0.012, 0.02, H(18), H(19)]), CREAM)),
    d(blocks([-1, 0, 1].map((a) => [xF + 0.01, zc + a * 0.034, 0.008, 0.008, yFr + H(2.5), yFr + H(4.2)]), RELIEF, { pyramid: true })),
    // three portals: the main one in the frontispiece, one at each tower's foot, all with dark doors in carved frames
    wallOpenings(xF + 0.01, zc, H(0.5), H(8), 0.04, 0.012, 1, 0.034, { axis: 1, sides: 1 }),
    ...towers.map((tz) => wallOpenings((xT0 + xF) / 2, tz, H(0.5), H(6), 0.03, tw + 0.004, 1, 0.024, { axis: 1, sides: 1 })),
    ...towers.map((tz) => d(blocks([[xF + 0.003, tz, 0.006, 0.042, H(6), H(9.5)]], RELIEF, { gabled: 'x' }))),
  )
  const steps: number[][] = []
  for (let i = 0; i < 4; i++) steps.push([xF + 0.012 + i * 0.012 + 0.006, (s(-0.204) + s(0.041)) / 2, 0.014, s(0.245), SUNK, H(1.6) - (H(1.6) * i) / 4])
  p.push(d(blocks(steps, CREAM)))

  // --- the Mission, built along its own axis and turned onto the footprint
  const mc: [number, number] = [s(0.085), s(0.135)], th = 0.0696, c = Math.cos(th), sn = Math.sin(th)
  const place = (q: Part): Part => ({ ...q, pos: [mc[0] + q.pos[0] * c + q.pos[2] * sn, q.pos[1], mc[1] - q.pos[0] * sn + q.pos[2] * c], rot: [0, (q.rot?.[1] ?? 0) + th, 0] })
  const L = s(0.43), Wm = s(0.1), yWall = H(6.5), yRidge = H(10), uF = L / 2 // walls; the front is at +u
  const mission: Part[] = [
    box(0, SUNK, yWall, 0, L, Wm, ADOBE),
    blocks([[0.012, 0, L + 0.04, Wm + 0.03, yWall - 0.004, yRidge]], TILE, { gabled: 'x' }),
    // the white gable under the deep eave, a little behind the roof's front edge
    d(blocks([[0, 0, L + 0.004, Wm, yWall - 0.004, yRidge - 0.008]], ADOBE, { gabled: 'x' })),
    // the dark underside of the eaves at the front
    d(box(uF + 0.016, yWall - 0.006, yWall, 0, 0.032, Wm + 0.03, WOOD)),
    // ground storey: plinths, four columns, the arched door
    d(blocks([-1, 1].map((a) => [uF + 0.006, a * 0.033, 0.014, 0.034, SUNK, H(1)]), ADOBE)),
    columns([-0.042, -0.024, 0.024, 0.042].map((v) => [uF + 0.007, v] as [number, number]), H(1), H(4.2), 0.0055, ADOBE),
    wallOpenings(0, 0, H(0.6), H(3.9), 0.03, L + 0.002, 1, 0.022, { axis: 1, sides: 1 }),
    // the balcony: a wooden floor and rail right across, on posts
    d(box(uF + 0.012, H(4.2), H(4.5), 0, 0.026, Wm + 0.004, WOOD)),
    d(box(uF + 0.024, H(5.3), H(5.5), 0, 0.003, Wm + 0.004, WOOD)),
    d(blocks(Array.from({ length: 9 }, (_, i) => [uF + 0.024, -Wm / 2 + 0.002 + ((Wm - 0.004) * i) / 8, 0.003, 0.003, H(4.5), H(5.3)]), WOOD)),
    // upper storey: engaged columns and the three bell niches between them, with the bells
    columns([-0.044, -0.03, -0.01, 0.01, 0.03, 0.044].map((v) => [uF + 0.002, v] as [number, number]), H(4.5), H(7.4), 0.004, ADOBE),
    wallOpenings(0, 0, H(5.6), H(7.2), 0.072, L + 0.002, 3, 0.011, { axis: 1, sides: 1 }),
    ...[-0.02, 0, 0.02].map((v): Part => ({ geo: 'sphere', pos: [uF - 0.002, H(6.1), v], scale: [0.006, 0.008, 0.006], color: '#7a6a4a', detail: true, args: [1, 8, 6] })),
    // the wooden cross on the gable
    d(box(uF + 0.008, yRidge - 0.004, yRidge + H(1.8), 0, 0.004, 0.004, WOOD)),
    d(box(uF + 0.008, yRidge + H(1.1), yRidge + H(1.3), 0, 0.004, 0.018, WOOD)),
    // the long side walls: a few small deep windows
    wallOpenings(-0.02, 0, H(2.5), H(4.2), L - 0.12, Wm, 4, 0.01, { flat: true }),
  ]
  p.push(...mission.map(place))

  // --- the cemetery garden south of the Mission, behind its adobe wall (true size, outside the hover box)
  const sc = (q: Part): Part => ({ ...q, detail: true, scenery: true })
  const gx0 = -0.16, gx1 = 0.03, gz0 = 0.25, gz1 = 0.36
  p.push(
    sc(box((gx0 + gx1) / 2, SUNK, 0.006, (gz0 + gz1) / 2, gx1 - gx0, gz1 - gz0, LAWN)),
    sc(blocks([[(gx0 + gx1) / 2, gz1, gx1 - gx0, 0.006, SUNK, H(1.8)], [gx0, (gz0 + gz1) / 2, 0.006, gz1 - gz0, SUNK, H(1.8)], [gx1, (gz0 + gz1) / 2, 0.006, gz1 - gz0, SUNK, H(1.8)]], ADOBE)),
    sc(blocks(Array.from({ length: 24 }, (_, i) => [gx0 + 0.03 + (i % 8) * 0.024, gz0 + 0.03 + Math.floor(i / 8) * 0.03 + (i % 2) * 0.005, 0.008, 0.004, 0, H(0.9)]), STONE)),
    sc(blocks(Array.from({ length: 7 }, (_, i) => [gx0 + 0.03 + i * 0.026, gz1 - 0.014, 0.012, 0.008, 0, H(0.6)]), ROSE)),
    sc(at(tier(0, 0, H(3), 0.016, 0.002, TULE, 9), gx0 + 0.03, gz1 - 0.035)),
  )
  for (const [x, z] of [[gx0 + 0.02, gz0 + 0.01], [gx1 - 0.03, gz0 + 0.06], [gx0 + 0.11, gz1 - 0.03]]) {
    p.push(sc(at(drum(0, H(2.5), 0.004, 0.004, WOOD), x, z)))
    p.push(sc({ geo: 'sphere', pos: [x, H(2.5) + 0.03, z], scale: [0.03, 0.034, 0.03], color: LEAF, args: [1, 8, 6] }))
  }
  return { parts: p, lines: [] }
}

/** Ground profile under a bridge: how far the deck must run past each endpoint to reach the shore, and the terrain height along the axis. */
export interface BridgeGround {
  /** deck extension past the start (lat/lng) and end (lat2/lng2) endpoints, world units */
  start: number
  end: number
  /** terrain height (world y) at landmark-local x along the deck axis */
  groundY: (x: number) => number
  /** terrain height at any landmark-local point (the Bay Bridge's east span leaves the axis) */
  yLocal: (x: number, z: number) => number
}

/** Longest approach viaduct we will add past the first land under an endpoint (world units, 1 = 100 m). */
const MAX_APPROACH = 4

/** A landmark-local point for a lat/lng: x along the lat/lng -> lat2/lng2 axis, z to its right (the frame `Landmarks.tsx` rotates into). */
function bridgeFrame(l: Landmark) {
  const [x1, z1] = project(l.lat, l.lng)
  const [x2, z2] = project(l.lat2!, l.lng2!)
  const len = Math.hypot(x2 - x1, z2 - z1)
  const dx = (x2 - x1) / len, dz = (z2 - z1) / len
  return {
    len,
    toLocal: (lat: number, lng: number): [number, number] => {
      const [x, z] = project(lat, lng)
      return [(x - x1) * dx + (z - z1) * dz, -(x - x1) * dz + (z - z1) * dx]
    },
    toWorld: (lx: number, lz: number): [number, number] => [x1 + lx * dx - lz * dz, z1 + lx * dz + lz * dx],
  }
}

/**
 * Bridge endpoints are hand-placed and the baked shoreline is coarse, so a deck that stops exactly at its endpoints can end
 * over water. Walk outward along the axis until the terrain is land, then keep going (up to MAX_APPROACH) until the hillside
 * rises to the deck so the abutment buries into it.
 */
export function bridgeGround(l: Landmark, yAt: (x: number, z: number) => number): BridgeGround {
  const f = bridgeFrame(l)
  const yLocal = (lx: number, lz: number) => yAt(...f.toWorld(lx, lz))
  const groundY = (x: number) => yLocal(x, 0)
  const deckH = GGB.deckH
  const reach = (from: number, dir: 1 | -1) => {
    const step = 0.25
    let d = 0
    while (d < 12 && groundY(from + dir * d) < 0) d += step
    const shore = d
    while (d < shore + MAX_APPROACH && groundY(from + dir * d) < deckH - 0.05) d += step
    return d + 0.3
  }
  return { start: reach(0, -1), end: reach(f.len, 1), groundY, yLocal }
}

/** A model under construction: parts plus thin lines (suspenders, bracing, trusses) and thick ones (main cables), local space. */
interface BridgeModel {
  parts: Part[]
  lines: number[]
  cables: number[]
}
const seg = (out: number[], a: [number, number, number], b: [number, number, number]) => out.push(...a, ...b)
/** a cable hung between two points, sagging `sag` below the chord at mid-span, as a polyline of `n` segments */
function hang(out: number[], a: [number, number, number], b: [number, number, number], sag: number, n = 28) {
  const at = (t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t]
  for (let i = 0; i < n; i++) seg(out, at(i / n), at((i + 1) / n))
  return at
}

// ---------------------------------------------------------------- Golden Gate Bridge
const GGB = { deckH: H(67), towerH: H(227), deckW: 0.3, legZ: 0.14, main: 12.8, side: 3.43, concrete: '#d9d1c0', dark: '#a8390a', road: '#6d6862' }

/**
 * The Golden Gate: International Orange towers whose legs step in five times on the way up, fluted on their faces, tied by
 * four portal struts above the deck (each opening shorter than the one below) and X-bracing below it; a deck carried on a deep
 * Warren truss; the main cables from the Art Deco concrete pylons at each anchorage over both towers; suspenders every 50 m.
 * The towers are placed from the real 1,280 m main span, centred on the axis.
 */
function goldenGate(l: Landmark, ground?: BridgeGround): BridgeModel {
  const { len } = bridgeFrame(l)
  const { deckH, towerH: T, deckW, legZ, concrete } = GGB
  const m: BridgeModel = { parts: [], lines: [], cables: [] }
  const x0 = ground ? -ground.start : 0, xEnd = ground ? len + ground.end : len
  const towers = [len / 2 - GGB.main / 2, len / 2 + GGB.main / 2]
  // anchorages one side span out from each tower, slid inland if that lands in the water
  const anchors = towers.map((t, i) => {
    const dir = i === 0 ? -1 : 1
    let x = t + dir * GGB.side
    while (ground && ground.groundY(x) < 0 && x > x0 + 0.3 && x < xEnd - 0.3) x += dir * 0.25
    return x
  })
  const gy = (x: number) => (ground ? ground.groundY(x) : 0)
  m.parts.push(
    box((x0 + xEnd) / 2, deckH - 0.03, deckH + 0.03, 0, xEnd - x0, deckW, ORANGE),
    box((x0 + xEnd) / 2, deckH - 0.16, deckH - 0.03, 0, xEnd - x0, deckW * 0.82, GGB.dark),
    box((x0 + xEnd) / 2, deckH + 0.03, deckH + 0.034, 0, xEnd - x0, deckW - 0.07, GGB.road, true),
  )
  // stiffening truss down both sides: top and bottom chords with a zigzag between
  for (const z of [-deckW / 2, deckW / 2]) {
    seg(m.lines, [x0, deckH - 0.16, z], [xEnd, deckH - 0.16, z])
    for (let x = x0, k = 0; x < xEnd - 0.25; x += 0.25, k++) seg(m.lines, [x, k % 2 ? deckH - 0.16 : deckH - 0.03, z], [x + 0.25, k % 2 ? deckH - 0.03 : deckH - 0.16, z])
  }
  if (ground) {
    // abutments sunk into the hillside at both deck ends, and approach piers where the deck runs over land
    for (const x of [x0, xEnd]) {
      const g = Math.min(gy(x), deckH - 0.2)
      m.parts.push(box(x, g - 0.3, deckH, 0, 0.5, deckW + 0.2, concrete))
    }
    for (let x = x0 + 0.9; x < xEnd - 0.5; x += 0.9) {
      const g = gy(x)
      if (g < 0 || g > deckH - 0.12 || (x > anchors[0] && x < anchors[1])) continue
      m.parts.push(box(x, g - 0.1, deckH - 0.15, 0, 0.14, deckW * 0.7, concrete))
    }
  }
  // anchorage blocks and their stepped pylons, one either side of the deck; the cables come down over the pylons
  const pylonTop = deckH + 0.5
  for (const x of anchors) {
    const g = Math.min(0, gy(x))
    m.parts.push(box(x, g - 0.2, deckH - 0.05, 0, 0.7, deckW + 0.3, concrete))
    m.parts.push(blocks([-1, 1].flatMap((side) => [
      [x, side * (deckW / 2 + 0.07), 0.3, 0.13, deckH - 0.1, deckH + 0.28],
      [x, side * (deckW / 2 + 0.07), 0.24, 0.11, deckH + 0.28, deckH + 0.42],
      [x, side * (deckW / 2 + 0.07), 0.17, 0.09, deckH + 0.42, pylonTop],
    ]), concrete))
  }
  for (const x of towers) {
    // fender and pier at the water, then the legs in five stages, each a step narrower
    m.parts.push(box(x, -0.25, 0.3, 0, 0.62, deckW + 0.36, concrete))
    const stages: [number, number, number, number][] = [[0.3, deckH - 0.2, 0.26, 0.13], [deckH - 0.2, 0.6 * T, 0.23, 0.12], [0.6 * T, 0.76 * T, 0.2, 0.11], [0.76 * T, 0.88 * T, 0.18, 0.1], [0.88 * T, T, 0.16, 0.09]]
    const legs: number[][] = [], flutes: number[][] = []
    for (const z of [-legZ, legZ]) {
      for (const [y0, y1, wx, wz] of stages) {
        legs.push([x, z, wx, wz, y0, y1])
        // two recessed flutes on each face that looks along the road
        if (y0 >= deckH - 0.2) for (const fx of [-1, 1]) for (const fz of [-0.022, 0.022]) flutes.push([x + fx * (wx / 2 + 0.002), z + fz, 0.004, 0.014, y0 + 0.03, y1 - 0.02])
      }
      legs.push([x, z, 0.12, 0.07, T, T + 0.05], [x, z, 0.08, 0.05, T + 0.05, T + 0.09])
    }
    // portal struts: one under the deck, four above with ever shorter openings between, and the top one
    for (const [yc, h] of [[deckH - 0.28, 0.12], [0.47 * T, 0.2], [0.64 * T, 0.17], [0.79 * T, 0.14], [0.905 * T, 0.12], [T - 0.05, 0.1]]) legs.push([x, 0, 0.15, 2 * legZ, yc - h / 2, yc + h / 2])
    m.parts.push(blocks(legs, ORANGE), blocks(flutes, GGB.dark, { detail: true }))
    // X-bracing between the legs below the deck
    for (const [ya, yb] of [[0.3, (0.3 + deckH - 0.34) / 2], [(0.3 + deckH - 0.34) / 2, deckH - 0.34]]) {
      seg(m.lines, [x, ya, -legZ], [x, yb, legZ])
      seg(m.lines, [x, ya, legZ], [x, yb, -legZ])
    }
  }
  // cables: main span from saddle to saddle dipping to just above the deck, side spans down to the pylons
  const saddle = T + 0.02
  for (const z of [-legZ, legZ]) {
    const main = hang(m.cables, [towers[0], saddle, z], [towers[1], saddle, z], saddle - deckH - 0.07, 40)
    for (let i = 1; i < 26; i++) {
      const q = main(i / 26)
      seg(m.lines, [q[0], deckH + 0.03, z], q)
    }
    towers.forEach((t, i) => {
      const a = anchors[i]
      const side = hang(m.cables, [t, saddle, z], [a, pylonTop, z], 0.12, 12)
      for (let k = 1; k < 7; k++) {
        const q = side(k / 7)
        if (q[1] > deckH + 0.05) seg(m.lines, [q[0], deckH + 0.03, z], q)
      }
    })
  }
  return m
}

// ---------------------------------------------------------------- Bay Bridge
const BAY = { deckH: H(58), towerH: H(160), sasH: H(160), grey: '#c7ccd1', greyDark: '#8f949b', white: '#e8ebed', concrete: '#d4d0c6' }

/** A road along a polyline of landmark-local points, with a height profile of [s, y] breakpoints (s = distance along it). */
function road(pts: [number, number][], profile: [number, number][]) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const length = cum[cum.length - 1]
  const segAt = (s: number) => {
    let i = 0
    while (i < pts.length - 2 && cum[i + 1] < s) i++
    return i
  }
  /** plan point, heading (a y-rotation, as three.js turns a part) and the unit normal to the right, at distance s (+ `lat` sideways) */
  const at = (s: number, lat = 0) => {
    const i = segAt(s), a = pts[i], b = pts[i + 1], L = cum[i + 1] - cum[i]
    const t = (s - cum[i]) / L, dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L
    return { x: a[0] + (b[0] - a[0]) * t - dz * lat, z: a[1] + (b[1] - a[1]) * t + dx * lat, ang: Math.atan2(-dz, dx) }
  }
  const y = (s: number) => {
    if (s <= profile[0][0]) return profile[0][1]
    for (let i = 1; i < profile.length; i++) if (s <= profile[i][0]) {
      const [s0, y0] = profile[i - 1], [s1, y1] = profile[i]
      return y0 + ((y1 - y0) * (s - s0)) / (s1 - s0)
    }
    return profile[profile.length - 1][1]
  }
  /** the stretch [sa, sb] as straight sloped boxes (split at the polyline's corners and the profile's breaks) */
  const deck = (sa: number, sb: number, lat: number, width: number, thick: number, color: string, dy = 0, detail = false): Part[] => {
    const cuts = [...new Set([sa, sb, ...cum, ...profile.map((q) => q[0])])].filter((c) => c >= sa && c <= sb).sort((p, q) => p - q)
    const out: Part[] = []
    for (let i = 0; i + 1 < cuts.length; i++) {
      const s0 = cuts[i], s1 = cuts[i + 1]
      if (s1 - s0 < 0.01) continue
      const mid = at((s0 + s1) / 2, lat), y0 = y(s0), y1 = y(s1)
      out.push({ geo: 'box', pos: [mid.x, (y0 + y1) / 2 + dy, mid.z], rot: [0, mid.ang, Math.atan2(y1 - y0, s1 - s0)], scale: [Math.hypot(s1 - s0, y1 - y0) + 0.04, thick, width], color, detail })
    }
    return out
  }
  return { length, at, y, deck }
}

/**
 * The Bay Bridge, on its real alignment. The landmark's axis is the west span, from the SF end to Yerba Buena Island's west
 * tunnel portal: two suspension bridges end to end (704 m main spans, 353 m side spans) on four silver, X-braced towers, meeting
 * at the concrete centre anchorage, carrying a double deck. The east span (`path`, from the east portal to the Oakland
 * touchdown, off the axis) is the 2013 bridge: the white single-tower self-anchored span leaving the island, its cable planes
 * fanning out from the tower top to the deck edges, then the twin-deck skyway on piers, descending to Oakland.
 */
function bayBridge(l: Landmark, ground?: BridgeGround): BridgeModel {
  const f = bridgeFrame(l)
  const gy = (x: number, z: number) => (ground ? ground.yLocal(x, z) : 0)
  const { deckH: dH, towerH: T, grey, greyDark, white, concrete } = BAY
  const m: BridgeModel = { parts: [], lines: [], cables: [] }

  // ---- west span
  const W1 = 2.4, W2 = W1 + 3.53, W3 = W2 + 7.04, W4 = W3 + 3.68, W5 = W4 + 3.68, W6 = W5 + 7.04, WA = W6 + 3.53
  const Lw = f.len, portalY = Math.max(0.3, gy(Lw, 0) + 0.25)
  const west = road([[0, 0], [Lw, 0]], [[0, Math.max(0.2, gy(0, 0) + 0.1)], [W1, dH], [WA, dH], [Lw, portalY]])
  const wW = 0.3, legZ = 0.17
  m.parts.push(
    ...west.deck(0, Lw, 0, wW, 0.04, grey),
    ...west.deck(0, Lw, 0, wW * 0.9, 0.035, greyDark, -0.13),
    ...west.deck(0, Lw, 0, wW - 0.06, 0.004, '#6d6862', 0.022, true),
  )
  // double-deck truss down both sides
  for (const z of [-wW / 2, wW / 2]) for (let s = 0, k = 0; s < Lw - 0.3; s += 0.3, k++) {
    const a = west.y(s), b = west.y(s + 0.3)
    seg(m.lines, [s, (k % 2 ? a - 0.13 : a), z], [s + 0.3, (k % 2 ? b : b - 0.13), z])
  }
  // SF approach piers over land
  for (let s = 0.6; s < W1; s += 0.6) m.parts.push(box(s, gy(s, 0) - 0.1, west.y(s) - 0.15, 0, 0.12, wW * 0.8, concrete, true))
  // piers under each tower and anchorage, the four towers, and the big centre anchorage that the cables dive into
  for (const x of [W1, W2, W3, W5, W6, WA]) m.parts.push(box(x, -0.25, 0.25, 0, 0.5, wW + 0.3, concrete))
  const legs: number[][] = []
  for (const x of [W2, W3, W5, W6]) {
    for (const z of [-legZ, legZ]) legs.push([x, z, 0.14, 0.1, 0.25, 0.55 * T], [x, z, 0.12, 0.09, 0.55 * T, T])
    for (const yc of [dH - 0.25, 0.62 * T, T - 0.05]) legs.push([x, 0, 0.1, 2 * legZ, yc - 0.05, yc + 0.05])
    // lattice: X-bracing panels from the water to the top
    const levels = [0.25, dH - 0.3, dH + 0.25, 0.62 * T - 0.05, 0.62 * T + 0.05, 0.82 * T, T - 0.1]
    for (let i = 0; i + 1 < levels.length; i++) {
      if (i === 1 || i === 3) continue // the deck and a strut sit in these gaps
      seg(m.lines, [x, levels[i], -legZ], [x, levels[i + 1], legZ])
      seg(m.lines, [x, levels[i], legZ], [x, levels[i + 1], -legZ])
    }
  }
  m.parts.push(blocks(legs, grey))
  m.parts.push(blocks([[W4, 0, 0.9, wW + 0.5, -0.25, dH + 0.5], [W4, 0, 0.6, wW + 0.3, dH + 0.5, dH + 0.75]], concrete))
  m.parts.push(box(W1, 0, dH + 0.25, 0, 0.5, wW + 0.3, concrete), box(WA, 0.2, dH + 0.25, 0, 0.5, wW + 0.3, concrete))
  const top = T + 0.02
  for (const z of [-legZ, legZ]) {
    for (const [a, b] of [[W2, W3], [W5, W6]]) {
      const c = hang(m.cables, [a, top, z], [b, top, z], top - dH - 0.1, 36)
      for (let i = 1; i < 20; i++) { const q = c(i / 20); seg(m.lines, [q[0], dH + 0.02, z], q) }
    }
    for (const [a, b] of [[W1, W2], [W3, W4], [W4, W5], [W6, WA]]) {
      const ya = a === W1 || a === W3 || a === W6 ? (a === W1 ? dH + 0.25 : top) : dH + 0.75
      const yb = b === WA ? dH + 0.25 : b === W4 ? dH + 0.75 : top
      const c = hang(m.cables, [a, ya, z], [b, yb, z], 0.12, 14)
      for (let i = 1; i < 8; i++) { const q = c(i / 8); if (q[1] > dH + 0.06) seg(m.lines, [q[0], dH + 0.02, z], q) }
    }
  }
  // tunnel portal on the island
  m.parts.push(box(Lw - 0.1, portalY - 0.35, portalY + 0.12, 0, 0.2, 0.46, concrete, true))

  // ---- east span, along its own polyline
  const pts = (l.path ?? []).map(([lat, lng]) => f.toLocal(lat, lng))
  if (pts.length < 2) return m
  const probe = road(pts, [[0, 0]])
  // the self-anchored span starts where the island ends; its tower 385 m out, the east pier 180 m beyond
  let sW = 0
  while (sW < 4 && gy(probe.at(sW).x, probe.at(sW).z) > 0) sW += 0.1
  const sT = sW + 3.85, sE = sT + 1.8, Le = probe.length
  const endY = Math.max(0.2, gy(pts[pts.length - 1][0], pts[pts.length - 1][1]) + 0.08)
  const east = road(pts, [[0, Math.max(0.3, gy(pts[0][0], pts[0][1]) + 0.25)], [sW, dH - 0.1], [sE, dH - 0.1], [Le - 1.2, endY + 0.1], [Le, endY]])
  const lane = 0.26, laneAt = 0.23
  for (const side of [-1, 1]) {
    m.parts.push(...east.deck(0, Le, side * laneAt, lane, 0.06, white))
    m.parts.push(...east.deck(0, Le, side * laneAt, lane - 0.05, 0.004, '#6d6862', 0.032, true))
  }
  const eastPiers: number[] = [sW, sE]
  for (let s = sE + 1.6; s < Le - 0.8; s += 1.6) eastPiers.push(s)
  for (const s of eastPiers) for (const side of [-1, 1]) {
    const q = east.at(s, side * laneAt), y = east.y(s)
    const big = s === sW || s === sE
    m.parts.push({ geo: 'box', pos: [q.x, (Math.min(0, gy(q.x, q.z)) - 0.2 + y - 0.03) / 2, q.z], rot: [0, q.ang, 0], scale: [big ? 0.3 : 0.12, y - 0.03 - Math.min(0, gy(q.x, q.z)) + 0.2, big ? 0.3 : 0.14], color: concrete, detail: !big })
  }
  // the tower: four slender legs close together between the two decks, tied by shear links
  const tw = east.at(sT), H0 = -0.2
  for (const dx of [-0.05, 0.05]) for (const dz of [-0.05, 0.05]) {
    const q = { x: tw.x + dx * Math.cos(tw.ang) + dz * Math.sin(tw.ang), z: tw.z - dx * Math.sin(tw.ang) + dz * Math.cos(tw.ang) }
    m.parts.push({ geo: 'cyl', pos: [q.x, (H0 + BAY.sasH) / 2, q.z], rot: [0, tw.ang, 0], scale: [1, BAY.sasH - H0, 1], color: white, args: [0.036 * Math.SQRT2, 0.05 * Math.SQRT2, 4, 1, false, Math.PI / 4] })
  }
  for (let y = dH + 0.35; y < BAY.sasH - 0.1; y += 0.35) m.parts.push({ geo: 'box', pos: [tw.x, y, tw.z], rot: [0, tw.ang, 0], scale: [0.16, 0.03, 0.16], color: white, detail: true })
  // cable planes: from each deck's outer edge at the island pier, up to the tower top, down to the east pier
  const sasTop = BAY.sasH - 0.05
  for (const side of [-1, 1]) {
    const edge = side * (laneAt + lane / 2)
    const pt = (s: number, lat: number, yy: number): [number, number, number] => { const q = east.at(s, lat); return [q.x, yy, q.z] }
    const n = 24
    const cable = (s0: number, s1: number, sag: number, yA: number, yB: number, latA: number, latB: number) => {
      const at = (t: number): [number, number, number] => pt(s0 + (s1 - s0) * t, latA + (latB - latA) * t, yA + (yB - yA) * t - 4 * sag * t * (1 - t))
      for (let i = 0; i < n; i++) seg(m.cables, at(i / n), at((i + 1) / n))
      for (let i = 1; i < n; i += 2) { const s = s0 + ((s1 - s0) * i) / n, q = at(i / n); seg(m.lines, pt(s, edge, east.y(s) + 0.03), q) }
    }
    cable(sW, sT, 0.55, east.y(sW) + 0.05, sasTop, edge, side * 0.06)
    cable(sT, sE, 0.25, sasTop, east.y(sE) + 0.05, side * 0.06, edge)
  }

  // ---- hit boxes: one per straight run (the automatic hover box could only be axis-aligned)
  const hit = (x: number, z: number, ang: number, length: number, width: number, h: number): Part => ({ geo: 'box', pos: [x, h / 2 - 0.2, z], rot: [0, ang, 0], scale: [length, h + 0.4, width], color: '#000', hit: true })
  m.parts.push(hit(Lw / 2, 0, 0, Lw, 0.6, T + 0.1))
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    m.parts.push(hit((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(-(b[1] - a[1]) / L, (b[0] - a[0]) / L), L + 0.3, 0.9, i === 0 || i === 1 ? BAY.sasH : dH))
  }
  return m
}

/** Suspenders, bracing and trusses as line segments [x,y,z,x,y,z,...] in landmark-local space (bridges, and City Hall's gilded dome ribs). */
export function landmarkLines(l: Landmark, ground?: BridgeGround): number[] {
  if (l.kind === 'cityhall') return cityHall().lines
  if (l.kind === 'ghirardelli') return ghirardelli().lines
  if (l.kind === 'cathedral') return graceCathedral().lines
  if (l.kind !== 'bridge') return []
  return (l.id === 'baybridge' ? bayBridge(l, ground) : goldenGate(l, ground)).lines
}

/** Main cables, drawn heavier than `landmarkLines` (bridges only). */
export function landmarkCables(l: Landmark, ground?: BridgeGround): number[] {
  if (l.kind !== 'bridge') return []
  return (l.id === 'baybridge' ? bayBridge(l, ground) : goldenGate(l, ground)).cables
}

// ---------------------------------------------------------------- Twin Peaks

/** The drawn terrain round a landmark that brings its own ground: world y the model stands at, and of the ground at a local point. */
export interface Terrain {
  origin: number
  at: (x: number, z: number) => number
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** The baked hill (twinPeaksData.ts): metres above sea level and how far inside the natural area, per grid point. */
function twinPeaksGrid() {
  const { nx, nz, h0, hq, heights, inside } = TP.GRID
  const h = new Float32Array(nx * nz), w = new Float32Array(nx * nz)
  for (let k = 0; k < nx * nz; k++) {
    h[k] = h0 + (B64.indexOf(heights[2 * k]) * 64 + B64.indexOf(heights[2 * k + 1])) * hq
    w[k] = B64.indexOf(inside[k]) / 63
  }
  return { h, w }
}

// a smooth value noise for the hill's patchwork (deterministic, so the pipeline and the app agree)
const hash2 = (i: number, j: number) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v) }
function noise2(x: number, z: number) {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v)
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1)
  return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv
}

/**
 * Twin Peaks at true size, on the real ground: the heightmap (80 m pixels) melts the two summits into one blob ~25 m too
 * low, so the model is the hill itself, a 15 m grid of the USGS elevation over the natural area (scripts/twinpeaks.ts) with
 * the terrain's 1.6x exaggeration, rising out of the city's drawn ground at the area's edge and sinking back under it.
 * Faceted in dry gold grass, coyote-brush scrub lower down and on the cooler slopes, and the red-brown chert that breaks
 * out on both summits. On it, from OSM: the figure-eight of Twin Peaks Boulevard (the two-way road with its double yellow
 * line down the west side and round the south hairpin; the east side and the loop round the north knoll car-free since
 * 2020), the dirt trails and the timber stairs up Eureka (north) and Noe (south) peaks, and Christmas Tree Point's terrace
 * car park with its stone parapet and coin viewers facing downtown.
 */
function twinPeaks(terrain?: Terrain): Part[] {
  const { nx, nz, x0, z0, step } = TP.GRID
  const { h, w } = twinPeaksGrid()
  const k0 = Math.round(-z0 / step) * nx + Math.round(-x0 / step)
  const origin = terrain?.origin ?? elevationToY(h[k0])
  // the hill follows the real ground inside the area, never dips under the drawn terrain there, and sinks 12 m under it at the edge
  const y = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, dem = elevationToY(h[k]) - origin
    const g = terrain ? terrain.at(x0 + i * step, z0 + j * step) - origin : dem
    const core = Math.max(dem, g + 0.015), under = g - 0.12
    y[k] = r4(under + (core - under) * w[k])
  }
  // height of the hill's own triangles (each cell split along its north-east to south-west diagonal, as hillGeometry does)
  const surface = (x: number, z: number) => {
    const fi = (x - x0) / step, fj = (z - z0) / step
    const i = Math.min(nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(nz - 2, Math.max(0, Math.floor(fj))), u = fi - i, v = fj - j
    const a = y[j * nx + i], b = y[j * nx + i + 1], c = y[(j + 1) * nx + i], d = y[(j + 1) * nx + i + 1]
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v)
  }

  // the patchwork, one colour per triangle
  const GRASS_A = '#dcc78f', GRASS_B = '#d0bb83', GRASS_C = '#c2c28a', SCRUB_A = '#a3aa70', SCRUB_B = '#8c9861', CHERT_A = '#b57b62', CHERT_B = '#9d6853', SKIRT = '#9a8f6b'
  const palette = [GRASS_A, GRASS_B, GRASS_C, SCRUB_A, SCRUB_B, CHERT_A, CHERT_B, SKIRT]
  const cls: number[] = []
  for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
    const k = j * nx + i, h00 = h[k], h10 = h[k + 1], h01 = h[k + nx], h11 = h[k + nx + 1]
    const gx = (h10 + h11 - h00 - h01) / 30, gz = (h01 + h11 - h00 - h10) / 30, slope = Math.hypot(gx, gz)
    // north- and east-facing slopes get the fog and keep their scrub; the west face is wind-cropped grass
    const cool = gz > 0.08 || gx < -0.08
    for (const tri of [0, 1]) {
      const cx = x0 + (i + (tri ? 0.67 : 0.33)) * step, cz = z0 + (j + (tri ? 0.67 : 0.33)) * step
      const m = tri ? (h01 + h11 + h10) / 3 : (h00 + h01 + h10) / 3
      const n1 = noise2(cx / 0.45, cz / 0.45), n2 = noise2(cx / 0.2 + 7.3, cz / 0.2 - 3.1)
      let c: number
      if ((m > 268 && (slope > 0.45 || n2 > 0.58)) || (slope > 0.8 && n2 > 0.72)) c = n2 > 0.7 ? 6 : 5
      else {
        const scrub = n1 + (cool ? 0.2 : 0) + (m < 240 ? 0.16 : 0) - (m > 260 ? 0.3 : 0)
        c = scrub > 0.86 ? 4 : scrub > 0.7 ? 3 : cool ? 2 : n2 > 0.5 ? 0 : 1
      }
      cls.push(c)
    }
  }
  const p: Part[] = [fitted('hill', [nx, nz, x0, z0, step, palette.length, ...palette.map((c) => parseInt(c.slice(1), 16)), ...y, ...cls], '#ffffff')]

  // lines draped on the hill: every few metres so they follow its facets
  const drape = (flat: number[], lift = 0): [number, number, number][] => {
    const out: [number, number, number][] = []
    for (let i = 0; i + 3 < flat.length; i += 2) {
      const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3]
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.04))
      for (let s = i ? 1 : 0; s <= n; s++) {
        const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n
        out.push([r4(x), r4(surface(x, z) + lift), r4(z)])
      }
    }
    return out
  }
  const ROAD_ = '#6f6a63', PROM = '#8b867d', LINE = '#e6be45', TRAIL = '#dccaa2', STEP_ = '#8a6a4b', STONE_ = '#bcb29d', VIEWER = '#3f4a52'
  p.push(
    asDetail(fitted('ribbons', [0.055, 0.012, 0.04, ...packLines(TP.DRIVE.map((l) => drape(l)))], ROAD_)),
    asDetail(fitted('ribbons', [0.0035, 0.0135, 0.004, ...packLines(TP.DRIVE.map((l) => drape(l)))], LINE)),
    asDetail(fitted('ribbons', [0.05, 0.012, 0.04, ...packLines(TP.PROMENADE.map((l) => drape(l)))], PROM)),
    asDetail(fitted('ribbons', [0.016, 0.01, 0.03, ...packLines(TP.TRAILS.map((l) => drape(l)))], TRAIL)),
    asDetail(fitted('ribbons', [0.02, 0.013, 0.035, ...packLines(TP.STAIRS.map((l) => drape(l)))], STEP_)),
  )

  // Christmas Tree Point: the terrace (levelled in the bake), its parapet on the downtown side, coin viewers, a few cars
  for (const ring of TP.LOTS) {
    const pts: [number, number][] = []
    for (let i = 0; i + 1 < ring.length; i += 2) pts.push([ring[i], ring[i + 1]])
    const level = pts.reduce((s, [x, z]) => s + surface(x, z), 0) / pts.length + 0.014
    p.push(asDetail(fitted('pad', [0.06, ...pts.flatMap(([x, z]) => [r4(x), r4(level), r4(z)])], ROAD_)))
    const area = pts.reduce((s, [x, z], i) => { const [x2, z2] = pts[(i + 1) % pts.length]; return s + x * z2 - x2 * z }, 0)
    // a ring with positive shoelace area has the outside on the right of travel, (dz, -dx)
    const out = area > 0 ? 1 : -1
    const wall: [number, number, number][][] = []
    let run: [number, number, number][] = []
    pts.forEach(([x, z], i) => {
      const [x2, z2] = pts[(i + 1) % pts.length], L = Math.hypot(x2 - x, z2 - z) || 1
      const nxo = (out * (z2 - z)) / L
      if (nxo > 0.35) {
        if (!run.length) run.push([x, level, z])
        run.push([x2, level, z2])
      } else if (run.length) { wall.push(run); run = [] }
    })
    if (run.length) wall.push(run)
    p.push(asDetail(fitted('ribbons', [0.008, 0.028, 0.06, ...packLines(wall.filter((r) => r.length > 1))], STONE_)))
    // cars nosed in round the edge, every ~10 m
    const CARS = ['#c9463d', '#f3f1ea', '#2f6ea5', '#3b3b3b', '#d9d5cc', '#e0a43a', '#4f7a63']
    let along = 0, n = 0
    pts.forEach(([x, z], i) => {
      const [x2, z2] = pts[(i + 1) % pts.length], L = Math.hypot(x2 - x, z2 - z)
      for (let s = (0.1 - along) % 0.1; s < L; s += 0.1) {
        if (hash2(i, n) < 0.35) { n++; continue }
        const t = s / L, ix = (-out * (z2 - z)) / L, iz = (out * (x2 - x)) / L
        const cx = x + (x2 - x) * t + ix * 0.045, cz = z + (z2 - z) * t + iz * 0.045
        p.push({ geo: 'box', pos: [r4(cx), r4(level + 0.012), r4(cz)], rot: [0, r4(Math.atan2(-(z2 - z), x2 - x) + Math.PI / 2), 0], scale: [0.045, 0.02, 0.022], color: CARS[n++ % CARS.length], detail: true })
      }
      along = (along + L) % 0.1
    })
  }
  for (const [vx, vz] of TP.VIEWPOINTS.slice(0, 2)) {
    const yv = surface(vx, vz) + 0.014
    p.push(columns([[vx - 0.02, vz], [vx + 0.02, vz]], yv - 0.02, yv + 0.03, 0.004, VIEWER))
    p.push(asDetail(blocks([[vx - 0.02, vz, 0.014, 0.01, yv + 0.03, yv + 0.04], [vx + 0.02, vz, 0.014, 0.01, yv + 0.03, yv + 0.04]], VIEWER)))
  }

  // the chert breaking out on both summits (detail: their hulls would swell into blobs; the hill's outline runs over them)
  for (const [sx, sz] of [TP.EUREKA, TP.NOE]) {
    for (let k = 0; k < 4; k++) {
      const a = k * 2.1 + sx * 10, r = k ? 0.05 + 0.03 * hash2(k, sz * 10) : 0.08
      const x = sx + (k ? 0.07 * Math.cos(a) : 0), z = sz + (k ? 0.07 * Math.sin(a) : 0)
      p.push({ geo: 'sphere', pos: [r4(x), r4(surface(x, z) + r * 0.15), r4(z)], rot: [0, r4(a), 0], scale: [r4(r), r4(r * 0.5), r4(r * 0.75)], color: k % 2 ? CHERT_B : CHERT_A, args: [1, 6, 4], detail: true })
    }
  }
  return p
}

/** polylines of [x, y, z] points as one args run: count, then the points */
const packLines = (lines: [number, number, number][][]) => lines.flatMap((l) => [l.length, ...l.flat()])
const unpackLines = (a: number[], from: number) => {
  const out: [number, number, number][][] = []
  for (let i = from; i < a.length; ) {
    const n = a[i++]
    out.push(Array.from({ length: n }, (_, k) => [a[i + 3 * k], a[i + 3 * k + 1], a[i + 3 * k + 2]] as [number, number, number]))
    i += 3 * n
  }
  return out
}

/**
 * Model-space triangles (and optional per-vertex colours) for the parts that carry their own coordinates in args: the hill
 * (a height grid), ribbons (draped lines) and pads (draped rings). `grow` raises the top and lowers the bottom (the hull).
 */
function freeform(geo: Part['geo'], a: number[], grow: number): { pos: number[]; col?: number[] } {
  const pos: number[] = []
  const quad = (p0: number[], p1: number[], p2: number[], p3: number[]) => pos.push(...p0, ...p1, ...p2, ...p1, ...p3, ...p2)
  if (geo === 'hill') {
    // [nx, nz, x0, z0, step, palette size, ...palette (0xrrggbb), ...heights (row by row from the north), ...colour per triangle]
    const [nx, nz, x0, z0, step, np] = a, ys = 6 + np, cs = ys + nx * nz
    const pal = a.slice(6, ys).map((c) => new THREE.Color(c))
    const col: number[] = []
    const v = (i: number, j: number) => [x0 + i * step, a[ys + j * nx + i] + grow, z0 + j * step]
    const paint = (c: THREE.Color, n: number) => { for (let k = 0; k < n; k++) col.push(c.r, c.g, c.b) }
    let t = cs
    for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
      pos.push(...v(i, j), ...v(i, j + 1), ...v(i + 1, j))
      paint(pal[a[t++]], 3)
      pos.push(...v(i, j + 1), ...v(i + 1, j + 1), ...v(i + 1, j))
      paint(pal[a[t++]], 3)
    }
    // walls round the edge, down below the lowest point, so the hull is a closed shell
    let lo = Infinity
    for (let k = 0; k < nx * nz; k++) lo = Math.min(lo, a[ys + k])
    const b = (q: number[]) => [q[0], lo - 0.05 - grow, q[2]]
    const n0 = pos.length
    for (let i = 0; i + 1 < nx; i++) {
      quad(b(v(i, 0)), v(i, 0), b(v(i + 1, 0)), v(i + 1, 0))
      quad(b(v(i + 1, nz - 1)), v(i + 1, nz - 1), b(v(i, nz - 1)), v(i, nz - 1))
    }
    for (let j = 0; j + 1 < nz; j++) {
      quad(b(v(nx - 1, j)), v(nx - 1, j), b(v(nx - 1, j + 1)), v(nx - 1, j + 1))
      quad(b(v(0, j + 1)), v(0, j + 1), b(v(0, j)), v(0, j))
    }
    paint(pal[np - 1], (pos.length - n0) / 3)
    return { pos, col }
  }
  if (geo === 'ribbons') {
    // [half width, lift, thickness, ...lines]: a flat strip `lift` above each line, with sides `thickness` deep
    const [hw, lift, thick] = a
    for (const line of unpackLines(a, 3)) {
      const edge = line.map((q, i) => {
        const pa = line[Math.max(0, i - 1)], pb = line[Math.min(line.length - 1, i + 1)]
        const dx = pb[0] - pa[0], dz = pb[2] - pa[2], L = Math.hypot(dx, dz) || 1
        const top = q[1] + lift + grow, bot = q[1] + lift - thick - grow
        const L_ = (s: number, y: number) => [q[0] + (dz / L) * (hw + grow) * s, y, q[2] - (dx / L) * (hw + grow) * s]
        return { l: L_(1, top), r: L_(-1, top), lb: L_(1, bot), rb: L_(-1, bot) }
      })
      for (let i = 0; i + 1 < edge.length; i++) {
        const e0 = edge[i], e1 = edge[i + 1]
        quad(e0.l, e0.r, e1.l, e1.r)
        quad(e1.rb, e1.r, e0.rb, e0.r)
        quad(e0.lb, e0.l, e1.lb, e1.l)
      }
    }
    return { pos }
  }
  // pad: [thickness, ...ring x, y, z]: the ring triangulated as a flat top, with sides `thickness` deep
  const thick = a[0], ring = unpackLines([(a.length - 1) / 3, ...a.slice(1)], 0)[0]
  const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, , z]) => new THREE.Vector2(x, z)), [])
  const top = (q: number[]) => [q[0], q[1] + grow, q[2]], bot = (q: number[]) => [q[0], q[1] - thick - grow, q[2]]
  // seen from above (x right, north up) a front face runs anticlockwise, i.e. negative shoelace area in x-z
  const cross = (p0: number[], p1: number[], p2: number[]) => (p1[0] - p0[0]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[0] - p0[0])
  for (const [i, j, k] of tris) {
    const [qi, qj, qk] = [ring[i], ring[j], ring[k]]
    if (cross(qi, qj, qk) < 0) pos.push(...top(qi), ...top(qj), ...top(qk))
    else pos.push(...top(qi), ...top(qk), ...top(qj))
  }
  const area = ring.reduce((sum, q, i) => { const q2 = ring[(i + 1) % ring.length]; return sum + q[0] * q2[2] - q2[0] * q[2] }, 0)
  for (let i = 0; i < ring.length; i++) {
    const q0 = ring[i], q1 = ring[(i + 1) % ring.length]
    if (area > 0) quad(bot(q0), top(q0), bot(q1), top(q1))
    else quad(bot(q1), top(q1), bot(q0), top(q0))
  }
  return { pos }
}
function freeformBox(geo: Part['geo'], a: number[]) {
  const { pos } = freeform(geo, a, 0)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]) }
  return { c: lo.map((v, i) => (v + hi[i]) / 2), s: lo.map((v, i) => Math.max(1e-3, hi[i] - v)) }
}
/** a freeform part placed on its own bounds (like `blocks`), so pos/scale stay true for the hover box */
function fitted(geo: 'hill' | 'ribbons' | 'pad', args: number[], color: string): Part {
  const { c, s } = freeformBox(geo, args)
  return { geo, pos: [r4(c[0]), r4(c[1]), r4(c[2])], scale: [r4(s[0]), r4(s[1]), r4(s[2])], color, args }
}
/** The same in the unit box of the ungrown part (a grown hull is scaled up by 2 * grow when drawn), with vertex colours if any. */
function freeformGeometry(geo: Part['geo'], a: number[], grow: number): THREE.BufferGeometry {
  const { c, s } = freeformBox(geo, a)
  const { pos, col } = freeform(geo, a, grow)
  for (let i = 0; i < pos.length; i++) pos[i] = (pos[i] - c[i % 3]) / (s[i % 3] + 2 * grow)
  const g = fromPositions(pos)
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return g
}

/** `grow` (sectors, blocks and the freeform parts only) returns the part's hover hull: the same shape offset outwards by that much, in the part's own unit frame. */
export function partGeometry(p: Part, grow = 0): THREE.BufferGeometry {
  const a = (p.args ?? []) as number[]
  switch (p.geo) {
    case 'box': return new THREE.BoxGeometry(1, 1, 1)
    case 'cyl': return new THREE.CylinderGeometry(a[0] ?? 0.5, a[1] ?? 0.5, 1, a[2] ?? 16, 1, !!a[4], a[5] ?? 0)
    case 'cone': return new THREE.ConeGeometry(a[0] ?? 0.5, 1, a[1] ?? 8)
    case 'sphere': return new THREE.SphereGeometry(1, a[1] ?? 16, a[2] ?? 12, a[3] ?? 0, a[4] ?? Math.PI * 2, a[5] ?? 0, a[6] ?? Math.PI)
    case 'ring': return new THREE.TorusGeometry(1, 0.1, 8, 24)
    case 'stack': return stackGeometry(a)
    case 'fluted': return flutedGeometry(a)
    case 'arcade': return arcadeGeometry(a)
    case 'arches': return archesGeometry(a)
    case 'ringwall': return ringwallGeometry(a)
    case 'archwall': return archwallGeometry(a)
    case 'columns': return columnsGeometry(a)
    case 'sector': return sectorGeometry(a, grow)
    case 'blocks': return blocksGeometry(a, grow)
    case 'strokes': return strokesGeometry(a)
    case 'hill': case 'ribbons': case 'pad': return freeformGeometry(p.geo, a, grow)
    case 'rblocks': case 'blobs': return townGeometry(p.geo, a)
  }
}

/**
 * Rounded-square slabs stacked along y: args are [corner radius as a fraction of the half-width, segments per corner,
 * then y0, half0, y1, half1 per slab] in unit space. A slab is capped unless the next one starts where it ends, so one
 * geometry serves both a tapering body (touching slabs) and its floor bands (spaced slabs).
 */
function stackGeometry(a: number[]): THREE.BufferGeometry {
  const [corner, segs] = a
  const ring = (y: number, half: number) => {
    const r = half * corner, pts: number[] = []
    for (let k = 0; k < 4; k++) {
      const mid = ((k + 0.5) * Math.PI) / 2
      const cx = Math.sign(Math.cos(mid)) * (half - r), cz = Math.sign(Math.sin(mid)) * (half - r)
      for (let s = 0; s <= segs; s++) {
        const th = ((k + s / segs) * Math.PI) / 2
        pts.push(cx + r * Math.cos(th), y, cz + r * Math.sin(th))
      }
    }
    return pts
  }
  const pos: number[] = []
  for (let i = 2; i + 3 < a.length; i += 4) {
    const next = a[i + 4]
    skin(pos, ring(a[i], a[i + 1]), ring(a[i + 2], a[i + 3]), next === undefined || next > a[i + 2] + 1e-4)
  }
  return fromPositions(pos)
}

/** A tapering cylinder of flat ribs with a narrow groove between them: args [top radius / bottom radius, flutes, groove depth as a fraction of the radius], unit space. */
function flutedGeometry(a: number[]): THREE.BufferGeometry {
  const [top, flutes, depth] = a
  const ring = (y: number, r: number) => {
    const pts: number[] = []
    for (let k = 0; k < flutes; k++) {
      for (const [f, rr] of [[0, r], [0.72, r], [0.8, r * (1 - depth)], [0.92, r * (1 - depth)]]) {
        const th = ((k + f) / flutes) * Math.PI * 2
        pts.push(rr * Math.cos(th), y, rr * Math.sin(th))
      }
    }
    return pts
  }
  const pos: number[] = []
  skin(pos, ring(-0.5, 0.5), ring(0.5, 0.5 * top), true)
  return fromPositions(pos)
}

/**
 * Flat panels standing tangent to a unit drum (radius 0.5, height 1), for painted-on openings: args [bays, panel width,
 * arch rise as a fraction of the height (0 = square head), panels per bay, angle between panels in a bay].
 */
function arcadeGeometry(a: number[]): THREE.BufferGeometry {
  const [bays, width, rise, group = 1, pitch = 0] = a
  const outline = archOutline(width, -0.5, 0.5, rise)
  const pos: number[] = []
  for (let k = 0; k < bays; k++) {
    for (let j = 0; j < group; j++) {
      const th = (k / bays) * Math.PI * 2 + (j - (group - 1) / 2) * pitch
      const at = ([u, v]: [number, number]) => [0.5 * Math.cos(th) - u * Math.sin(th), v, 0.5 * Math.sin(th) + u * Math.cos(th)]
      const c = at([0, 0])
      for (let i = 0; i < outline.length; i++) pos.push(...c, ...at(outline[(i + 1) % outline.length]), ...at(outline[i]))
    }
  }
  return fromPositions(pos)
}

/**
 * Flat openings on the walls of a unit box: args [openings per row, opening width, arch rise (0 = square head), rows, gap
 * between rows, axis (0: walls face z, 1: walls face x), sides (1: + wall, -1: - wall, 0: both)], fractions of the box.
 */
function archesGeometry(a: number[]): THREE.BufferGeometry {
  const [n, width, rise, rows = 1, gap = 0, axis = 0, sides = 0] = a
  const rowH = (1 - gap * (rows - 1)) / rows
  const pos: number[] = []
  for (const side of sides === 0 ? [-1, 1] : [sides]) {
    // seen from outside, u runs to the right: that is +x on the +z wall and -z on the +x wall
    const at = ([u, v]: [number, number]) => (axis ? [side * 0.5, v, -side * u] : [side * u, v, side * 0.5])
    for (let r = 0; r < rows; r++) {
      const v0 = -0.5 + r * (rowH + gap)
      for (let k = 0; k < n; k++) {
        const c = -0.5 + (k + 0.5) / n
        const outline = archOutline(width, v0, v0 + rowH, rise).map(([u, v]) => [u + c, v] as [number, number])
        const mid = at([c, v0 + rowH / 2])
        for (let i = 0; i < outline.length; i++) pos.push(...mid, ...at(outline[i]), ...at(outline[(i + 1) % outline.length]))
      }
    }
  }
  return fromPositions(pos)
}

/**
 * A ring of `n` flat walls (unit space: corners at radius 0.5, height 1), each pierced by a real arched opening standing on
 * the floor: args [n, wall thickness, opening width, opening height, arch rise], the first two as fractions of the diameter,
 * the last two of the height. One face looks down +z.
 */
function ringwallGeometry(a: number[]): THREE.BufferGeometry {
  const [n, t, w, top, rise] = a
  const half = 0.5 * Math.sin(Math.PI / n), inradius = 0.5 * Math.cos(Math.PI / n)
  const wall = new THREE.ExtrudeGeometry(archFace(half, w, top, rise), { depth: t, bevelEnabled: false }).translate(0, 0, inradius - t)
  const pos: number[] = []
  for (let k = 0; k < n; k++) {
    const g = wall.clone().rotateY((k / n) * Math.PI * 2)
    pos.push(...((g.index ? g.toNonIndexed() : g).getAttribute('position').array as Float32Array))
  }
  return fromPositions(pos)
}

/** One such wall filling the unit box, the opening running through it along z (a gateway): args [opening width, opening height, arch rise]. */
function archwallGeometry(a: number[]): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(archFace(0.5, a[0], a[1], a[2]), { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5)
  return fromPositions([...((g.index ? g.toNonIndexed() : g).getAttribute('position').array as Float32Array)])
}

/** A wall face `2 * half` wide and 1 tall as one outline, the arched opening notched out of its bottom edge (a hole touching the edge won't triangulate). */
function archFace(half: number, w: number, top: number, rise: number): THREE.Shape {
  const face = new THREE.Shape()
  face.moveTo(-half, -0.5)
  const [sill, ...arch] = archOutline(w, -0.5, -0.5 + top, rise)
  for (const [u, v] of [sill, ...arch.reverse()]) face.lineTo(u, v)
  face.lineTo(half, -0.5)
  face.lineTo(half, 0.5)
  face.lineTo(-half, 0.5)
  return face
}

interface PlanBox { cx: number; cz: number; sx: number; sz: number }
function planBox(pts: [number, number][], pad = 0): PlanBox {
  const xs = pts.map((q) => q[0]), zs = pts.map((q) => q[1])
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, z0 = Math.min(...zs) - pad, z1 = Math.max(...zs) + pad
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, sx: x1 - x0, sz: z1 - z0 }
}

const columnSpots = (a: number[]): [number, number][] => Array.from({ length: (a.length - 1) / 2 }, (_, i) => [a[1 + i * 2], a[2 + i * 2]])

/** Eight-sided columns (no caps: something always sits on them) at model-space spots, squeezed into the unit box of their own bounds: args [radius, x, z, x, z, ...]. */
function columnsGeometry(a: number[]): THREE.BufferGeometry {
  const r = a[0], spots = columnSpots(a), b = planBox(spots, r)
  const pos: number[] = []
  for (const [x, z] of spots) {
    const ring = (y: number) => Array.from({ length: 8 }, (_, i) => [(x + r * Math.cos((i * Math.PI) / 4) - b.cx) / b.sx, y, (z + r * Math.sin((i * Math.PI) / 4) - b.cz) / b.sz]).flat()
    skin(pos, ring(-0.5), ring(0.5), false)
  }
  return fromPositions(pos)
}

/** Inner and outer plan outlines of each sector in args [ri, ro, from, to, from, to, ...] (model units, radians from -z towards +x), optionally grown. */
function sectorRings(a: number[], grow = 0) {
  const [ri, ro] = a, out: { inner: [number, number][]; outer: [number, number][] }[] = []
  for (let i = 2; i + 1 < a.length; i += 2) {
    const pad = grow / ((ri + ro) / 2), a0 = a[i] - pad, a1 = a[i + 1] + pad
    const n = Math.max(1, Math.ceil((a1 - a0) / (Math.PI / 36)))
    const at = (r: number) => Array.from({ length: n + 1 }, (_, j): [number, number] => [r * Math.sin(a0 + ((a1 - a0) * j) / n), -r * Math.cos(a0 + ((a1 - a0) * j) / n)])
    out.push({ inner: at(ri - grow), outer: at(ro + grow) })
  }
  return out
}

/** Walls, ends and roof of those sectors, in the unit box of the ungrown part (a grown hull is scaled up by the same amount when drawn). */
function sectorGeometry(a: number[], grow: number): THREE.BufferGeometry {
  const b = planBox(sectorRings(a).flatMap((s) => [...s.inner, ...s.outer]))
  const sx = b.sx + 2 * grow, sz = b.sz + 2 * grow
  const pos: number[] = []
  const v = ([x, z]: [number, number], y: number) => [(x - b.cx) / sx, y, (z - b.cz) / sz]
  const quad = (p0: number[], p1: number[], p2: number[], p3: number[]) => pos.push(...p0, ...p1, ...p2, ...p1, ...p3, ...p2)
  for (const { inner, outer } of sectorRings(a, grow)) {
    const n = outer.length - 1
    for (let j = 0; j < n; j++) {
      quad(v(outer[j], -0.5), v(outer[j], 0.5), v(outer[j + 1], -0.5), v(outer[j + 1], 0.5))
      quad(v(inner[j + 1], -0.5), v(inner[j + 1], 0.5), v(inner[j], -0.5), v(inner[j], 0.5))
      quad(v(outer[j], 0.5), v(inner[j], 0.5), v(outer[j + 1], 0.5), v(inner[j + 1], 0.5))
    }
    quad(v(outer[0], -0.5), v(inner[0], -0.5), v(outer[0], 0.5), v(inner[0], 0.5))
    quad(v(inner[n], -0.5), v(outer[n], -0.5), v(inner[n], 0.5), v(outer[n], 0.5))
  }
  return fromPositions(pos)
}

const blockList = (a: number[]) => Array.from({ length: (a.length - 1) / 6 }, (_, i) => a.slice(1 + i * 6, 7 + i * 6))
function blocksBox(a: number[]) {
  const list = blockList(a)
  const plan = planBox(list.flatMap(([x, z, w, l]): [number, number][] => [[x - w / 2, z - l / 2], [x + w / 2, z + l / 2]]))
  const y0 = Math.min(...list.map((b) => b[4])), y1 = Math.max(...list.map((b) => b[5]))
  return { ...plan, cy: (y0 + y1) / 2, sy: y1 - y0 }
}

/** Boxes (args[0] = 0), gabled roofs with the ridge along z (1) or x (2), or pyramids (3), each [x, z, width, length, y0, y1], in the unit box of the ungrown part. */
function blocksGeometry(a: number[], grow: number): THREE.BufferGeometry {
  const f = blocksBox(a), g = grow
  const pos: number[] = []
  const v = (x: number, y: number, z: number) => [(x - f.cx) / (f.sx + 2 * g), (y - f.cy) / (f.sy + 2 * g), (z - f.cz) / (f.sz + 2 * g)]
  const quad = (p0: number[], p1: number[], p2: number[], p3: number[]) => pos.push(...p0, ...p1, ...p2, ...p1, ...p3, ...p2)
  for (const [x, z, w, l, ya, yb] of blockList(a)) {
    const x0 = x - w / 2 - g, x1 = x + w / 2 + g, z0 = z - l / 2 - g, z1 = z + l / 2 + g, y0 = ya - g, y1 = yb + g
    if (a[0] === 1) {
      quad(v(x1, y0, z0), v(x, y1, z0), v(x1, y0, z1), v(x, y1, z1))
      quad(v(x0, y0, z1), v(x, y1, z1), v(x0, y0, z0), v(x, y1, z0))
      pos.push(...v(x1, y0, z1), ...v(x, y1, z1), ...v(x0, y0, z1), ...v(x0, y0, z0), ...v(x, y1, z0), ...v(x1, y0, z0))
      continue
    }
    if (a[0] === 2) {
      quad(v(x1, y0, z1), v(x1, y1, z), v(x0, y0, z1), v(x0, y1, z))
      quad(v(x0, y0, z0), v(x0, y1, z), v(x1, y0, z0), v(x1, y1, z))
      pos.push(...v(x1, y0, z0), ...v(x1, y1, z), ...v(x1, y0, z1), ...v(x0, y0, z1), ...v(x0, y1, z), ...v(x0, y0, z0))
      continue
    }
    if (a[0] === 3) {
      const top = v(x, y1, z)
      pos.push(...v(x1, y0, z0), ...top, ...v(x1, y0, z1), ...v(x0, y0, z1), ...top, ...v(x0, y0, z0))
      pos.push(...v(x1, y0, z1), ...top, ...v(x0, y0, z1), ...v(x0, y0, z0), ...top, ...v(x1, y0, z0))
      continue
    }
    quad(v(x1, y0, z0), v(x1, y1, z0), v(x1, y0, z1), v(x1, y1, z1))
    quad(v(x0, y0, z1), v(x0, y1, z1), v(x0, y0, z0), v(x0, y1, z0))
    quad(v(x1, y0, z1), v(x1, y1, z1), v(x0, y0, z1), v(x0, y1, z1))
    quad(v(x0, y0, z0), v(x0, y1, z0), v(x1, y0, z0), v(x1, y1, z0))
    quad(v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z0), v(x1, y1, z1))
  }
  return fromPositions(pos)
}

/**
 * Lettering: thick straight strokes standing in the x-y plane, `depth` deep, as one part (always `detail`). Segments are
 * [x0, y0, x1, y1] in model units; the part is normalised to their bounds like `blocks`.
 */
const strokes = (segs: number[][], thick: number, depth: number, z: number, color: string): Part => {
  const xs = segs.flatMap((s) => [s[0], s[2]]), ys = segs.flatMap((s) => [s[1], s[3]])
  const x0 = Math.min(...xs) - thick, x1 = Math.max(...xs) + thick, y0 = Math.min(...ys) - thick, y1 = Math.max(...ys) + thick
  const c = [(x0 + x1) / 2, (y0 + y1) / 2], s = [x1 - x0, y1 - y0]
  return { geo: 'strokes', pos: [c[0], c[1], z], scale: [s[0], s[1], depth], color, detail: true, args: [r4(c[0]), r4(c[1]), r4(s[0]), r4(s[1]), r4(thick), ...segs.flat().map(r4)] }
}
function strokesGeometry(a: number[]): THREE.BufferGeometry {
  const [cx, cy, sx, sy, t] = a
  const pos: number[] = []
  const quad = (p0: number[], p1: number[], p2: number[], p3: number[]) => pos.push(...p0, ...p1, ...p2, ...p1, ...p3, ...p2)
  for (let i = 5; i + 3 < a.length; i += 4) {
    const [xa, ya, xb, yb] = a.slice(i, i + 4)
    const len = Math.hypot(xb - xa, yb - ya) || 1e-6, ux = (xb - xa) / len, uy = (yb - ya) / len
    // a box in the stroke's own frame (along, across, depth), which is right-handed like x, y, z, so the faces keep their winding
    const v = (u: number, n: number, d: number) => [((xa + xb) / 2 + u * ux - n * uy - cx) / sx, ((ya + yb) / 2 + u * uy + n * ux - cy) / sy, d]
    const u0 = -len / 2 - t / 2, u1 = len / 2 + t / 2, n0 = -t / 2, n1 = t / 2, d0 = -0.5, d1 = 0.5
    quad(v(u1, n0, d0), v(u1, n1, d0), v(u1, n0, d1), v(u1, n1, d1))
    quad(v(u0, n0, d1), v(u0, n1, d1), v(u0, n0, d0), v(u0, n1, d0))
    quad(v(u1, n0, d1), v(u1, n1, d1), v(u0, n0, d1), v(u0, n1, d1))
    quad(v(u0, n0, d0), v(u0, n1, d0), v(u1, n0, d0), v(u1, n1, d0))
    quad(v(u0, n1, d0), v(u0, n1, d1), v(u1, n1, d0), v(u1, n1, d1))
    quad(v(u0, n0, d0), v(u1, n0, d0), v(u0, n0, d1), v(u1, n0, d1))
  }
  return fromPositions(pos)
}

/** A stroke font for the few letters a sign needs: polylines in em units (baseline 0, cap height 1, x-height 0.62) and an advance. */
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] })
const GLYPHS: Record<string, { w: number; lines: [number, number][][] }> = {
  G: { w: 0.86, lines: [[...arc(0.43, 0.5, 0.43, 0.5, 48, 340, 14), [0.84, 0.42], [0.52, 0.42]]] },
  h: { w: 0.52, lines: [[[0, 0], [0, 1]], [[0, 0.36], ...arc(0.26, 0.38, 0.26, 0.24, 165, 0, 6), [0.52, 0]]] },
  i: { w: 0, lines: [[[0, 0], [0, 0.62]], [[0, 0.8], [0, 0.9]]] },
  r: { w: 0.34, lines: [[[0, 0], [0, 0.62]], arc(0.26, 0.36, 0.26, 0.26, 170, 70, 5)] },
  a: { w: 0.48, lines: [arc(0.24, 0.2, 0.24, 0.2, 0, 360, 12), [[0.48, 0], ...arc(0.24, 0.4, 0.24, 0.22, 0, 150, 5)]] },
  d: { w: 0.5, lines: [arc(0.25, 0.31, 0.25, 0.31, 0, 360, 14), [[0.5, 0], [0.5, 1]]] },
  e: { w: 0.5, lines: [[[0, 0.31], [0.5, 0.31], ...arc(0.25, 0.31, 0.25, 0.31, 0, 320, 12)]] },
  l: { w: 0, lines: [[[0, 0], [0, 1]]] },
}
/** Lay `text` out as stroke segments centred on x = cx, baseline y, reading correctly from -z (so it runs towards -x). */
function signText(text: string, em: number, cx: number, y: number) {
  const gap = 0.24, placed: [number, number][][] = []
  let pen = 0
  for (const ch of text) {
    const gl = GLYPHS[ch]
    for (const line of gl.lines) placed.push(line.map(([u, v]) => [pen + u, v]))
    pen += gl.w + gap
  }
  const width = (pen - gap) * em
  const segs: number[][] = []
  for (const line of placed) for (let i = 0; i + 1 < line.length; i++) {
    const [ua, va] = line[i], [ub, vb] = line[i + 1]
    segs.push([cx + width / 2 - ua * em, y + va * em, cx + width / 2 - ub * em, y + vb * em])
  }
  return { segs, x0: cx - width / 2, x1: cx + width / 2 }
}

/** An opening's outline, anticlockwise in (u, v): a rectangle from v0 up, closed by a semicircular head of height `rise` under v1. */
function archOutline(width: number, v0: number, v1: number, rise: number): [number, number][] {
  const pts: [number, number][] = [[-width / 2, v0], [width / 2, v0], [width / 2, v1 - rise]]
  if (rise > 0) for (let i = 1; i < 8; i++) pts.push([(width / 2) * Math.cos((i * Math.PI) / 8), v1 - rise + rise * Math.sin((i * Math.PI) / 8)])
  pts.push([-width / 2, v1 - rise])
  return pts
}

/** Side faces between two rings of equal length (xyz triples running anticlockwise seen from below, i.e. x = cos, z = sin), plus an optional top cap fanned from the axis. */
function skin(pos: number[], lo: number[], hi: number[], cap: boolean) {
  const n = lo.length / 3
  const v = (p: number[], i: number) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]
  for (let j = 0; j < n; j++) {
    const j2 = (j + 1) % n
    pos.push(...v(lo, j), ...v(hi, j), ...v(lo, j2), ...v(hi, j), ...v(hi, j2), ...v(lo, j2))
    if (cap) pos.push(0, hi[1], 0, ...v(hi, j2), ...v(hi, j))
  }
}

function fromPositions(pos: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}
