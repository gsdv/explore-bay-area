import * as THREE from 'three'
import type { Landmark } from '../data/landmarks'
import { project, UNIT, BUILDING_EXAGGERATION } from '../lib/geo'

export interface Part {
  geo: 'box' | 'cyl' | 'cone' | 'sphere' | 'ring' | 'stack' | 'fluted' | 'arcade' | 'arches' | 'ringwall' | 'columns' | 'sector' | 'blocks'
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
const shift = (p: Part, z: number): Part => ({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2] + z] })

/** Returns primitive parts in landmark-local space (y up, origin at ground). Bridges take the ground profile from `bridgeGround`. */
export function landmarkParts(l: Landmark, ground?: BridgeGround): Part[] {
  switch (l.kind) {
    case 'bridge': {
      const b = bridgeSpec(l, ground)
      const deckLen = b.x1 - b.x0, deckMid = (b.x0 + b.x1) / 2
      const parts: Part[] = [
        // deck with a slightly darker underside girder
        { geo: 'box', pos: [deckMid, b.deckH, 0], scale: [deckLen, 0.05, b.deckW], color: b.col },
        { geo: 'box', pos: [deckMid, b.deckH - 0.07, 0], scale: [deckLen, 0.09, b.deckW * 0.6], color: b.colDark },
      ]
      if (ground) {
        // abutments sunk into the hillside at both deck ends, and viaduct piers where the approaches run above land
        for (const x of [b.x0, b.x1]) {
          const g = Math.min(ground.groundY(x), b.deckH - 0.2)
          parts.push({ geo: 'box', pos: [x, (g - 0.3 + b.deckH) / 2, 0], scale: [0.5, b.deckH - g + 0.3, b.deckW + 0.2], color: b.pier })
        }
        for (const [from, to] of [[b.x0 + 0.9, 0], [b.len, b.x1 - 0.9]] as [number, number][]) {
          for (let x = from; x < to; x += 0.9) {
            const g = ground.groundY(x)
            if (g < 0 || g > b.deckH - 0.12) continue
            parts.push({ geo: 'box', pos: [x, (g + b.deckH) / 2, 0], scale: [0.2, b.deckH - g, b.deckW * 0.7], color: b.pier })
          }
        }
      }
      for (const t of b.towers) {
        const x = b.len * t
        // pier in the water, two legs, portal struts
        parts.push({ geo: 'box', pos: [x, b.deckH / 2, 0], scale: [0.34, b.deckH, b.deckW + 0.14], color: b.pier })
        for (const side of [-b.legZ, b.legZ]) parts.push({ geo: 'box', pos: [x, b.towerH / 2, side], scale: [0.13, b.towerH, 0.13], color: b.col })
        for (const f of [0.3, 0.52, 0.72, 0.9, 1.0]) parts.push({ geo: 'box', pos: [x, b.towerH * f - 0.05, 0], scale: [0.13, 0.1, b.legZ * 2 + 0.13], color: b.col })
      }
      for (const x of b.anchorsX) parts.push({ geo: 'box', pos: [x, b.deckH * 0.55, 0], scale: [0.36, b.deckH * 1.1, b.deckW + 0.2], color: b.pier })
      return parts
    }
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
    case 'arena':
      return [{ geo: 'cyl', pos: [0, 0.4, 0], scale: [1, 0.8, 1], color: '#e8e2d6', args: [1.1, 1.2, 24] }]
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
    case 'forest':
      return [0, 1, 2, 3, 4, 5].map((i) => ({
        geo: 'cone' as const,
        pos: [Math.cos(i * 1.7) * 0.6, 0.6 + (i % 2) * 0.2, Math.sin(i * 1.7) * 0.6],
        scale: [1, 1.2 + (i % 3) * 0.3, 1],
        color: i % 2 ? '#3f7a45' : '#4f8f52',
        args: [0.32, 7],
      }))
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
    case 'museum':
      return [
        { geo: 'box', pos: [0, 0.3, 0], scale: [1.4, 0.6, 0.8], color: '#e0d4bb' },
        { geo: 'box', pos: [0, 0.68, 0], scale: [1.5, 0.12, 0.9], color: '#a89f8c' },
      ]
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
    case 'street':
      return [
        { geo: 'box', pos: [0, 0.05, 0], rot: [0, 0, 0.18], scale: [0.9, 0.1, 0.5], color: '#f7f4ee' },
        { geo: 'box', pos: [-0.3, 0.16, -0.14], scale: [0.14, 0.14, 0.14], color: '#d96c9a' },
        { geo: 'box', pos: [0.05, 0.22, 0.12], scale: [0.14, 0.14, 0.14], color: '#7f8ed0' },
        { geo: 'box', pos: [0.32, 0.27, -0.1], scale: [0.14, 0.14, 0.14], color: '#e6a94f' },
      ]
    case 'gate':
      return [
        { geo: 'box', pos: [-0.35, 0.35, 0], scale: [0.12, 0.7, 0.12], color: '#2f8f5b' },
        { geo: 'box', pos: [0.35, 0.35, 0], scale: [0.12, 0.7, 0.12], color: '#2f8f5b' },
        { geo: 'box', pos: [0, 0.78, 0], scale: [1.0, 0.16, 0.3], color: '#c8402f' },
        { geo: 'box', pos: [0, 0.94, 0], scale: [0.7, 0.14, 0.26], color: '#2f8f5b' },
      ]
    case 'town':
      return [0, 1, 2, 3].map((i) => ({
        geo: 'box' as const,
        pos: [(i - 1.5) * 0.4, 0.2 + i * 0.05, (i % 2) * 0.3],
        scale: [0.3, 0.4 + i * 0.1, 0.3],
        color: ['#f3e6cf', '#e9d3b3', '#f7efe1', '#dfc9a9'][i],
      }))
  }
}

