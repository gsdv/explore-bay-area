/**
 * The slice of the Bay Area Emma's guide covers: San Francisco, down to about the middle of South San Francisco, and up over
 * the Golden Gate to Mount Tamalpais (its State Park outline reaches -122.665). It keeps the main app's projection
 * (lib/geo.ts), so its world coordinates, data files and landmark models are the same; only the box is smaller.
 * The scene is cut to this box like a diorama: nothing outside it is loaded or drawn.
 */
import { project, type LatLngBox } from '../lib/geo'

export const EMMA_BBOX: LatLngBox = { south: 37.645, west: -122.68, north: 37.95, east: -122.34 }

const [x0, z0] = project(EMMA_BBOX.north, EMMA_BBOX.west)
const [x1, z1] = project(EMMA_BBOX.south, EMMA_BBOX.east)
/** the box in world units (x east, z south) */
export const BOX = { x0, z0, x1, z1, width: x1 - x0, depth: z1 - z0 }

export const inBox = (x: number, z: number) => x >= BOX.x0 && x <= BOX.x1 && z >= BOX.z0 && z <= BOX.z1
