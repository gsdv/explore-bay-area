import { log } from './lib/util.ts'
import * as osm from './lib/osm.ts'
import { buildLand } from './lib/land.ts'
import { buildHeightmap } from './lib/terrain.ts'
import { buildZctas, fetchRentByZip } from './lib/rent.ts'

const t = Date.now()
await buildLand()
await buildHeightmap()
await buildZctas()
log('rent ZIPs:', (await fetchRentByZip()).byZip.size)
for (const f of [osm.fetchStations, osm.fetchFood, osm.fetchTransitRoutes, osm.fetchBuildingsDowntown, osm.fetchParks, osm.fetchRoadsMinorSF, osm.fetchRoadsMajor]) {
  const r = await f()
  log(f.name, 'elements:', r.elements.length)
}
log('fetch done in', ((Date.now() - t) / 1000).toFixed(0), 's')
