/**
 * Composes everything in public/data from the cached sources (run `pnpm data:fetch` first, or let this fetch).
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import osmtogeojson from 'osmtogeojson'
import { log, OUT, seeded, writeJSON } from './lib/util.ts'
import * as osm from './lib/osm.ts'
import { buildLand } from './lib/land.ts'
import { buildHeightmap, writeHeightmap } from './lib/terrain.ts'
import { PX, polygonPath, linePath, svgDoc, rasterize } from './lib/svg.ts'
import { P, ROAD_STYLE, lerp, clamp01, smooth } from './lib/palette.ts'
import { project, toUV, elevationToY, BUILDING_EXAGGERATION, UNIT, WORLD } from '../src/lib/geo.ts'

const t0 = Date.now()
const land = await buildLand()
const hm = await buildHeightmap()

// ---------- 1. land mask ----------
log('rasterising land mask')
const landRaw = await rasterize(svgDoc(`<path fill="#fff" fill-rule="evenodd" d="${land.features.map((f) => polygonPath(f.geometry)).join('')}"/>`))
const landMask = new Uint8Array(PX * PX)
for (let i = 0; i < PX * PX; i++) landMask[i] = landRaw[i * 4 + 3]
await writeHeightmap(hm, landMask, PX)

// ---------- 2. parks ----------
log('parks')
const parksGeo = osmtogeojson(await osm.fetchParks()) as GeoJSON.FeatureCollection
let cityD = '', wildD = ''
for (const f of parksGeo.features) {
  if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue
  const p = f.properties ?? {}
  const wild = p.boundary || p.landuse === 'forest' || p.leisure === 'nature_reserve'
  if (wild) wildD += polygonPath(f.geometry)
  else cityD += polygonPath(f.geometry)
}
const parksRaw = await rasterize(
  svgDoc(`<path fill="#00ff00" fill-opacity="0.8" fill-rule="evenodd" d="${wildD}"/><path fill="#ff0000" fill-opacity="0.9" fill-rule="evenodd" d="${cityD}"/>`),
)

// ---------- 3. roads ----------
log('roads')
const roadsMajor = await osm.fetchRoadsMajor()
const roadsMinor = await osm.fetchRoadsMinorSF()
const roadWays: any[] = [...roadsMinor.elements, ...roadsMajor.elements].filter((e) => e.type === 'way' && e.geometry)
const order = ['living_street', 'unclassified', 'residential', 'tertiary', 'secondary', 'primary', 'trunk_link', 'trunk', 'motorway_link', 'motorway']
const byClass = new Map<string, string>()
for (const w of roadWays) {
  const cls = w.tags.highway
  if (!ROAD_STYLE[cls]) continue
  byClass.set(cls, (byClass.get(cls) ?? '') + linePath(w.geometry.map((g: any) => [g.lon, g.lat])))
}
let roadSvg = ''
for (const cls of order) {
  const d = byClass.get(cls)
  if (!d) continue
  const s = ROAD_STYLE[cls]
  roadSvg += `<path fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`
}
const roadsRaw = await rasterize(svgDoc(roadSvg))

// ---------- 4. compose map texture ----------
log('composing map texture')
const N = hm.size
const map = Buffer.alloc(PX * PX * 3)
for (let j = 0; j < PX; j++) {
  const v = (j + 0.5) / PX
  for (let i = 0; i < PX; i++) {
    const k = j * PX + i
    const u = (i + 0.5) / PX
    let r: number, g: number, b: number
    if (landMask[k] < 128) {
      ;[r, g, b] = P.water
    } else {
      const h = hm.sample(u, v)
      const s = 1.5 / N
      const dx = hm.sample(u + s, v) - hm.sample(u - s, v)
      const dz = hm.sample(u, v + s) - hm.sample(u, v - s)
      const slope = Math.hypot(dx, dz) / (2 * s * 80_000) // ~ metres per metre
      const t = smooth(clamp01((h - 25) / 220))
      const tp = smooth(clamp01((h - 450) / 400))
      r = lerp(lerp(P.sand[0], P.hill[0], t), P.peak[0], tp)
      g = lerp(lerp(P.sand[1], P.hill[1], t), P.peak[1], tp)
      b = lerp(lerp(P.sand[2], P.hill[2], t), P.peak[2], tp)
      // parks
      const pr = parksRaw[k * 4], pg = parksRaw[k * 4 + 1], pa = parksRaw[k * 4 + 3] / 255
      if (pa > 0.02) {
        const col = pr > pg ? P.parkCity : P.parkWild
        r = lerp(r, col[0], pa); g = lerp(g, col[1], pa); b = lerp(b, col[2], pa)
      }
      // hillshade-ish darkening on slopes
      const shade = 1 - 0.28 * clamp01(slope * 2.2)
      r *= shade; g *= shade; b *= shade
      // roads
      const ra = roadsRaw[k * 4 + 3] / 255
      if (ra > 0.02) {
        r = lerp(r, roadsRaw[k * 4], ra); g = lerp(g, roadsRaw[k * 4 + 1], ra); b = lerp(b, roadsRaw[k * 4 + 2], ra)
      }
    }
    map[k * 3] = r; map[k * 3 + 1] = g; map[k * 3 + 2] = b
  }
}
await sharp(map, { raw: { width: PX, height: PX, channels: 3 } }).webp({ quality: 90, effort: 5 }).toFile(path.join(OUT, 'map.webp'))
log('wrote map.webp', (fs.statSync(path.join(OUT, 'map.webp')).size / 1e6).toFixed(2), 'MB')
// a preview for eyeballing, and the same at web size for the minimap
await sharp(map, { raw: { width: PX, height: PX, channels: 3 } }).resize(1024).png().toFile(path.join('data-cache', 'map-preview.png'))
await sharp(map, { raw: { width: PX, height: PX, channels: 3 } }).resize(1024).webp({ quality: 78 }).toFile(path.join(OUT, 'map-small.webp'))
// shoreline outline in texture uv space for the minimap
const outline: number[][][] = []
const pushRing = (ring: number[][]) => {
  if (ring.length < 4) return
  outline.push(ring.map(([lng, lat]) => toUV(lat, lng).map((v) => Math.round(v * 1000) / 1000)))
}
for (const f of land.features) {
  const g = f.geometry
  if (g.type === 'Polygon') g.coordinates.forEach(pushRing)
  else if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach(pushRing))
}
writeJSON(path.join(OUT, 'outline.json'), outline)

const uvAt = (lat: number, lng: number) => toUV(lat, lng)
const maskAt = (lat: number, lng: number) => {
  const [u, v] = uvAt(lat, lng)
  const i = Math.min(PX - 1, Math.floor(v * PX)) * PX + Math.min(PX - 1, Math.floor(u * PX))
  return { land: landMask[i] > 127, park: parksRaw[i * 4 + 3] > 40 }
}
const elevAt = (lat: number, lng: number) => {
  const [u, v] = uvAt(lat, lng)
  return hm.sample(u, v)
}

// ---------- 5. downtown buildings ----------
log('buildings')
function parseHeight(tags: any): number {
  if (tags.height) {
    const m = String(tags.height).match(/([\d.]+)\s*(m|ft|')?/)
    if (m) return m[2] === 'ft' || m[2] === "'" ? parseFloat(m[1]) * 0.3048 : parseFloat(m[1])
  }
  if (tags['building:levels']) return parseFloat(tags['building:levels']) * 3.6
  return 9
}
const bld = await osm.fetchBuildingsDowntown()
const buildings: { p: number[]; h: number; y: number }[] = []
for (const w of bld.elements) {
  if (w.type !== 'way' || !w.geometry || w.geometry.length < 4) continue
  const pts = w.geometry.slice(0, -1).map((g: any) => project(g.lat, g.lon))
  const cLat = w.geometry.reduce((s: number, g: any) => s + g.lat, 0) / w.geometry.length
  const cLng = w.geometry.reduce((s: number, g: any) => s + g.lon, 0) / w.geometry.length
  buildings.push({
    p: pts.flatMap(([x, z]: number[]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]),
    h: Math.round(parseHeight(w.tags) * 10) / 10,
    y: Math.round(elevationToY(elevAt(cLat, cLng)) * 100) / 100,
  })
}
writeJSON(path.join(OUT, 'buildings.json'), buildings)

// ---------- 6. procedural filler blocks along streets ----------
log('filler blocks')
const rnd = seeded(7)
const inBox = (lat: number, lng: number, b: { south: number; west: number; north: number; east: number }) =>
  lat > b.south && lat < b.north && lng > b.west && lng < b.east
const fill: number[] = [] // x, y, z, w, d, h, rot
const M_LAT = 1 / 110_574, M_LNG = 1 / (111_320 * Math.cos((37.6 * Math.PI) / 180))
for (const w of roadWays) {
  const cls = w.tags.highway
  if (!/^(residential|unclassified|living_street|tertiary|secondary|primary)$/.test(cls)) continue
  const minor = /^(residential|unclassified|living_street)$/.test(cls)
  const halfRoad = minor ? 8 : cls === 'primary' ? 14 : 11
  const g = w.geometry
  let carry = 0
  for (let s = 0; s < g.length - 1; s++) {
    const a = g[s], b = g[s + 1]
    const dxm = (b.lon - a.lon) / M_LNG, dym = (b.lat - a.lat) / M_LAT
    const len = Math.hypot(dxm, dym)
    if (len < 1) continue
    const ux = dxm / len, uy = dym / len
    const inSF = inBox(a.lat, a.lon, osm.SF)
    const spacing = minor ? 58 : inSF ? 70 : 130
    const prob = inSF ? 1 : 0.45
    let d = carry
    while (d < len) {
      const cx = a.lon + ux * d * M_LNG, cy = a.lat + uy * d * M_LAT
      for (const side of [-1, 1]) {
        if (rnd() > prob) continue
        const depth = 11 + rnd() * 7
        const off = halfRoad + depth / 2 + 2
        const lng = cx + -uy * off * side * M_LNG, lat = cy + ux * off * side * M_LAT
        if (inBox(lat, lng, osm.DOWNTOWN)) continue
        const m = maskAt(lat, lng)
        if (!m.land || m.park) continue
        const wlen = spacing * (0.62 + rnd() * 0.2)
        let h = minor ? 7 + rnd() * 6 : 9 + rnd() * 14
        if (!minor && rnd() < 0.08) h = 25 + rnd() * 30
        const [x, z] = project(lat, lng)
        fill.push(x, elevationToY(elevAt(lat, lng)), z, wlen * UNIT, depth * UNIT, h * UNIT * BUILDING_EXAGGERATION, Math.atan2(-uy, ux))
      }
      d += spacing
    }
    carry = d - len
  }
}
fs.writeFileSync(path.join(OUT, 'filler.bin'), Buffer.from(new Float32Array(fill).buffer))
log('filler instances:', fill.length / 7)

// ---------- 7. transit ----------
log('transit')
const tr = await osm.fetchTransitRoutes()
type Route = { id: number; ref: string; name: string; network: string; mode: string; color: string; lines: number[][] }
const best = new Map<string, any>()
for (const r of tr.elements) {
  if (r.type !== 'relation') continue
  const t = r.tags ?? {}
  if (t.network === 'VTA' && t.route !== 'light_rail') continue
  const key = `${t.network}|${t.ref ?? t.name}`
  const ways = r.members.filter((m: any) => m.type === 'way' && m.geometry).length
  const prev = best.get(key)
  if (!prev || ways > prev.ways) best.set(key, { r, ways })
}
/** Clip an [x,y,z,...] polyline to the terrain rectangle; may split it into several lines. */
const HX = WORLD.width / 2 - 0.5, HZ = WORLD.depth / 2 - 0.5
const inside = (x: number, z: number) => x >= -HX && x <= HX && z >= -HZ && z <= HZ
function clipToWorld(line: number[]): number[][] {
  const out: number[][] = []
  let cur: number[] = []
  const flush = () => { if (cur.length >= 6) out.push(cur); cur = [] }
  const edgeHit = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    // Liang–Barsky on x/z, returns the entering/leaving parameter range [t0, t1]
    let t0 = 0, t1 = 1
    const dx = bx - ax, dz = bz - az
    for (const [p, q] of [[-dx, ax + HX], [dx, HX - ax], [-dz, az + HZ], [dz, HZ - az]]) {
      if (p === 0) { if (q < 0) return null; continue }
      const r = q / p
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r }
      else { if (r < t0) return null; if (r < t1) t1 = r }
    }
    const at = (t: number) => [ax + dx * t, ay + (by - ay) * t, az + dz * t].map((v) => Math.round(v * 100) / 100)
    return [t0, t1, at] as const
  }
  for (let i = 0; i + 5 < line.length; i += 3) {
    const [ax, ay, az, bx, by, bz] = [line[i], line[i + 1], line[i + 2], line[i + 3], line[i + 4], line[i + 5]]
    const ai = inside(ax, az), bi = inside(bx, bz)
    if (ai && bi) { if (!cur.length) cur.push(ax, ay, az); cur.push(bx, by, bz); continue }
    const hit = edgeHit(ax, ay, az, bx, by, bz)
    if (!hit) { flush(); continue }
    const [t0, t1, at] = hit
    if (ai && !bi) { if (!cur.length) cur.push(ax, ay, az); cur.push(...at(t1)); flush() }
    else if (!ai && bi) { flush(); cur.push(...at(t0), bx, by, bz) }
    else { flush(); cur.push(...at(t0), ...at(t1)); flush() }
  }
  flush()
  return out
}

