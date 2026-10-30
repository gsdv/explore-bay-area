/**
 * Bakes the Twin Peaks model's ground into src/scene/twinPeaksData.ts (run once: `pnpm tsx scripts/twinpeaks.ts`; both
 * sources are cached in data-cache/, so a re-run is offline).
 *
 * The app's heightmap (≈77 m pixels) melts the two summits into one blob ~25 m too low, so the model brings its own hill:
 * AWS Terrain Tiles at zoom 15 (≈4 m pixels here, USGS 3DEP underneath) resampled to a 15 m grid over the Twin Peaks
 * Natural Area, with Twin Peaks Boulevard's bench cut into it. OSM gives the natural area's outline (how far the hill rises
 * out of the city's terrain), the figure-eight of the boulevard, the trails and stairs, Christmas Tree Point's car parks
 * and the two summits. Everything is written in the landmark's local frame (world units, x east, z south, origin at the
 * landmark's lat/lng in src/data/landmarks.ts); heights stay metres so the model can apply the terrain exaggeration.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { cachedDownload, log, ROOT } from './lib/util.ts'
import { overpass } from './lib/overpass.ts'
import { project, UNIT } from '../src/lib/geo.ts'
import { landmarks } from '../src/data/landmarks.ts'

const tp = landmarks.find((l) => l.id === 'twinpeaks')!
const [ox, oz] = project(tp.lat, tp.lng)
const local = (lat: number, lng: number): [number, number] => {
  const [x, z] = project(lat, lng)
  return [(x - ox) / UNIT, (z - oz) / UNIT] // metres
}
// the grid, metres in the local frame: the natural area plus a margin for the hill to sink back into the city's terrain
const STEP = 15, X0 = -270, X1 = 330, Z0 = -495, Z1 = 480
const NX = Math.round((X1 - X0) / STEP) + 1, NZ = Math.round((Z1 - Z0) / STEP) + 1

// ---------------------------------------------------------------- elevation
const Z = 15, N = 2 ** Z
const tileX = (lng: number) => ((lng + 180) / 360) * N
const tileY = (lat: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N }
const corners = [[Z0, X0], [Z0, X1], [Z1, X0], [Z1, X1]].map(([z, x]) => {
  // invert the local frame near the origin (metres per degree from the projection itself)
  const d = 1e-3, [ax, az] = local(tp.lat + d, tp.lng + d)
  return [tp.lat + (z / az) * d, tp.lng + (x / ax) * d]
})
const tx0 = Math.floor(Math.min(...corners.map((c) => tileX(c[1])))), tx1 = Math.floor(Math.max(...corners.map((c) => tileX(c[1]))))
const ty0 = Math.floor(Math.min(...corners.map((c) => tileY(c[0])))), ty1 = Math.floor(Math.max(...corners.map((c) => tileY(c[0]))))
const tiles = new Map<string, Float32Array>()
for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
  const buf = await cachedDownload(`terrarium-${Z}-${x}-${y}.png`, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`)
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  const h = new Float32Array(256 * 256)
  for (let i = 0; i < h.length; i++) h[i] = data[i * info.channels] * 256 + data[i * info.channels + 1] + data[i * info.channels + 2] / 256 - 32768
  tiles.set(`${x},${y}`, h)
}
const px = (gx: number, gy: number) => tiles.get(`${Math.floor(gx / 256)},${Math.floor(gy / 256)}`)![(gy % 256) * 256 + (gx % 256)]
function demAt(lat: number, lng: number) {
  const fx = tileX(lng) * 256 - 0.5, fy = tileY(lat) * 256 - 0.5
  const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy
  return (px(ix, iy) * (1 - tx) + px(ix + 1, iy) * tx) * (1 - ty) + (px(ix, iy + 1) * (1 - tx) + px(ix + 1, iy + 1) * tx) * ty
}
// local metres -> lat/lng, through the same small linearisation
const dLat = 1e-3, [mx, mz] = local(tp.lat + dLat, tp.lng + dLat)
const toLatLng = (x: number, z: number): [number, number] => [tp.lat + (z / mz) * dLat, tp.lng + (x / mx) * dLat]
const elev = (x: number, z: number) => demAt(...toLatLng(x, z))

// ---------------------------------------------------------------- OSM
const [s, w] = toLatLng(X0, Z1), [n, e] = toLatLng(X1, Z0)
const bb = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`
const osm = await overpass('twinpeaks', `(way["highway"](${bb});way["amenity"="parking"](${bb});way["leisure"="park"](${bb});way["natural"](${bb});node["natural"="peak"](${bb});node["tourism"="viewpoint"](${bb}););out geom tags;`, 90)
type Way = { id: number; tags: Record<string, string>; pts: [number, number][] }
const ways: Way[] = osm.elements.filter((el: any) => el.type === 'way').map((el: any) => ({ id: el.id, tags: el.tags ?? {}, pts: el.geometry.map((g: any) => local(g.lat, g.lon)) }))
const nodes = osm.elements.filter((el: any) => el.type === 'node')

// the hill covers the natural area plus what it leaves out on top: the boulevard between its two polygons and Christmas
// Tree Point's car park, then a 20 m closing smooths the outline
const area = ways.filter((wy) => wy.tags.leisure === 'park' && /scrub/.test(wy.tags.natural ?? '') && wy.pts.length > 20)
log('natural area pieces:', area.map((a) => a.id).join(', '))
const inRing = (r: [number, number][], x: number, z: number) => {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, az] = r[i], [bx, bz] = r[j]
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c
  }
  return c
}
const segDist = (x: number, z: number, [ax, az]: [number, number], [bx, bz]: [number, number]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(x - ax - dx * t, z - az - dz * t)
}
const R = 5, RX = Math.round((X1 - X0) / R) + 1, RZ = Math.round((Z1 - Z0) / R) + 1
let cells = new Uint8Array(RX * RZ)
for (let j = 0; j < RZ; j++) for (let i = 0; i < RX; i++) cells[j * RX + i] = +area.some((a) => inRing(a.pts, X0 + i * R, Z0 + j * R))
const morph = (src: Uint8Array, rad: number, grow: boolean) => {
  const out = new Uint8Array(src.length), k = Math.ceil(rad / R)
  for (let j = 0; j < RZ; j++) for (let i = 0; i < RX; i++) {
    let hit = !grow
    for (let dj = -k; dj <= k && hit !== grow; dj++) for (let di = -k; di <= k; di++) {
      if (di * di + dj * dj > k * k) continue
      const v = src[Math.min(RZ - 1, Math.max(0, j + dj)) * RX + Math.min(RX - 1, Math.max(0, i + di))]
      if (grow ? v : !v) { hit = grow; break }
    }
    out[j * RX + i] = +hit
  }
  return out
}
/** signed distance to the area's edge, metres (positive inside), searched out to 60 m */
function edgeDistance(x: number, z: number) {
  const ci = Math.round((x - X0) / R), cj = Math.round((z - Z0) / R), k = 12
  const inside = cells[Math.min(RZ - 1, Math.max(0, cj)) * RX + Math.min(RX - 1, Math.max(0, ci))]
  let best = k * R
  for (let dj = -k; dj <= k; dj++) for (let di = -k; di <= k; di++) {
    const i = ci + di, j = cj + dj
    const v = i < 0 || j < 0 || i >= RX || j >= RZ ? 0 : cells[j * RX + i]
    if (v !== inside) best = Math.min(best, Math.hypot(di, dj) * R)
  }
  return inside ? best : -best
}
const near = (pt: [number, number]) => edgeDistance(...pt) > -25
const corridors = ways.filter((wy) => /^(Twin Peaks Boulevard|Christmas Tree Point Road)$/.test(wy.tags.name ?? ''))
  .flatMap((wy) => wy.pts.slice(1).map((b, k): [[number, number], [number, number]] => [wy.pts[k], b]))
  .filter(([a, b]) => near(a) && near(b))
