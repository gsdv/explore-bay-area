/**
 * Land polygons: US Census cartographic-boundary counties (clipped to shoreline), cut to our bbox.
 */
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { cachedDownload, CACHE, log, readJSON } from './util.ts'
import { BBOX } from '../../src/lib/geo.ts'

export async function buildLand(): Promise<GeoJSON.FeatureCollection> {
  const out = path.join(CACHE, 'land.geojson')
  if (!fs.existsSync(out)) {
    const zip = await cachedDownload('cb_2023_us_county_500k.zip', 'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_500k.zip')
    const dir = path.join(CACHE, 'counties')
    if (!fs.existsSync(dir)) new AdmZip(zip).extractAllTo(dir, true)
    const shp = path.join(dir, 'cb_2023_us_county_500k.shp')
    const { default: mapshaper } = await import('mapshaper')
    const cmd = `-i "${shp}" -filter 'STATEFP=="06"' -clip bbox=${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north} -dissolve -o land.geojson format=geojson`
    const res: any = await mapshaper.applyCommands(cmd, {})
    fs.writeFileSync(out, res['land.geojson'])
    log('wrote land.geojson')
  }
  const json = readJSON(out)
  if (json.type === 'GeometryCollection') {
    return { type: 'FeatureCollection', features: json.geometries.map((geometry: GeoJSON.Geometry) => ({ type: 'Feature', properties: {}, geometry })) }
  }
  return json
}