const DEFAULT_COLOR: Record<string, string> = { bus: '#f08a3e', rail: '#d13c3c', cable: '#8b5a2b', ferry: '#2f7fb8' }
const routes: Route[] = []
for (const { r } of best.values()) {
  const t = r.tags
  const name: string = t.name ?? t.ref ?? ''
  let mode = 'bus'
  if (/cable/i.test(name) || /cable/i.test(t.route_master ?? '')) mode = 'cable'
  else if (t.route === 'ferry') mode = 'ferry'
  else if (/^(light_rail|subway|train|tram)$/.test(t.route)) mode = 'rail'
  const lines: number[][] = []
  for (const m of r.members) {
    if (m.type !== 'way' || !m.geometry || (m.role && /platform|stop/.test(m.role))) continue
    const line: number[] = []
    for (const g of m.geometry) {
      const [x, z] = project(g.lat, g.lon)
      line.push(Math.round(x * 100) / 100, Math.round((elevationToY(elevAt(g.lat, g.lon)) + 0.06) * 100) / 100, Math.round(z * 100) / 100)
    }
    if (line.length >= 6) lines.push(...clipToWorld(line))
  }
  if (!lines.length) continue
  routes.push({ id: r.id, ref: t.ref ?? '', name, network: t.network, mode, color: t.colour ?? DEFAULT_COLOR[mode], lines })
}
routes.sort((a, b) => a.network.localeCompare(b.network) || a.ref.localeCompare(b.ref, undefined, { numeric: true }))
writeJSON(path.join(OUT, 'transit.json'), routes)
log('routes:', routes.length, Object.entries(routes.reduce((o: any, r) => ((o[r.network + '/' + r.mode] = (o[r.network + '/' + r.mode] ?? 0) + 1), o), {})))

const st = await osm.fetchStations()
const stations: { name: string; network: string; x: number; y: number; z: number }[] = []
for (const n of st.elements) {
  const t = n.tags ?? {}
  const net = `${t.network ?? ''} ${t.operator ?? ''}`
  const network = /BART/i.test(net) ? 'BART' : /Caltrain/i.test(net) ? 'Caltrain' : /Muni|San Francisco Municipal/i.test(net) ? 'Muni' : null
  if (!network || !t.name) continue
  const [x, z] = project(n.lat, n.lon)
  stations.push({ name: t.name, network, x: +x.toFixed(2), y: +elevationToY(elevAt(n.lat, n.lon)).toFixed(2), z: +z.toFixed(2) })
}
writeJSON(path.join(OUT, 'stations.json'), stations)
log('stations:', stations.length, 'done in', ((Date.now() - t0) / 1000).toFixed(0), 's')