/** Ground profile under a bridge: how far the deck must run past each endpoint to reach the shore, and the terrain height along the axis. */
export interface BridgeGround {
  /** deck extension past the start (lat/lng) and end (lat2/lng2) endpoints, world units */
  start: number
  end: number
  /** terrain height (world y) at landmark-local x along the deck axis */
  groundY: (x: number) => number
}

/** Longest approach viaduct we will add past the first land under an endpoint (world units, 1 = 100 m). */
const MAX_APPROACH = 4

/**
 * Bridge endpoints are hand-placed and the baked shoreline is coarse, so a deck that stops exactly at its endpoints can end
 * over water. Walk outward along the axis until the terrain is land, then keep going (up to MAX_APPROACH) until the hillside
 * rises to the deck so the abutment buries into it.
 */
export function bridgeGround(l: Landmark, yAt: (x: number, z: number) => number): BridgeGround {
  const [x1, z1] = project(l.lat, l.lng)
  const [x2, z2] = project(l.lat2!, l.lng2!)
  const len = Math.hypot(x2 - x1, z2 - z1)
  const dx = (x2 - x1) / len, dz = (z2 - z1) / len
  const groundY = (x: number) => yAt(x1 + dx * x, z1 + dz * x)
  const { deckH } = bridgeSpec(l)
  const reach = (from: number, dir: 1 | -1) => {
    const step = 0.25
    let d = 0
    while (d < 12 && groundY(from + dir * d) < 0) d += step
    const shore = d
    while (d < shore + MAX_APPROACH && groundY(from + dir * d) < deckH - 0.05) d += step
    return d + 0.3
  }
  return { start: reach(0, -1), end: reach(len, 1), groundY }
}

interface BridgeSpec {
  len: number
  /** deck extent along the axis (x0 <= 0, x1 >= len once the ground profile is applied) */
  x0: number
  x1: number
  /** cable anchorage positions along the axis, moved onto land when the ground profile is known */
  anchorsX: number[]
  deckH: number
  deckW: number
  towerH: number
  legZ: number
  towers: number[]
  /** suspension spans as [fromTower, toTower] fractions of len; a span with equal ends is a single-tower (self-anchored) span */
  spans: [number, number][]
  /** cable anchorages as fractions of len (pairs with the nearest tower) */
  anchors: number[]
  col: string
  colDark: string
  pier: string
}

