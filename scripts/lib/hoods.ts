/**
 * Neighborhood polygons for the atlas wash.
 *
 * San Francisco: the classic 37 neighborhoods (Zillow's boundaries, as mirrored in github.com/blackmad/neighborhoods —
 * DataSF's own "Analysis Neighborhoods" export was unreachable when this was written). Everywhere else: Census 2023
 * cartographic places (cities and census-designated places) clipped to the region. Both cached in data-cache/.
 */
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { cachedDownload, CACHE, log, readJSON } from './util.ts'
import { BBOX } from '../../src/lib/geo.ts'

const SF_URL = 'https://raw.githubusercontent.com/blackmad/neighborhoods/master/san-francisco.geojson'
const PLACES_URL = 'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_06_place_500k.zip'
/** Census GEOID of the City and County of San Francisco (labelled, but painted as its neighborhoods instead) */
const SF_GEOID = '0667000'

export interface HoodFeature {
  name: string
  kind: 'hood' | 'city'
  /** false for the SF city polygon: it only contributes a label at far zoom */
  paint: boolean
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

/** Census places in the bbox as GeoJSON (NAME, GEOID, LSAD), clipped to the region. */
async function buildPlaces(): Promise<GeoJSON.FeatureCollection> {
  const out = path.join(CACHE, 'places.geojson')
  if (!fs.existsSync(out)) {
    const zip = await cachedDownload('cb_2023_06_place_500k.zip', PLACES_URL)
    const dir = path.join(CACHE, 'places')
    if (!fs.existsSync(dir)) new AdmZip(zip).extractAllTo(dir, true)
    const shp = path.join(dir, 'cb_2023_06_place_500k.shp')
    const { default: mapshaper } = await import('mapshaper')
    const cmd = `-i "${shp}" -clip bbox=${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north} -filter-fields NAME,GEOID,LSAD -o places.geojson format=geojson`
    const res: any = await mapshaper.applyCommands(cmd, {})
    fs.writeFileSync(out, res['places.geojson'])
    log('wrote places.geojson')
  }
  return readJSON(out)
}

export async function buildHoods(): Promise<HoodFeature[]> {
  const sf: GeoJSON.FeatureCollection = JSON.parse((await cachedDownload('hoods-sf.geojson', SF_URL)).toString('utf8'))
  const places = await buildPlaces()
  const out: HoodFeature[] = []
  for (const f of sf.features) {
    if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue
    out.push({ name: String(f.properties?.name), kind: 'hood', paint: true, geometry: f.geometry })
  }
  for (const f of places.features) {
    if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue
    const geoid = String(f.properties?.GEOID)
    out.push({ name: String(f.properties?.NAME), kind: 'city', paint: geoid !== SF_GEOID, geometry: f.geometry })
  }
  return out
}
