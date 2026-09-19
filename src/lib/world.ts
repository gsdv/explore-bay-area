/**
 * Loads all generated data (public/data) once and exposes a height sampler.
 */
import * as THREE from 'three'
import { HEIGHTMAP_SIZE, HEIGHT_OFFSET, WORLD, elevationToY, worldToUV, UNIT, BUILDING_EXAGGERATION } from './geo'

export interface Heightmap {
  size: number
  data: Float32Array // metres
  /** world y at world x,z (already exaggerated) */
  yAt(x: number, z: number): number
}

export interface TransitRoute {
  id: number
  ref: string
  name: string
  network: string
  mode: 'bus' | 'rail' | 'cable' | 'ferry'
  color: string
  lines: number[][]
}
export interface Station {
  name: string
  network: 'BART' | 'Caltrain' | 'Muni'
  x: number
  y: number
  z: number
}
export interface Building {
  p: number[]
  h: number
  y: number
}

export interface World {
  heights: Heightmap
  mapTexture: THREE.Texture
  buildings: Building[]
  filler: Float32Array
  transit: TransitRoute[]
  stations: Station[]
  /** lowest safe camera y at world x,z: above terrain and above any rooftop nearby */
  clearanceAt(x: number, z: number): number
}

async function loadHeightmap(onProgress: (s: string) => void): Promise<Heightmap> {
  onProgress('terrain')
  const blob = await (await fetch('/data/height.png')).blob()
  const bmp = await createImageBitmap(blob)
  const N = HEIGHTMAP_SIZE
  const canvas = new OffscreenCanvas(N, N)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  const px = ctx.getImageData(0, 0, N, N).data
  const data = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) data[i] = px[i * 4] * 256 + px[i * 4 + 1] - HEIGHT_OFFSET
  const sample = (u: number, v: number) => {
    const x = Math.min(Math.max(u * N - 0.5, 0), N - 1.001), y = Math.min(Math.max(v * N - 0.5, 0), N - 1.001)
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy
    const a = data[iy * N + ix], b = data[iy * N + ix + 1], c = data[(iy + 1) * N + ix], d = data[(iy + 1) * N + ix + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
  }
  return {
    size: N,
    data,
    yAt(x, z) {
      const [u, v] = worldToUV(x, z)
      return elevationToY(sample(u, v))
    },
  }
}

export async function loadWorld(onProgress: (s: string) => void): Promise<World> {
  const loader = new THREE.TextureLoader()
  const [heights, mapTexture, buildings, fillerBuf, transit, stations] = await Promise.all([
    loadHeightmap(onProgress),
    loader.loadAsync('/data/map.webp').then((t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.generateMipmaps = true
      return t
    }),
    fetch('/data/buildings.json').then((r) => r.json()),
    fetch('/data/filler.bin').then((r) => r.arrayBuffer()),
    fetch('/data/transit.json').then((r) => r.json()),
    fetch('/data/stations.json').then((r) => r.json()),
  ])
  onProgress('city')
  const filler = new Float32Array(fillerBuf)
  const clearanceAt = buildClearance(heights, buildings, filler)
  return { heights, mapTexture, buildings, filler, transit, stations, clearanceAt }
}

const CG = 160
const TERRAIN_CLEARANCE = 1.0
const ROOF_CLEARANCE = 0.7
/** Coarse grid of the tallest rooftop per cell; queries take the 3x3 neighbourhood. */
function buildClearance(heights: Heightmap, buildings: Building[], filler: Float32Array) {
  const tops = new Float32Array(CG * CG).fill(-Infinity)
  const cell = (x: number, z: number) => {
    const i = Math.min(CG - 1, Math.max(0, Math.floor((x / WORLD.width + 0.5) * CG)))
    const j = Math.min(CG - 1, Math.max(0, Math.floor((z / WORLD.depth + 0.5) * CG)))
    return j * CG + i
  }
  for (const b of buildings) {
    const top = b.y + b.h * UNIT * BUILDING_EXAGGERATION
    for (let k = 0; k < b.p.length; k += 2) {
      const c = cell(b.p[k], b.p[k + 1])
      if (top > tops[c]) tops[c] = top
    }
  }
  for (let i = 0; i < filler.length; i += 7) {
    const c = cell(filler[i], filler[i + 2])
    const top = filler[i + 1] + filler[i + 5]
    if (top > tops[c]) tops[c] = top
  }
  return (x: number, z: number) => {
    const i = Math.floor((x / WORLD.width + 0.5) * CG), j = Math.floor((z / WORLD.depth + 0.5) * CG)
    let roof = -Infinity
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj
      if (jj < 0 || jj >= CG) continue
      for (let di = -1; di <= 1; di++) {
        const ii = i + di
        if (ii < 0 || ii >= CG) continue
        const t = tops[jj * CG + ii]
        if (t > roof) roof = t
      }
    }
    return Math.max(heights.yAt(x, z) + TERRAIN_CLEARANCE, roof + ROOF_CLEARANCE)
  }
}

export { WORLD }
