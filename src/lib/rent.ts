/**
 * Rent choropleth classes. Shared by the pipeline (which bakes public/data/rent.webp) and the UI (which draws the
 * legend), so the colours on the ground and in the panel can never drift apart.
 *
 * Source: Zillow Observed Rent Index (ZORI) per ZIP — a smoothed measure of typical asking rent across all home
 * types — painted onto Census ZCTA polygons. Breaks were chosen from the Bay Area distribution (median ≈ $3.6k).
 */
export interface RentClass {
  /** upper bound, exclusive, in $/month */
  max: number
  color: string
}

export const RENT_CLASSES: RentClass[] = [
  { max: 2500, color: '#f6e3c8' },
  { max: 3000, color: '#f5c391' },
  { max: 3500, color: '#f39b5c' },
  { max: 4000, color: '#f04a00' },
  { max: 5000, color: '#b23300' },
  { max: Infinity, color: '#5e1800' },
]

/** opacity of the wash over the map */
export const RENT_ALPHA = 0.74

export function rentClass(rent: number): RentClass {
  return RENT_CLASSES.find((c) => rent < c.max) ?? RENT_CLASSES[RENT_CLASSES.length - 1]
}

/** public/data/rent.json */
export interface RentData {
  /** YYYY-MM of the latest month in the index */
  asOf: string
  source: string
  zips: { zip: string; city: string; rent: number }[]
}

/** 2500 -> "2.5k", 4000 -> "4k" */
export const fmtK = (n: number) => (n / 1000).toString().replace(/\.0$/, '') + 'k'

/** "2026-08" -> "Aug 2026" */
export const fmtMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })
}