const carParks = ways.filter((wy) => wy.tags.amenity === 'parking' && wy.pts.some(near))
const extra = new Uint8Array(RX * RZ)
for (let j = 0; j < RZ; j++) for (let i = 0; i < RX; i++) {
  const x = X0 + i * R, z = Z0 + j * R
  extra[j * RX + i] = +(corridors.some(([a, b]) => segDist(x, z, a, b) < 10) || carParks.some((c) => inRing(c.pts, x, z) || c.pts.some((q, k) => k > 0 && segDist(x, z, c.pts[k - 1], q) < 8)))
}
cells = morph(morph(cells.map((v, k) => v | extra[k]), 20, true), 20, false)

// ---------------------------------------------------------------- lines
const inArea = (x: number, z: number) => edgeDistance(x, z) > -6
/** Douglas-Peucker, metres */
function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts
  let worst = 0, at = 0
  const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1], L = Math.hypot(bx - ax, bz - az) || 1
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L
    if (d > worst) { worst = d; at = i }
  }
  return worst < tol ? [pts[0], pts[pts.length - 1]] : [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)]
}
/** the runs of a way that lie on the hill (one point of overlap past each end, so it dips into the city's ground) */
function onHill(pts: [number, number][]): [number, number][][] {
  const runs: [number, number][][] = []
  let run: [number, number][] = []
  pts.forEach((p, i) => {
    const keep = inArea(...p) || (i > 0 && inArea(...pts[i - 1])) || (i < pts.length - 1 && inArea(...pts[i + 1]))
    if (keep) run.push(p)
    else if (run.length) { runs.push(run); run = [] }
  })
  if (run.length) runs.push(run)
  return runs.filter((r) => r.length > 1)
}
const pick = (test: (wy: Way) => boolean, tol = 1) => ways.filter(test).flatMap((wy) => onHill(wy.pts)).map((r) => simplify(r, tol))
// the figure-eight's east side has been car-free since 2020 (mapped as pedestrian, or as the promenade under construction)
const boulevard = (wy: Way) => /^(Twin Peaks Boulevard|Christmas Tree Point Road)$/.test(wy.tags.name ?? '')
const drive = pick((wy) => boulevard(wy) && wy.tags.motor_vehicle !== 'no')
const walk = pick((wy) => boulevard(wy) && wy.tags.motor_vehicle === 'no' && wy.pts.length > 2)
const isTrail = (wy: Way) => /^(footway|path|track)$/.test(wy.tags.highway) && !wy.tags.footway && !/^(Fredela Lane|Sutro Tower Trail)$/.test(wy.tags.name ?? '')
const trails = pick((wy) => isTrail(wy) && wy.pts.filter((p) => edgeDistance(...p) > 0).length > wy.pts.length / 2, 0.8)
const steps = pick((wy) => wy.tags.highway === 'steps' && !/Vista Lane/.test(wy.tags.name ?? '') && wy.pts.filter((p) => edgeDistance(...p) > 0).length > wy.pts.length / 2, 0.8)
/** a closed ring, simplified in two halves (its ends meet, which would collapse it) and left open */
const simplifyRing = (pts: [number, number][], tol: number) => {
  const open = pts.slice(0, -1), mid = Math.floor(open.length / 2)
  return [...simplify(open.slice(0, mid + 1), tol).slice(0, -1), ...simplify([...open.slice(mid), open[0]], tol).slice(0, -1)]
}
const lots = ways.filter((wy) => wy.tags.amenity === 'parking' && wy.pts.some((p) => inArea(...p))).map((wy) => simplifyRing(wy.pts, 0.8))
const woods = ways.filter((wy) => wy.tags.natural === 'wood' && wy.pts.some((p) => inArea(...p))).map((wy) => simplifyRing(wy.pts, 2))
log(`lines: ${drive.length} drive, ${walk.length} walk, ${trails.length} trails, ${steps.length} stairs, ${lots.length} car parks, ${woods.length} woods`)

