/**
 * The Hallidie Building, 130-150 Sutter Street (Willis Polk, 1918), CircleCI's office on its seventh, top floor: Emma's page
 * only, like the Monadnock (helpers in parts.ts). One of the first glass curtain walls anywhere: the floors are cantilevered
 * past the columns and the whole Sutter Street front is glass in a fine grid, hung with blue-and-gold cast iron.
 *
 * Local axes: -z is the Sutter Street front (bearing 170.7: the street runs along the Western Addition grid, -9.3, and the
 * building faces south across it), 333 Bush stands against the back. True to OSM's footprint in plan (32 x 45.5 m) and
 * seven storeys, 30 m, under the usual height exaggeration. From the street up: dark shopfronts, a gold band, the second
 * floor behind a gold railing, a gold frieze with a balcony, four storeys of curtain wall (a tall pane and a transom each),
 * a second frieze and balcony, the arched top floor, the navy cornice and the gold cresting with its central gable. The two
 * fire escapes bow out at each floor down the sides of the front, with their stairs running diagonally between.
 */
import type { Part } from '../../scene/LandmarkModel'
import { H, box, blocks, drum, openings } from './parts'

const NAVY = '#24324d', GOLD = '#caa14a', GLASS = '#7f96ab', TRANSOM = '#a9bccc', SHOP = '#2b3440'
const SIDE = '#c9bfae', ROOF = '#bdb8ae', AWNING = '#2f5596'

export function hallidieParts(): Part[] {
  const W = 0.322, D = 0.455, SUNK = -0.05
  const zF = -D / 2
  const yTop = H(30.8)
  const n = 13 // the curtain wall's bays
  const pane = (W - 0.03) / n
  // gold bands proud of the front, and balconies: a navy slab with a thin gold railing at its edge
  const band = (y0: number, y1: number): Part => box(0, y0, y1, zF - 0.008, W + 0.004, 0.008, GOLD)
  const balcony = (y: number): Part[] => [
    box(0, y, y + H(0.3), zF - 0.008, W + 0.008, 0.016, NAVY),
    box(0, y + H(0.3), y + H(1.1), zF - 0.0145, W + 0.006, 0.003, GOLD),
  ]

  const p: Part[] = [
    // one clean hover outline round the whole building (everything else is `detail`)
    { ...box(0, SUNK, H(32), 0, W + 0.02, D + 0.02, NAVY), detail: false, hullOnly: true },
    // the body, plain party walls and a gravel roof with a penthouse; the front is a navy frame a hair proud of it
    box(0, SUNK, yTop, 0, W, D, SIDE),
    box(0, yTop, yTop + 0.002, 0.004, W - 0.012, D - 0.02, ROOF),
    box(0.06, yTop, yTop + H(3), 0.12, 0.07, 0.09, SIDE),
    box(0, SUNK, yTop, zF - 0.002, W, 0.004, NAVY),

    // shopfronts and the blue awning over the door, the gold band over them
    openings(0, 0, H(0.3), H(4.8), W - 0.03, D + 0.004, 5, (W - 0.03) / 5 - 0.008, { side: -1, color: SHOP }),
    box(0, H(4.2), H(4.7), zF - 0.016, 0.07, 0.024, AWNING),
    band(H(5.6), H(6.4)),
    // the second floor behind its gold railing, then the frieze and the first balcony
    openings(0, 0, H(6.6), H(3.4), W - 0.03, D + 0.004, n, pane - 0.004, { side: -1 }),
    box(0, H(6.5), H(7.4), zF - 0.012, W, 0.003, GOLD),
    band(H(10.1), H(11.2)),
    ...balcony(H(11.2)),
    // the curtain wall: four storeys of a tall pane and a lighter transom in each bay
    openings(0, 0, H(12.55), H(2.1), W - 0.03, D + 0.004, n, pane - 0.003, { side: -1, rows: 4, storey: H(3.2) }),
    openings(0, 0, H(14.8), H(0.65), W - 0.03, D + 0.004, n, pane - 0.003, { side: -1, rows: 4, storey: H(3.2), color: TRANSOM }),
    band(H(25.2), H(26.2)),
    ...balcony(H(26.2)),
    // the top floor, CircleCI's, its panes arched under a gold line, the navy cornice
    openings(0, 0, H(27.5), H(2.3), W - 0.03, D + 0.004, n, pane - 0.004, { side: -1, arch: true }),
    box(0, H(29.8), H(30.05), zF - 0.007, W + 0.004, 0.008, GOLD),
    box(0, H(30.05), yTop, zF - 0.003, W + 0.012, 0.026, NAVY),
    // the cresting: a gold fret along the top with finials, and the central gable, navy edged in gold
    box(0, yTop, yTop + H(0.8), zF + 0.004, W, 0.005, GOLD),
    blocks(Array.from({ length: 13 }, (_, k) => [-W / 2 + 0.006 + (k * (W - 0.012)) / 12, zF + 0.004, 0.006, 0.006, yTop, yTop + H(1.6)]), GOLD),
    blocks([[0, zF + 0.008, 0.11, 0.008, yTop, H(34)]], GOLD, { gabled: true }),
    blocks([[0, zF + 0.004, 0.094, 0.008, yTop, H(33.5)]], NAVY, { gabled: true }),
    box(0, H(33.6), H(35), zF + 0.008, 0.008, 0.008, GOLD),
  ]

  // the fire escapes: at each floor a bowed balcony (a drum half sunk into the front) with a gold-capped railing, and a
  // stair running diagonally up to the next, turning back each time
  const levels = [H(11.5), H(15.6), H(18.8), H(22), H(26.2)]
  for (const sx of [-1, 1]) {
    const xb = sx * (W / 2 - 0.03)
    for (const y of levels.slice(1, -1)) {
      p.push(
        drum(xb, zF, y, y + H(0.3), 0.024, NAVY),
        drum(xb, zF, y + H(0.3), y + H(1.1), 0.022, NAVY),
        drum(xb, zF, y + H(1.05), y + H(1.2), 0.0228, GOLD),
      )
    }
    for (let i = 0; i + 1 < levels.length; i++) {
      const s = (i % 2 ? 1 : -1) * sx, dx = 0.036, dy = levels[i + 1] - levels[i]
      p.push({ geo: 'box', pos: [xb, (levels[i] + levels[i + 1]) / 2, zF - 0.016], rot: [0, 0, Math.atan2(dy, s * dx)], scale: [Math.hypot(dx, dy), 0.004, 0.003], color: NAVY, detail: true })
    }
  }
  return p
}
