/**
 * Bakes the Sausalito model's town into src/scene/sausalitoData.ts (run once: `pnpm tsx scripts/sausalito.ts`; the OSM query
 * is cached in data-cache/, so a re-run is offline).
 *
 * Sausalito is outside the detail areas, so the pipeline only has procedural filler there. The model brings the real town
 * instead: every OSM building footprint in Sausalito (the hillside houses, downtown, the Marinship sheds) and every floating
 * home at Waldo Point, each as the box that fits it best, plus the marina docks the model berths its boats along. Marin City,
 * across the freeway, is left out. Everything is written in the landmark's local frame (x east, z south, origin at the
 * landmark's lat/lng in src/data/landmarks.ts), positions in metres.
 */
import fs from 'node:fs'
import path from 'node:path'
import { log, ROOT } from './lib/util.ts'
import { overpass } from './lib/overpass.ts'
import { fitBox, ringArea } from './lib/footprints.ts'
import { project, UNIT } from '../src/lib/geo.ts'
import { landmarks } from '../src/data/landmarks.ts'

const lm = landmarks.find((l) => l.id === 'sausalito')!
const [ox, oz] = project(lm.lat, lm.lng)
const local = (lat: number, lng: number): [number, number] => {
  const [x, z] = project(lat, lng)
  return [(x - ox) / UNIT, (z - oz) / UNIT] // metres
}

const osm = await overpass(
  'sausalito',
  '(way["building"](37.842,-122.515,37.88,-122.47);way["man_made"~"^(pier|breakwater)$"](37.842,-122.515,37.88,-122.47););out geom;',
)

// ---------------------------------------------------------------- buildings
// The model draws these itself: the Spinnaker restaurant on its point
const SKIP = new Set([388154189])
const BIG = /^(commercial|retail|hotel|office|industrial|warehouse|religious|church|school|government|civic|public|boathouse|barge)$/
/** base-64 digits, as in twinPeaksData.ts */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const enc = (v: number, n: number) => {
  if (v < 0 || v >= 64 ** n) throw new Error(`${v} doesn't fit in ${n} digits`)
  let s = ''
  for (let i = n - 1; i >= 0; i--) s += B64[Math.floor(v / 64 ** i) % 64]
  return s
}
// positions are stored as metres + offset in two digits (0-4095): the box from Waldo Point's north end to Sausalito's south edge
const X_OFF = 2900, Z_OFF = 2560
const encodable = (x: number, z: number) => x + X_OFF >= 0 && x + X_OFF < 4096 && z + Z_OFF >= 0 && z + Z_OFF < 4096
let hash = 1
const rnd = () => ((hash = (hash * 16807) % 2147483647) / 2147483647)
const homes: { x: number; z: number }[] = []
const rows: string[] = []
let nHouse = 0, nBig = 0, nBoat = 0
for (const w of osm.elements) {
  if (w.type !== 'way' || !w.tags?.building || !w.geometry || SKIP.has(w.id)) continue
  const ring = w.geometry.slice(0, -1).map((g: any) => local(g.lat, g.lon))
  const box = fitBox(ring)
  if (!box) continue
  const t = w.tags.building, boat = t === 'houseboat'
  // Marin City, across the freeway from Sausalito's north end
  if (!boat && box.x < -2460 && box.z < -1150) continue
  if (!encodable(box.x, box.z)) continue
  const area = ringArea(ring)
  if (area < 22) continue // sheds
  // 0 house, 1 big (commercial, civic, the Marinship sheds), 2 floating home, 3 the Taj Mahal's dome
  const kind = boat ? (/taj mahal/i.test(w.tags.name ?? '') ? 3 : 2) : BIG.test(t) || area > 450 ? 1 : 0
  const tagged = parseInt(w.tags['building:levels'] ?? '', 10)
  const levels = Math.min(15, Math.max(1, tagged || (boat ? (rnd() < 0.3 ? 2 : 1) : kind === 1 ? (area > 1500 ? 2 : 2 + Math.round(rnd())) : area < 70 ? 1 : area > 260 ? 3 : rnd() < 0.7 ? 2 : 1)))
  const rot = ((box.rot % Math.PI) + Math.PI) % Math.PI
  rows.push(
    enc(Math.round(box.x + X_OFF), 2) + enc(Math.round(box.z + Z_OFF), 2) +
    enc(Math.min(4095, Math.round(box.w * 10)), 2) + enc(Math.min(4095, Math.round(box.d * 10)), 2) +
    enc(Math.round((rot / Math.PI) * 64) % 64, 1) + enc(kind * 16 + levels, 1),
  )
  if (boat) { nBoat++; homes.push({ x: box.x, z: box.z }) } else if (kind === 1) nBig++
  else nHouse++
}
log('houses', nHouse, '· big', nBig, '· floating homes', nBoat)

// ---------------------------------------------------------------- docks
// open ways only (closed piers are the ferry landing's and the restaurants' decks, which the model draws). Kind 0 is a dock the
// model berths boats along, 1 a dock with floating homes along it, 2 a breakwater.
const docks: { kind: number; p: number[] }[] = []
const near = (p: [number, number][], h: { x: number; z: number }) => p.some((a, i) => {
  const b = p[i + 1]
  if (!b) return false
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((h.x - a[0]) * dx + (h.z - a[1]) * dz) / L2))
  return Math.hypot(a[0] + dx * t - h.x, a[1] + dz * t - h.z) < 14
})
for (const w of osm.elements) {
  if (w.type !== 'way' || !/^(pier|breakwater)$/.test(w.tags?.man_made ?? '') || !w.geometry) continue
  const g = w.geometry, first = g[0], last = g[g.length - 1]
  if (g.length > 3 && first.lat === last.lat && first.lon === last.lon) continue
  const p = g.map((q: any) => local(q.lat, q.lon)) as [number, number][]
  let len = 0
  for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  if (len < 12) continue
  const kind = w.tags.man_made === 'breakwater' ? 2 : homes.some((h) => near(p, h)) ? 1 : 0
  docks.push({ kind, p: p.flatMap(([x, z]) => [Math.round(x), Math.round(z)]) })
}
log('docks', docks.length, '· with floating homes', docks.filter((d) => d.kind === 1).length, '· breakwaters', docks.filter((d) => d.kind === 2).length)

const out = path.join(ROOT, 'src', 'scene', 'sausalitoData.ts')
fs.writeFileSync(out, `// Generated by scripts/sausalito.ts from OpenStreetMap: don't edit by hand.
// Local frame of the 'sausalito' landmark: x east, z south, origin at its lat/lng, in metres.

/**
 * Every building, ten base-64 digits each: x + ${X_OFF} and z + ${Z_OFF} (metres, two digits each), the long and short sides
 * (decimetres, two digits each), the long side's turn about +y (one digit, 64ths of a half turn), and kind * 16 + storeys
 * (kind 0 a house, 1 a big building, 2 a floating home, 3 the Taj Mahal houseboat).
 */
export const BUILDINGS = { xOff: ${X_OFF}, zOff: ${Z_OFF}, data:
${rows.join('').match(/.{1,120}/g)!.map((s) => `  '${s}'`).join(' +\n')},
}

/** docks and breakwaters as polylines [x, z, x, z, ...] in metres; kind 0 berths boats, 1 has floating homes along it, 2 is a breakwater */
export const DOCKS: { kind: 0 | 1 | 2; p: number[] }[] = [
${docks.map((d) => `  { kind: ${d.kind}, p: [${d.p.join(', ')}] },`).join('\n')}
]
`)
log('wrote', path.relative(ROOT, out), (fs.statSync(out).size / 1024).toFixed(1), 'KB')