// ---------------------------------------------------------------- the grid, with the boulevard's bench cut in
const dist2 = (x: number, z: number, [ax, az]: [number, number], [bx, bz]: [number, number]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
  return { d: Math.hypot(x - ax - dx * t, z - az - dz * t), t }
}
// each road's centreline elevation, smoothed along it (±15 m), so the bench runs level across the DEM's bumps
const benches = [...drive, ...walk].map((line) => {
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]))
  const at = (s: number): [number, number] => {
    let i = 0
    while (i < line.length - 2 && cum[i + 1] < s) i++
    const t = (s - cum[i]) / (cum[i + 1] - cum[i] || 1)
    return [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t]
  }
  const yAlong = (s: number) => {
    let sum = 0
    for (let k = -5; k <= 5; k++) sum += elev(...at(Math.min(cum[cum.length - 1], Math.max(0, s + k * 3))))
    return sum / 11
  }
  return { line, cum, yAlong }
})
const terraces = lots.map((ring) => ({ ring, y: ring.reduce((sum, p) => sum + elev(...p), 0) / ring.length }))
const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t) }
const heights: number[] = [], weights: number[] = []
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const x = X0 + i * STEP, z = Z0 + j * STEP
  // average a 3x3 of DEM samples over the cell, so the grid doesn't alias the 4 m source
  let h = 0
  for (const dz of [-5, 0, 5]) for (const dx of [-5, 0, 5]) h += elev(x + dx, z + dz) / 9
  let best = { d: Infinity, y: 0 }
  for (const b of benches) for (let k = 0; k + 1 < b.line.length; k++) {
    const { d, t } = dist2(x, z, b.line[k], b.line[k + 1])
    if (d < best.d) best = { d, y: b.yAlong(b.cum[k] + t * (b.cum[k + 1] - b.cum[k])) }
  }
  h += (best.y - h) * (1 - smooth(7, 17, best.d))
  // the car parks are level terraces
  for (const t of terraces) {
    let d = inRing(t.ring, x, z) ? 0 : Infinity
    for (let k = 0; k < t.ring.length; k++) d = Math.min(d, dist2(x, z, t.ring[k], t.ring[(k + 1) % t.ring.length]).d)
    h += (t.y - h) * (1 - smooth(4, 14, d))
  }
  heights.push(h)
  weights.push(smooth(-6, 24, edgeDistance(x, z)))
}

