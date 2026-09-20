/**
 * Tiny SVG builder + rasteriser (sharp/librsvg). All geometry in texture pixel space.
 */
import sharp from 'sharp'
import { toUV, MAP_TEXTURE_SIZE } from '../../src/lib/geo.ts'

export const PX = MAP_TEXTURE_SIZE

export function px(lng: number, lat: number): [number, number] {
  const [u, v] = toUV(lat, lng)
  return [u * PX, v * PX]
}

type Ring = number[][] // [lng,lat][]

export function ringPath(ring: Ring): string {
  let d = ''
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = px(ring[i][0], ring[i][1])
    d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
  }
  return d + 'Z'
}
export function linePath(line: Ring): string {
  let d = ''
  for (let i = 0; i < line.length; i++) {
    const [x, y] = px(line[i][0], line[i][1])
    d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
  }
  return d
}

/** GeoJSON (Multi)Polygon geometry -> single path d (evenodd handles holes). */
export function polygonPath(geom: GeoJSON.Geometry): string {
  if (geom.type === 'Polygon') return geom.coordinates.map(ringPath).join('')
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p) => p.map(ringPath).join('')).join('')
  return ''
}

/** A window onto PX space, in PX pixels. */
export interface View {
  x: number
  y: number
  w: number
  h: number
}
export const FULL: View = { x: 0, y: 0, w: PX, h: PX }

/**
 * Geometry is always in PX (4096²) space; `size` renders it at another pixel size (the washes are 2048²) and
 * `view` crops to a window of it (the SF inset), so stroke widths keep their ground size at any resolution.
 */
export function svgDoc(body: string, size = PX, view: View = FULL): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" preserveAspectRatio="none">${body}</svg>`
}

/** Render an SVG to raw RGBA pixels. */
export async function rasterize(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg), { limitInputPixels: false }).ensureAlpha().raw().toBuffer()
}
