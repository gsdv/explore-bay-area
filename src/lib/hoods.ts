/**
 * Neighborhood atlas: shared by the pipeline (which paints public/data/hoods.webp) and the app (which places the labels).
 *
 * San Francisco is split into its classic neighborhoods; everywhere else the unit is the city or town (Census places,
 * incorporated cities and census-designated places alike), which is the scale newcomers actually talk about outside SF.
 * Colours are arbitrary, like countries in an atlas — muted paper tints from the site's palette, assigned so that
 * touching areas differ.
 */

/** Atlas tints (index = colour id in hoods.json). Muted so streets and parks stay legible underneath. */
export const HOOD_TINTS = [
  '#e8c08a', // ochre
  '#bcd09f', // sage
  '#a9c6da', // bay
  '#e8a88b', // terracotta
  '#d3b8d2', // mauve
  '#ecdc8e', // straw
  '#b9c2a8', // moss grey
]

/** opacity of the wash over the map */
export const HOODS_ALPHA = 0.7

export interface HoodLabel {
  name: string
  /** SF neighborhood or city/town */
  kind: 'hood' | 'city'
  /** label anchor (pole of inaccessibility), world units; y already exaggerated */
  x: number
  y: number
  z: number
  /** km², drives which zoom level the label appears at */
  area: number
  /** index into HOOD_TINTS */
  tint: number
  /** true for San Francisco as a whole: not painted, and its label hands over to its neighborhoods as you descend */
  group?: boolean
}

/** public/data/hoods.json */
export interface HoodsData {
  source: string
  labels: HoodLabel[]
}