// ---------------------------------------------------------------- write
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const H0 = 100, HQ = 0.05 // heights: 2 characters each, metres = H0 + v * HQ
const hs = heights.map((h) => { const v = Math.max(0, Math.min(4095, Math.round((h - H0) / HQ))); return B64[v >> 6] + B64[v & 63] }).join('')
const ws = weights.map((v) => B64[Math.round(v * 63)]).join('')
const u = (m: number) => +(m * UNIT).toFixed(3)
const flat = (line: [number, number][]) => line.flatMap(([x, z]) => [u(x), u(z)])
const lines = (list: [number, number][][]) => `[\n${list.map((l) => `    [${flat(l).join(', ')}],`).join('\n')}\n  ]`
const wrap = (str: string) => str.match(/.{1,110}/g)!.map((row) => `    '${row}'`).join(' +\n')
const point = (tag: string, name: string) => {
  const nd = nodes.find((nd: any) => nd.tags?.[tag.split('=')[0]] === tag.split('=')[1] && nd.tags?.name === name)
  const [x, z] = local(nd.lat, nd.lon)
  return `[${u(x)}, ${u(z)}]`
}
const views = nodes.filter((nd: any) => nd.tags?.tourism === 'viewpoint').map((nd: any) => { const [x, z] = local(nd.lat, nd.lon); return `[${u(x)}, ${u(z)}]` })
const file = path.join(ROOT, 'src/scene/twinPeaksData.ts')
fs.writeFileSync(file, `// Generated by scripts/twinpeaks.ts from AWS Terrain Tiles (z${Z}) and OpenStreetMap: don't edit by hand.
// Local frame of the 'twinpeaks' landmark: world units (1 = 100 m), x east, z south, origin at its lat/lng.

/** the hill: a ${NX} x ${NZ} grid every ${STEP} m from (x0, z0), row by row from the north; heights in metres, see \`twinPeaksGrid\` */
export const GRID = {
  step: ${u(STEP)}, nx: ${NX}, nz: ${NZ}, x0: ${u(X0)}, z0: ${u(Z0)}, h0: ${H0}, hq: ${HQ},
  /** two base-64 digits per point: metres = h0 + value * hq; the boulevard's bench is already cut in */
  heights:
${wrap(hs)},
  /** one base-64 digit per point: how far the point is inside the natural area (0 outside, 63 deep inside) */
  inside:
${wrap(ws)},
}

/** Twin Peaks Boulevard and Christmas Tree Point Road (open to cars), as x, z pairs */
export const DRIVE: number[][] = ${lines(drive)}

/** the boulevard's east side, closed to cars since 2020 */
export const PROMENADE: number[][] = ${lines(walk)}

export const TRAILS: number[][] = ${lines(trails)}

export const STAIRS: number[][] = ${lines(steps)}

/** Christmas Tree Point's car parks (rings, last point not repeated) */
export const LOTS: number[][] = ${lines(lots)}

/** cypress and eucalyptus round the natural area (rings) */
export const WOODS: number[][] = ${lines(woods)}

export const EUREKA = ${point('natural=peak', 'Eureka Peak')}
export const NOE = ${point('natural=peak', 'Noe Peak')}
export const VIEWPOINTS: [number, number][] = [${views.join(', ')}]
`)
log('wrote', path.relative(ROOT, file), (fs.statSync(file).size / 1e3).toFixed(1), 'kB')
