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
import { buildZctas, fetchRentByZip } from './lib/rent.ts'
import { buildHoods } from './lib/hoods.ts'
import polylabel from 'polylabel'
import { PX, FULL, polygonPath, linePath, svgDoc, rasterize, type View } from './lib/svg.ts'
import { P, ROAD_STYLE, heatColor, lerp, clamp01, smooth } from './lib/palette.ts'
import { project, toUV, elevationToY, BUILDING_EXAGGERATION, UNIT, WORLD, BBOX, SF_BBOX, SF_TEXTURE_SIZE } from '../src/lib/geo.ts'
import { RENT_ALPHA, rentClass, type RentData } from '../src/lib/rent.ts'
import { HOOD_TINTS, HOODS_ALPHA, type HoodsData } from '../src/lib/hoods.ts'
import { landmarks } from '../src/data/landmarks.ts'

const t0 = Date.now()
const land = await buildLand()
const hm = await buildHeightmap()

// ---------- 1. land mask ----------
log('rasterising land mask')
const landSvg = `<path fill="#fff" fill-rule="evenodd" d="${land.features.map((f) => polygonPath(f.geometry)).join('')}"/>`
const landRaw = await rasterize(svgDoc(landSvg))
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
const parksSvg = `<path fill="#00ff00" fill-opacity="0.8" fill-rule="evenodd" d="${wildD}"/><path fill="#ff0000" fill-opacity="0.9" fill-rule="evenodd" d="${cityD}"/>`
const parksRaw = await rasterize(svgDoc(parksSvg))

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
/** Paint `size`² pixels of the map over a window of PX space from the three rasterised layers (RGBA, same size and window). */
function composeMap(size: number, view: View, landPx: Buffer, parksPx: Buffer, roadsPx: Buffer): Buffer {
  const out = Buffer.alloc(size * size * 3)
  for (let j = 0; j < size; j++) {
    const v = (view.y + ((j + 0.5) / size) * view.h) / PX
    for (let i = 0; i < size; i++) {
      const k = j * size + i
      const u = (view.x + ((i + 0.5) / size) * view.w) / PX
      let r: number, g: number, b: number
      if (landPx[k * 4 + 3] < 128) {
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
        const pr = parksPx[k * 4], pg = parksPx[k * 4 + 1], pa = parksPx[k * 4 + 3] / 255
        if (pa > 0.02) {
          const col = pr > pg ? P.parkCity : P.parkWild
          r = lerp(r, col[0], pa); g = lerp(g, col[1], pa); b = lerp(b, col[2], pa)
        }
        // hillshade-ish darkening on slopes
        const shade = 1 - 0.28 * clamp01(slope * 2.2)
        r *= shade; g *= shade; b *= shade
        // roads
        const ra = roadsPx[k * 4 + 3] / 255
        if (ra > 0.02) {
          r = lerp(r, roadsPx[k * 4], ra); g = lerp(g, roadsPx[k * 4 + 1], ra); b = lerp(b, roadsPx[k * 4 + 2], ra)
        }
      }
      out[k * 3] = r; out[k * 3 + 1] = g; out[k * 3 + 2] = b
    }
  }
  return out
}
const map = composeMap(PX, FULL, landRaw, parksRaw, roadsRaw)
await sharp(map, { raw: { width: PX, height: PX, channels: 3 } }).webp({ quality: 90, effort: 5 }).toFile(path.join(OUT, 'map.webp'))
log('wrote map.webp', (fs.statSync(path.join(OUT, 'map.webp')).size / 1e6).toFixed(2), 'MB')
// the same layers again over San Francisco only, ~5x sharper: the terrain blends this inset over the regional texture
{
  const [u0, v0] = toUV(SF_BBOX.north, SF_BBOX.west), [u1, v1] = toUV(SF_BBOX.south, SF_BBOX.east)
  const view: View = { x: u0 * PX, y: v0 * PX, w: (u1 - u0) * PX, h: (v1 - v0) * PX }
  const S = SF_TEXTURE_SIZE
  const [l, p, r] = [await rasterize(svgDoc(landSvg, S, view)), await rasterize(svgDoc(parksSvg, S, view)), await rasterize(svgDoc(roadSvg, S, view))]
  await sharp(composeMap(S, view, l, p, r), { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 90, effort: 5 }).toFile(path.join(OUT, 'map-sf.webp'))
  log('wrote map-sf.webp', (fs.statSync(path.join(OUT, 'map-sf.webp')).size / 1e6).toFixed(2), 'MB')
}
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
// Landmarks whose model is the building itself: their OSM footprint would extrude as a prism around the model, so drop it.
const MODELLED = landmarks.filter((l) => l.kind === 'pyramid' || l.kind === 'tower' || l.kind === 'coit')
const contains = (ring: { lat: number; lon: number }[], lat: number, lng: number) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if (a.lat > lat !== b.lat > lat && lng < ((b.lon - a.lon) * (lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside
  }
  return inside
}
const bld = await osm.fetchBuildingsDowntown()
const buildings: { p: number[]; h: number; y: number }[] = []
for (const w of bld.elements) {
  if (w.type !== 'way' || !w.geometry || w.geometry.length < 4) continue
  if (MODELLED.some((l) => contains(w.geometry, l.lat, l.lng))) continue
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
log('stations:', stations.length)

// ---------- 8. restaurant density ----------
// Every place to eat becomes a point; the points are binned onto a grid, gaussian-blurred and mapped through the
// palette's heat ramp. The app drapes the result over the terrain as a translucent wash (scene/Heatmap.tsx).
log('restaurants')
const food = await osm.fetchFood()
const HPX = 2048
const HEAT_SIGMA_M = 260 // blur radius in metres: neighbourhood-scale blobs, not individual venues
const counts = new Float32Array(HPX * HPX)
let nFood = 0
for (const e of food.elements) {
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon
  if (lat == null || lon == null) continue
  const [u, v] = toUV(lat, lon)
  if (u < 0 || u >= 1 || v < 0 || v >= 1) continue
  counts[Math.floor(v * HPX) * HPX + Math.floor(u * HPX)] += 1
  nFood++
}
const sigma = HEAT_SIGMA_M / (WORLD.width / UNIT / HPX)
const R = Math.ceil(sigma * 3)
const kern = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / (2 * sigma * sigma)))
const kSum = kern.reduce((a, b) => a + b, 0)
for (let i = 0; i < kern.length; i++) kern[i] /= kSum
const tmp = new Float32Array(HPX * HPX), dens = new Float32Array(HPX * HPX)
for (let j = 0; j < HPX; j++) {
  for (let i = 0; i < HPX; i++) {
    let s = 0
    for (let k = -R; k <= R; k++) { const x = i + k; if (x >= 0 && x < HPX) s += counts[j * HPX + x] * kern[k + R] }
    tmp[j * HPX + i] = s
  }
}
for (let j = 0; j < HPX; j++) {
  for (let i = 0; i < HPX; i++) {
    let s = 0
    for (let k = -R; k <= R; k++) { const y = j + k; if (y >= 0 && y < HPX) s += tmp[y * HPX + i] * kern[k + R] }
    dens[j * HPX + i] = s
  }
}
// normalise: a gentle power curve so the outer neighbourhoods still register, clamped at the 99.5th percentile so
// downtown SF doesn't own the whole ramp
const nonZero = dens.filter((d) => d > 1e-4).sort()
const top = nonZero[Math.floor(nonZero.length * 0.995)] || 1
const heat = Buffer.alloc(HPX * HPX * 4)
for (let j = 0; j < HPX; j++) {
  const mj = Math.floor(((j + 0.5) / HPX) * PX) * PX
  for (let i = 0; i < HPX; i++) {
    const k = j * HPX + i
    const land = landMask[mj + Math.floor(((i + 0.5) / HPX) * PX)] > 127
    const [r, g, b, a] = heatColor(Math.pow(dens[k] / top, 0.6))
    heat[k * 4] = r; heat[k * 4 + 1] = g; heat[k * 4 + 2] = b; heat[k * 4 + 3] = land ? Math.round(a * 255) : 0
  }
}
await sharp(heat, { raw: { width: HPX, height: HPX, channels: 4 } }).webp({ quality: 88, alphaQuality: 90 }).toFile(path.join(OUT, 'heat-food.webp'))
log('restaurants:', nFood, 'wrote heat-food.webp', (fs.statSync(path.join(OUT, 'heat-food.webp')).size / 1e6).toFixed(2), 'MB')

