/**
 * Shoreline fixes for the census land polygon (land.ts), where its 1:500k generalisation cuts across water that matters.
 *
 * Sausalito: the census shore runs 200-400 m out into Richardson Bay from Waldo Point to downtown, so the yacht harbor, the
 * Clipper and Schoonmaker marinas and the floating homes all stood on "land" (and the heightmap, which follows the land mask,
 * kept them above the sea). OSM's coastline takes over there: the water between it and a path out in the bay, past the census
 * shore, is erased from the land. The path only crosses water the census already has, so nothing else changes.
 */
import { log } from './util.ts'
import { overpass } from './overpass.ts'

interface Fix {
  name: string
  /** the Overpass box for the coastline: south, west, north, east */
  box: [number, number, number, number]
  /** the stretch of chained coastline to keep, by latitude: from the first point north of `from` to the first north of `to` */
  from: number
  to: number
  /** back from the end of that stretch to its start, out in the water, [lat, lng] */
  close: [number, number][]
}

const FIXES: Fix[] = [
  {
    name: 'sausalito',
    box: [37.83, -122.52, 37.885, -122.47],
    from: 37.8489,
    to: 37.8777,
    close: [
      [37.8784, -122.501], [37.876, -122.4953], [37.8688, -122.493], [37.864, -122.4862], [37.862, -122.4811],
      [37.8602, -122.4766], [37.8579, -122.4763], [37.8543, -122.4766], [37.8489, -122.4772],
    ],
  },
]

type LL = { lat: number; lon: number }

/** OSM's coastline ways in the box, joined end to end (each way runs with the land on its left) */
function chains(ways: LL[][]): LL[][] {
  const same = (a: LL, b: LL) => a.lat === b.lat && a.lon === b.lon
  const left = [...ways], out: LL[][] = []
  while (left.length) {
    let c = left.shift()!
    for (let grew = true; grew;) {
      grew = false
      for (let i = 0; i < left.length; i++) {
        const w = left[i]
        if (same(c[c.length - 1], w[0])) c = [...c, ...w.slice(1)]
        else if (same(w[w.length - 1], c[0])) c = [...w, ...c.slice(1)]
        else continue
        left.splice(i, 1)
        grew = true
        break
      }
    }
    out.push(c)
  }
  return out
}

export async function fixShores(land: GeoJSON.FeatureCollection): Promise<GeoJSON.FeatureCollection> {
  const { default: mapshaper } = await import('mapshaper')
  for (const f of FIXES) {
    const [s, w, n, e] = f.box
    const osm = await overpass(`coast-${f.name}`, `way["natural"="coastline"](${s},${w},${n},${e});out geom;`)
    const ways = osm.elements.filter((x: any) => x.type === 'way' && x.geometry).map((x: any) => x.geometry as LL[])
    // the chain that runs through the whole stretch, cut to it
    const chain = chains(ways).find((c) => c.some((p) => p.lat < f.from) && c.some((p) => p.lat > f.to))
    if (!chain) throw new Error(`shore fix ${f.name}: no coastline runs from ${f.from} to ${f.to}`)
    const i0 = chain.findIndex((p) => p.lat >= f.from)
    const i1 = chain.findIndex((p, i) => i > i0 && p.lat >= f.to)
    const ring = [...chain.slice(i0, i1 + 1).map((p) => [p.lon, p.lat]), ...f.close.map(([lat, lng]) => [lng, lat])]
    ring.push(ring[0])
    const water: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] }
    const res: any = await mapshaper.applyCommands('-i land.json -erase water.json -o out.json format=geojson', { 'land.json': land, 'water.json': water })
    const out = JSON.parse(res['out.json'].toString())
    land = out.type === 'GeometryCollection'
      ? { type: 'FeatureCollection', features: out.geometries.map((geometry: GeoJSON.Geometry) => ({ type: 'Feature', properties: {}, geometry })) }
      : out
    log('shore fix', f.name, '· coastline points', i1 - i0 + 1)
  }
  return land
}
