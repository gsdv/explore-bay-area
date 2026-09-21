/**
 * Every building footprint in San Francisco, from DataSF's "Building Footprints" (ynuv-fyni): the city's 2010–16
 * lidar survey, ~177k polygons with a measured height each. It is also what OSM's SF buildings were imported from,
 * but one keyless request here replaces a dozen Overpass tiles (which earn 429s and then refused connections).
 */
import { cachedDownload, log } from './util.ts'

const URL =
  'https://data.sf.gov/resource/ynuv-fyni.geojson?$select=shape,hgt_mediancm&$limit=300000&$order=sf16_bldgid'

export interface Footprint {
  /** outer ring, [lng, lat], not closed */
  ring: [number, number][]
  /** median roof height above ground in metres, when the survey has one */
  height: number | null
}

/** ~118 MB, cached as data-cache/sf-footprints.geojson (delete it to pull again). */
export async function fetchFootprintsSF(): Promise<Footprint[]> {
  const gj = JSON.parse((await cachedDownload('sf-footprints.geojson', URL)).toString('utf8')) as GeoJSON.FeatureCollection
  const out: Footprint[] = []
  for (const f of gj.features) {
    const g = f.geometry
    if (!g) continue
    const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : []
    const cm = parseFloat(f.properties?.hgt_mediancm)
    for (const poly of polys) {
      const ring = poly[0]?.slice(0, -1) as [number, number][] | undefined
      if (ring && ring.length >= 3) out.push({ ring, height: cm > 0 ? cm / 100 : null })
    }
  }
  log('SF footprints:', out.length)
  return out
}