function bridgeSpec(l: Landmark, ground?: BridgeGround): BridgeSpec {
  const [x1, z1] = project(l.lat, l.lng)
  const [x2, z2] = project(l.lat2!, l.lng2!)
  const len = Math.hypot(x2 - x1, z2 - z1)
  const base = { len, x0: 0, x1: len, anchorsX: [] as number[], deckW: 0.34, legZ: 0.15, pier: '#cfc6b4' }
  const spec: BridgeSpec =
    l.id === 'ggb'
      ? { ...base, deckH: 0.95, towerH: 3.7, towers: [0.23, 0.77], spans: [[0.23, 0.77]], anchors: [0.06, 0.94], col: ORANGE, colDark: '#b83a08' }
      : { ...base, deckH: 0.62, towerH: 2.5, towers: [0.12, 0.28, 0.44, 0.78], spans: [[0.12, 0.28], [0.28, 0.44]], anchors: [0.03, 0.53, 0.64, 0.92], col: '#c9ccd1', colDark: '#8f949b' }
  if (ground) {
    spec.x0 = -ground.start
    spec.x1 = len + ground.end
  }
  spec.anchorsX = spec.anchors.map((a) => {
    let x = len * a
    if (!ground) return x
    // an anchorage standing in the water looks wrong: slide it away from its tower until it is on land (or at the deck end)
    const tower = spec.towers.reduce((best, t) => (Math.abs(t - a) < Math.abs(best - a) ? t : best), spec.towers[0])
    const dir = a < tower ? -1 : 1
    while (ground.groundY(x) < 0 && x > spec.x0 + 0.3 && x < spec.x1 - 0.3) x += dir * 0.25
    return x
  })
  return spec
}

/** Cables and suspenders as line segments [x,y,z,x,y,z,...] in landmark-local space (bridges only). */
export function landmarkLines(l: Landmark, ground?: BridgeGround): number[] {
  if (l.kind !== 'bridge') return []
  const b = bridgeSpec(l, ground)
  const out: number[] = []
  const seg = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => out.push(x1, y1, z1, x2, y2, z2)
  const top = b.towerH, deck = b.deckH + 0.03, mid = b.deckH + 0.32
  const cableY = (x: number, xa: number, xb: number) => {
    // parabola between tower tops xa..xb with the low point mid-span
    const xm = (xa + xb) / 2
    const t = (x - xm) / (xa - xm)
    return mid + (top - mid) * t * t
  }
  for (const side of [-b.legZ, b.legZ]) {
    for (const [fa, fb] of b.spans) {
      const xa = b.len * fa, xb = b.len * fb
      const n = 28
      let px = xa, py = top
      for (let i = 1; i <= n; i++) {
        const x = xa + ((xb - xa) * i) / n, y = cableY(x, xa, xb)
        seg(px, py, side, x, y, side)
        px = x; py = y
      }
      const ns = 18
      for (let i = 1; i < ns; i++) {
        const x = xa + ((xb - xa) * i) / ns
        seg(x, deck, side, x, cableY(x, xa, xb), side)
      }
    }
    // side spans: nearest tower top straight down to each anchorage, with a few suspenders
    b.anchorsX.forEach((xa, i) => {
      const fa = b.anchors[i]
      const tower = b.towers.reduce((best, t) => (Math.abs(t - fa) < Math.abs(best - fa) ? t : best), b.towers[0])
      const xt = b.len * tower
      seg(xt, top, side, xa, deck, side)
      for (let j = 1; j < 5; j++) {
        const x = xa + ((xt - xa) * j) / 5
        const y = deck + (top - deck) * (j / 5)
        seg(x, deck, side, x, y, side)
      }
    })
  }
  // tower cross-bracing above the deck
  for (const t of b.towers) {
    const x = b.len * t
    for (const f of [0.35, 0.58, 0.78]) {
      seg(x, b.towerH * f, -b.legZ, x, b.towerH * (f + 0.14), b.legZ)
      seg(x, b.towerH * f, b.legZ, x, b.towerH * (f + 0.14), -b.legZ)
    }
  }
  return out
}

/** `grow` (sectors and blocks only) returns the part's hover hull: the same shape offset outwards by that much in plan, in the part's own unit frame. */
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
    case 'columns': return columnsGeometry(a)
    case 'sector': return sectorGeometry(a, grow)
    case 'blocks': return blocksGeometry(a, grow)
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
  // the wall face as one outline with the opening notched out of its bottom edge (a hole touching the edge won't triangulate)
  const face = new THREE.Shape()
  face.moveTo(-half, -0.5)
  const [sill, ...arch] = archOutline(w, -0.5, -0.5 + top, rise)
  for (const [u, v] of [sill, ...arch.reverse()]) face.lineTo(u, v)
  face.lineTo(half, -0.5)
  face.lineTo(half, 0.5)
  face.lineTo(-half, 0.5)
  const wall = new THREE.ExtrudeGeometry(face, { depth: t, bevelEnabled: false }).translate(0, 0, inradius - t)
  const pos: number[] = []
  for (let k = 0; k < n; k++) {
    const g = wall.clone().rotateY((k / n) * Math.PI * 2)
    pos.push(...((g.index ? g.toNonIndexed() : g).getAttribute('position').array as Float32Array))
  }
  return fromPositions(pos)
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
