/**
 * Rent by ZIP: Zillow's Observed Rent Index (all homes, smoothed, monthly) joined to Census ZCTA polygons.
 * Both downloads are cached in data-cache/; delete zori-zip.csv to pick up a newer month.
 */
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'
import { cachedDownload, CACHE, log, readJSON } from './util.ts'
import { BBOX } from '../../src/lib/geo.ts'

const ZORI_URL = 'https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv'
const ZCTA_URL = 'https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip'

export interface ZipRent {
  zip: string
  city: string
  /** $/month, rounded */
  rent: number
  /** YYYY-MM the value is from (normally the latest month; a few ZIPs trail) */
  month: string
}

/** Latest non-empty month for every Californian 94xxx/95xxx ZIP in the index (the bbox clip does the rest). */
export async function fetchRentByZip(): Promise<{ asOf: string; byZip: Map<string, ZipRent> }> {
  const csv = (await cachedDownload('zori-zip.csv', ZORI_URL)).toString('utf8')
  // the Metro column is quoted and contains a comma, so a real CSV parser is required
  const recs: Record<string, string>[] = parse(csv, { columns: true })
  const months = Object.keys(recs[0]).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
  const byZip = new Map<string, ZipRent>()
  for (const r of recs) {
    if (r.State !== 'CA' || !/^9[45]\d{3}$/.test(r.RegionName)) continue
    let k = months.length - 1
    while (k >= 0 && r[months[k]] === '') k--
    if (k < 0) continue
    byZip.set(r.RegionName, { zip: r.RegionName, city: r.City, rent: Math.round(+r[months[k]]), month: months[k].slice(0, 7) })
  }
  return { asOf: months[months.length - 1].slice(0, 7), byZip }
}

/** ZCTA polygons inside the bbox (Census cartographic 1:500k, already clipped to the shoreline), property ZCTA5CE20. */
export async function buildZctas(): Promise<GeoJSON.FeatureCollection> {
  const out = path.join(CACHE, 'zcta.geojson')
  if (!fs.existsSync(out)) {
    const zip = await cachedDownload('cb_2020_us_zcta520_500k.zip', ZCTA_URL)
    const dir = path.join(CACHE, 'zcta')
    if (!fs.existsSync(dir)) new AdmZip(zip).extractAllTo(dir, true)
    const shp = path.join(dir, 'cb_2020_us_zcta520_500k.shp')
    const { default: mapshaper } = await import('mapshaper')
    const cmd = `-i "${shp}" -filter 'ZCTA5CE20 >= "94000" && ZCTA5CE20 < "96000"' -clip bbox=${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north} -o zcta.geojson format=geojson`
    const res: any = await mapshaper.applyCommands(cmd, {})
    fs.writeFileSync(out, res['zcta.geojson'])
    log('wrote zcta.geojson')
  }
  return readJSON(out)
}