// ---------- 9. rent by ZIP ----------
// Zillow's rent index per ZIP painted onto Census ZCTA polygons as a stepped choropleth with hairline borders. Classes and
// colours live in src/lib/rent.ts so the legend matches; ZIPs Zillow doesn't cover stay transparent. Draped like the
// restaurant wash (scene/Heatmap.tsx), so it is the same 2048² RGBA WebP.
log('rent')
const { asOf, byZip } = await fetchRentByZip()
const zctas = await buildZctas()
let rentSvg = ''
const rentZips: RentData['zips'] = []
for (const f of zctas.features) {
  const zip = String(f.properties?.ZCTA5CE20 ?? '')
  const r = byZip.get(zip)
  if (!r) continue
  rentSvg += `<path fill="${rentClass(r.rent).color}" fill-rule="evenodd" stroke="#1b1d1a" stroke-opacity="0.38" stroke-width="2.4" stroke-linejoin="round" d="${polygonPath(f.geometry)}"/>`
  rentZips.push({ zip, city: r.city, rent: r.rent })
}
const RPX = 2048
const rentRaw = await rasterize(svgDoc(rentSvg, RPX))
for (let j = 0; j < RPX; j++) {
  const mj = Math.floor(((j + 0.5) / RPX) * PX) * PX
  for (let i = 0; i < RPX; i++) {
    const k = (j * RPX + i) * 4
    const land = landMask[mj + Math.floor(((i + 0.5) / RPX) * PX)] > 127
    rentRaw[k + 3] = land ? Math.round(rentRaw[k + 3] * RENT_ALPHA) : 0
  }
}
await sharp(rentRaw, { raw: { width: RPX, height: RPX, channels: 4 } }).webp({ quality: 92, alphaQuality: 95 }).toFile(path.join(OUT, 'rent.webp'))
rentZips.sort((a, b) => a.zip.localeCompare(b.zip))
writeJSON(path.join(OUT, 'rent.json'), { asOf, source: 'Zillow Observed Rent Index', zips: rentZips } satisfies RentData)
log('rent: ZIPs painted', rentZips.length, 'of', zctas.features.length, 'in view · as of', asOf, '· wrote rent.webp', (fs.statSync(path.join(OUT, 'rent.webp')).size / 1e6).toFixed(2), 'MB')

