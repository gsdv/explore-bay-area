/**
 * Building footprints outside San Francisco, from Overture Maps (OSM + Microsoft/Google ML footprints, conflated):
 * the only source that is complete across city lines. The release is GeoParquet on S3; DuckDB reads just the row groups
 * that touch a box, so a city is a minute or two and no key. Heights are patchy (see `height`), unlike SF's lidar survey.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'
import { CACHE, log } from './util.ts'
import { DETAIL_AREAS, type LatLngBox } from '../../src/lib/geo.ts'
import type { Footprint } from './sfbuildings.ts'

/** Bump to refresh; releases are listed under s3://overturemaps-us-west-2/release/. */
const RELEASE = '2026-08-19.0'

async function download(name: string, b: LatLngBox, file: string) {
  log('overture', name, '(reading parquet from S3)')
  const db = await DuckDBInstance.create(':memory:')
  const c = await db.connect()
  await c.run('INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;')
  await c.run("SET s3_region='us-west-2';")
  const r = await c.runAndReadAll(`
    SELECT ST_AsGeoJSON(geometry) AS g, height, num_floors
    FROM read_parquet('s3://overturemaps-us-west-2/release/${RELEASE}/theme=buildings/type=building/*', hive_partitioning=1)
    WHERE bbox.xmin < ${b.east} AND bbox.xmax > ${b.west} AND bbox.ymin < ${b.north} AND bbox.ymax > ${b.south}
      AND is_underground IS NOT TRUE`)
  const rows = r.getRows()
  const out = fs.createWriteStream(file)
  for (const [g, h, floors] of rows) out.write(JSON.stringify({ g: JSON.parse(g as string), h, floors }) + '\n')
  await new Promise<void>((res) => out.end(() => res()))
  log('saved', path.basename(file), rows.length, 'buildings', (fs.statSync(file).size / 1e6).toFixed(1), 'MB')
}

/** Cached per city as data-cache/overture-<name>.ndjson (delete to pull again). */
export async function fetchFootprintsCore(): Promise<Footprint[]> {
  const out: Footprint[] = []
  // SF has its own, better survey (sfbuildings.ts)
  for (const { id: name, bbox: box } of DETAIL_AREAS.filter((a) => a.id !== 'sf')) {
    const file = path.join(CACHE, `overture-${name}.ndjson`)
    if (!fs.existsSync(file)) await download(name, box, file)
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue
      const { g, h, floors } = JSON.parse(line) as { g: GeoJSON.Geometry; h: number | null; floors: number | null }
      const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : []
      const height = h && h > 0 ? h : floors && floors > 0 ? floors * 3.4 : null
      for (const poly of polys) {
        const ring = poly[0]?.slice(0, -1) as [number, number][] | undefined
        if (ring && ring.length >= 3) out.push({ ring, height })
      }
    }
  }
  log('core-city footprints:', out.length)
  return out
}
