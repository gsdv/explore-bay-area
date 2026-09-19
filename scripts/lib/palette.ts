/** Map texture palette. Hex -> [r,g,b]. */
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

export const P = {
  water: hex('#7db8de'),
  sand: hex('#e7dfcb'), // urban flats
  hill: hex('#adbe83'), // grassy hills
  peak: hex('#b6a884'), // exposed summits
  parkCity: hex('#9fc986'),
  parkWild: hex('#8dbd74'),
}
export const ROAD_STYLE: Record<string, { color: string; width: number }> = {
  motorway: { color: '#f3cf8a', width: 4.2 },
  motorway_link: { color: '#f3cf8a', width: 2.2 },
  trunk: { color: '#f6deab', width: 3.4 },
  trunk_link: { color: '#f6deab', width: 2 },
  primary: { color: '#f8e6bd', width: 3 },
  secondary: { color: '#fffdf6', width: 2.3 },
  tertiary: { color: '#fffdf6', width: 1.7 },
  residential: { color: '#fbfaf4', width: 1.05 },
  unclassified: { color: '#fbfaf4', width: 1.05 },
  living_street: { color: '#fbfaf4', width: 0.9 },
}
/** Restaurant-density wash: t in 0..1 -> [r, g, b, alpha 0..1]. Paper-toned at the low end so filtered edges never fringe dark. */
const HEAT: { t: number; color: [number, number, number]; alpha: number }[] = [
  { t: 0, color: hex('#f5dfc2'), alpha: 0 },
  { t: 0.06, color: hex('#f5dfc2'), alpha: 0 }, // lone venues stay invisible; the wash starts where places cluster
  { t: 0.2, color: hex('#f5c391'), alpha: 0.34 },
  { t: 0.55, color: hex('#f04a00'), alpha: 0.72 },
  { t: 1, color: hex('#5e1800'), alpha: 0.9 },
]
export function heatColor(t: number): [number, number, number, number] {
  t = clamp01(t)
  let i = 0
  while (i < HEAT.length - 2 && t > HEAT[i + 1].t) i++
  const a = HEAT[i], b = HEAT[i + 1]
  const k = (t - a.t) / (b.t - a.t)
  return [lerp(a.color[0], b.color[0], k), lerp(a.color[1], b.color[1], k), lerp(a.color[2], b.color[2], k), lerp(a.alpha, b.alpha, k)]
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
export const smooth = (t: number) => t * t * (3 - 2 * t)