// ---------- 10. neighborhood atlas ----------
// SF's classic neighborhoods plus every other city and town in the region, tinted like countries in an atlas (touching
// areas get different tints, greedily) with ink borders, baked to the same kind of 2048² wash. Labels go to hoods.json
// with the pole of inaccessibility of each polygon and its area, so the app can show big areas from afar and small
// ones only up close. The SF city polygon is not painted (its neighborhoods are) but still yields the far-zoom label.
log('neighborhoods')
const hoods = await buildHoods()
type Ring = number[][]
const ringArea = (ring: Ring) => {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, z1] = project(ring[j][1], ring[j][0]), [x2, z2] = project(ring[i][1], ring[i][0])
    a += x1 * z2 - x2 * z1
  }
  return Math.abs(a) / 2
}
const polys = (g: GeoJSON.Polygon | GeoJSON.MultiPolygon) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
const hoodInfo = hoods.map((h) => {
  const ps = polys(h.geometry)
  // area in world units² (1 unit = 100 m, so 100 unit² = 1 km²), holes subtracted; label goes in the biggest part
  let area = 0, best: Ring[] = ps[0], bestArea = -1
  for (const p of ps) {
    const a = ringArea(p[0]) - p.slice(1).reduce((s, r) => s + ringArea(r), 0)
    area += a
    if (a > bestArea) { bestArea = a; best = p }
  }
  const [lng, lat] = polylabel(best as [number, number][][], 1e-4)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of ps) for (const [x, y] of p[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  return { ...h, area, lat, lng, bbox: [minX, minY, maxX, maxY] as const, tint: -1 }
})
// greedy colouring, biggest first: a tint no bbox-neighbour uses, else the one the neighbours use least
const hoodOrder = hoodInfo.map((_, i) => i).filter((i) => hoodInfo[i].paint).sort((a, b) => hoodInfo[b].area - hoodInfo[a].area)
const EPS = 0.0005
const tintCount = new Array(HOOD_TINTS.length).fill(0)
for (const i of hoodOrder) {
  const me = hoodInfo[i]
  const used = new Array(HOOD_TINTS.length).fill(0)
  for (const j of hoodOrder) {
    const o = hoodInfo[j]
    if (j === i || o.tint < 0) continue
    if (o.bbox[0] > me.bbox[2] + EPS || o.bbox[2] < me.bbox[0] - EPS || o.bbox[1] > me.bbox[3] + EPS || o.bbox[3] < me.bbox[1] - EPS) continue
    used[o.tint]++
  }
  // among the tints no neighbour uses, take the one used least so far, so the whole palette shows up evenly
  const free = used.map((n, t) => (n === 0 ? t : -1)).filter((t) => t >= 0)
  const pick = free.length ? free.reduce((a, b) => (tintCount[b] < tintCount[a] ? b : a)) : used.indexOf(Math.min(...used))
  me.tint = pick
  tintCount[pick]++
}
let hoodSvg = ''
for (const i of hoodOrder) {
  const h = hoodInfo[i]
  hoodSvg += `<path fill="${HOOD_TINTS[h.tint]}" fill-rule="evenodd" stroke="#1b1d1a" stroke-opacity="0.8" stroke-width="4" stroke-linejoin="round" d="${polygonPath(h.geometry)}"/>`
}
const HOPX = 2048
const hoodRaw = await rasterize(svgDoc(hoodSvg, HOPX))
for (let j = 0; j < HOPX; j++) {
  const mj = Math.floor(((j + 0.5) / HOPX) * PX) * PX
  for (let i = 0; i < HOPX; i++) {
    const k = (j * HOPX + i) * 4
    const land = landMask[mj + Math.floor(((i + 0.5) / HOPX) * PX)] > 127
    hoodRaw[k + 3] = land ? Math.round(hoodRaw[k + 3] * HOODS_ALPHA) : 0
  }
}
await sharp(hoodRaw, { raw: { width: HOPX, height: HOPX, channels: 4 } }).webp({ quality: 92, alphaQuality: 95 }).toFile(path.join(OUT, 'hoods.webp'))
const hoodLabels: HoodsData['labels'] = hoodInfo
  .filter((h) => h.lat > BBOX.south && h.lat < BBOX.north && h.lng > BBOX.west && h.lng < BBOX.east)
  .map((h) => {
    const [x, z] = project(h.lat, h.lng)
    return { name: h.name, kind: h.kind, x: +x.toFixed(2), y: +elevationToY(elevAt(h.lat, h.lng)).toFixed(2), z: +z.toFixed(2), area: +(h.area / 100).toFixed(2), tint: Math.max(0, h.tint), ...(h.paint ? {} : { group: true }) }
  })
  .sort((a, b) => b.area - a.area)
writeJSON(path.join(OUT, 'hoods.json'), { source: 'Zillow neighborhoods (SF) · Census places', labels: hoodLabels } satisfies HoodsData)
log('neighborhoods: painted', hoodOrder.length, '· labels', hoodLabels.length, '· wrote hoods.webp', (fs.statSync(path.join(OUT, 'hoods.webp')).size / 1e6).toFixed(2), 'MB')

log('done in', ((Date.now() - t0) / 1000).toFixed(0), 's')
