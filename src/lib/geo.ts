/**
 * Shared geographic constants and projection.
 * Used by BOTH the data pipeline (scripts/) and the app (src/).
 *
 * World units: 1 unit = 100 m. X = east, Y = up, Z = south (three.js convention,
 * so that looking "down" the -Z axis points north).
 */

/** Region of interest: Mt Tam in the north-west to San Jose / Los Gatos in the south. */
export interface LatLngBox {
  south: number
  west: number
  north: number
  east: number
}
export const BBOX: LatLngBox = {
  south: 37.2,
  west: -122.7,
  north: 37.97,
  east: -121.8,
}

/**
 * San Francisco proper (plus a little margin). The pipeline fetches minor streets here and bakes a sharper
 * inset of the map texture over it (map-sf.webp), which the terrain blends in on top of the regional one.
 */
export const SF_BBOX: LatLngBox = { south: 37.7, west: -122.53, north: 37.84, east: -122.35 }

export const LAT0 = (BBOX.south + BBOX.north) / 2
export const LNG0 = (BBOX.west + BBOX.east) / 2

/** metres per degree at the region's centre latitude */
const M_PER_DEG_LAT = 110_574
const M_PER_DEG_LNG = 111_320 * Math.cos((LAT0 * Math.PI) / 180)

/** metres -> world units */
export const UNIT = 1 / 100

/** Vertical exaggeration so hills read as hills in a toy city. */
export const TERRAIN_EXAGGERATION = 1.6
export const BUILDING_EXAGGERATION = 1.8

/** Region extent in world units */
export const WORLD = {
  width: (BBOX.east - BBOX.west) * M_PER_DEG_LNG * UNIT,
  depth: (BBOX.north - BBOX.south) * M_PER_DEG_LAT * UNIT,
}

/** lat/lng -> [x, z] in world units (y is up). North is -z. */
export function project(lat: number, lng: number): [number, number] {
  const x = (lng - LNG0) * M_PER_DEG_LNG * UNIT
  const z = -(lat - LAT0) * M_PER_DEG_LAT * UNIT
  return [x, z]
}

/** [x, z] world -> lat/lng */
export function unproject(x: number, z: number): [number, number] {
  const lng = x / UNIT / M_PER_DEG_LNG + LNG0
  const lat = -z / UNIT / M_PER_DEG_LAT + LAT0
  return [lat, lng]
}

/** lat/lng -> [u, v] in 0..1 across the region (v=0 at north edge). */
export function toUV(lat: number, lng: number): [number, number] {
  return [(lng - BBOX.west) / (BBOX.east - BBOX.west), (BBOX.north - lat) / (BBOX.north - BBOX.south)]
}

/** world [x, z] -> [u, v] */
export function worldToUV(x: number, z: number): [number, number] {
  return [x / WORLD.width + 0.5, z / WORLD.depth + 0.5]
}

/** Heightmap encoding: metres are stored as (h + HEIGHT_OFFSET) across R (high byte) and G (low byte). */
export const HEIGHT_OFFSET = 1000
export const HEIGHTMAP_SIZE = 1024
export const MAP_TEXTURE_SIZE = 4096
/** The SF inset: ≈3.9 m per pixel against the regional texture's ≈20 m. */
export const SF_TEXTURE_SIZE = 4096

/** metres of elevation -> world y */
export function elevationToY(m: number): number {
  return m * UNIT * TERRAIN_EXAGGERATION
}
