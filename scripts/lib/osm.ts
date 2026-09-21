import { overpass, bbox } from './overpass.ts'
import { DETAIL_AREAS, SF_BBOX } from '../../src/lib/geo.ts'

/** San Francisco proper (plus a little margin) */
export const SF = SF_BBOX
/** Downtown / SoMa / Mission Bay: real building footprints here, procedural elsewhere */
export const DOWNTOWN = { south: 37.765, west: -122.425, north: 37.812, east: -122.385 }

export const fetchRoadsMajor = () =>
  overpass('roads-major', `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link)$"](${bbox()});out geom;`, 300, 1024)

/** Residential streets, only where we go street-level (one paced query per detail area: bursts get the IP refused). */
export async function fetchRoadsMinor(): Promise<{ elements: any[] }> {
  const elements: any[] = []
  for (const { id, bbox: b } of DETAIL_AREAS) {
    const t = Date.now()
    const r = await overpass(`roads-minor-${id}`, `way["highway"~"^(residential|unclassified|living_street)$"](${bbox(b)});out geom;`)
    elements.push(...r.elements)
    if (Date.now() - t > 1000) await new Promise((res) => setTimeout(res, 8000)) // it came over the network, not from the cache
  }
  return { elements }
}

export const fetchParks = () =>
  overpass(
    'parks',
    `(
      way["leisure"~"^(park|nature_reserve|golf_course|garden)$"](${bbox()});
      relation["leisure"~"^(park|nature_reserve)$"](${bbox()});
      way["boundary"~"^(national_park|protected_area)$"](${bbox()});
      relation["boundary"~"^(national_park|protected_area)$"](${bbox()});
      way["landuse"~"^(forest|cemetery)$"](${bbox()});
      relation["landuse"="forest"](${bbox()});
    );out geom;`,
  )

export const fetchBuildingsDowntown = () => overpass('buildings-downtown', `way["building"](${bbox(DOWNTOWN)});out geom;`)

const NETWORKS: Record<string, string> = {
  muni: '^Muni$',
  bart: '^BART$',
  caltrain: '^Caltrain$',
  vta: '^VTA$',
  ferry: '^(San Francisco Bay Ferry|Golden Gate Ferry)$',
}
/** One query per agency keeps each response small enough for the public servers. */
export async function fetchTransitRoutes(): Promise<{ elements: any[] }> {
  const elements: any[] = []
  for (const [key, re] of Object.entries(NETWORKS)) {
    const r = await overpass(
      `transit-${key}`,
      `relation["route"~"^(bus|trolleybus|tram|light_rail|subway|train|ferry)$"]["network"~"${re}"](${bbox()});out geom;`,
      180,
    )
    elements.push(...r.elements)
  }
  return { elements }
}

export const fetchStations = () => overpass('stations', `node["railway"~"^(station|halt)$"](${bbox()});out;`)

/** Places to eat: one point each (ways/relations collapse to their centre). Bars and pubs are deliberately excluded. */
export const fetchFood = () => overpass('food', `nwr["amenity"~"^(restaurant|cafe|fast_food)$"](${bbox()});out center;`)
