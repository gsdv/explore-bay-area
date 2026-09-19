/**
 * Terrain: AWS Terrain Tiles (Mapzen "terrarium" encoding), zoom 12 (~30 m/px here).
 * Stitched in Web-Mercator tile space and resampled onto the app's equirectangular grid.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { cachedDownload, log, pmap, OUT } from './util.ts'
import { BBOX, HEIGHTMAP_SIZE, HEIGHT_OFFSET } from '../../src/lib/geo.ts'

const Z = 12
const TILE = 256

function lng2x(lng: number) {
  return ((lng + 180) / 360) * 2 ** Z
}
function lat2y(lat: number) {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z
}

export interface Heightmap {
  size: number
  /** metres, row-major, row 0 = north edge */
  data: Float32Array
  /** bilinear sample at u,v in 0..1 */
  sample(u: number, v: number): number
}

export async function buildHeightmap(): Promise<Heightmap> {
  const x0 = Math.floor(lng2x(BBOX.west)), x1 = Math.floor(lng2x(BBOX.east))
  const y0 = Math.floor(lat2y(BBOX.north)), y1 = Math.floor(lat2y(BBOX.south))
  const W = (x1 - x0 + 1) * TILE, H = (y1 - y0 + 1) * TILE
  const merc = new Float32Array(W * H)
  const tiles: [number, number][] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push([x, y])
  log(`terrain: ${tiles.length} tiles at z${Z}`)
  await pmap(tiles, 8, async ([x, y]) => {
    const buf = await cachedDownload(`terrarium-${Z}-${x}-${y}.png`, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`)
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
    const ch = info.channels
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const i = (py * TILE + px) * ch
        const h = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768
        merc[(y - y0) * TILE * W + py * W + (x - x0) * TILE + px] = h
      }
    }
  })
  const sampleMerc = (fx: number, fy: number) => {
    const x = Math.min(Math.max(fx - x0 * TILE, 0), W - 1.001), y = Math.min(Math.max(fy - y0 * TILE, 0), H - 1.001)
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy
    const a = merc[iy * W + ix], b = merc[iy * W + ix + 1], c = merc[(iy + 1) * W + ix], d = merc[(iy + 1) * W + ix + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
  }

  const N = HEIGHTMAP_SIZE
  const out = new Float32Array(N * N)
  for (let j = 0; j < N; j++) {
    const lat = BBOX.north - ((j + 0.5) / N) * (BBOX.north - BBOX.south)
    const fy = lat2y(lat) * TILE
    for (let i = 0; i < N; i++) {
      const lng = BBOX.west + ((i + 0.5) / N) * (BBOX.east - BBOX.west)
      out[j * N + i] = sampleMerc(lng2x(lng) * TILE, fy)
    }
  }
  return makeHeightmap(out, N)
}

export function makeHeightmap(data: Float32Array, size: number): Heightmap {
  return {
    size,
    data,
    sample(u, v) {
      const x = Math.min(Math.max(u * size - 0.5, 0), size - 1.001), y = Math.min(Math.max(v * size - 0.5, 0), size - 1.001)
      const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy
      const a = data[iy * size + ix], b = data[iy * size + ix + 1], c = data[(iy + 1) * size + ix], d = data[(iy + 1) * size + ix + 1]
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
    },
  }
}

/** Apply the land mask: land is clamped to >= 1.5 m, water to [-6, -1.5] m (shallow so shorelines don't dip), then write the RGB-encoded PNG. */
export async function writeHeightmap(hm: Heightmap, landMask: Uint8Array, maskSize: number) {
  const N = hm.size
  const rgb = Buffer.alloc(N * N * 3)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const mi = Math.floor(((j + 0.5) / N) * maskSize) * maskSize + Math.floor(((i + 0.5) / N) * maskSize)
      const land = landMask[mi] > 127
      let h = hm.data[j * N + i]
      h = land ? Math.max(h, 1.5) : Math.min(Math.max(h, -6), -1.5)
      hm.data[j * N + i] = h
      const v = Math.round(Math.min(Math.max(h + HEIGHT_OFFSET, 0), 65535))
      const o = (j * N + i) * 3
      rgb[o] = v >> 8
      rgb[o + 1] = v & 255
      rgb[o + 2] = 0
    }
  }
  const file = path.join(OUT, 'height.png')
  await sharp(rgb, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 9 }).toFile(file)
  log('wrote height.png', (fs.statSync(file).size / 1e6).toFixed(2), 'MB')
}
