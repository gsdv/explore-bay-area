/**
 * Loads all generated data (public/data) once and exposes a height sampler.
 */
import * as THREE from 'three'
import { HEIGHTMAP_SIZE, HEIGHT_OFFSET, WORLD, elevationToY, worldToUV } from './geo'

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
  /** restaurant-density wash, RGBA, draped over the terrain when the layer is on */
  heatFood: THREE.Texture
  buildings: Building[]
  filler: Float32Array
  transit: TransitRoute[]
  stations: Station[]
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
  const [heights, mapTexture, heatFood, buildings, fillerBuf, transit, stations] = await Promise.all([
    loadHeightmap(onProgress),
    loader.loadAsync('/data/map.webp').then((t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.generateMipmaps = true
      return t
    }),
    loader.loadAsync('/data/heat-food.webp').then((t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      return t
    }),
    fetch('/data/buildings.json').then((r) => r.json()),
    fetch('/data/filler.bin').then((r) => r.arrayBuffer()),
    fetch('/data/transit.json').then((r) => r.json()),
    fetch('/data/stations.json').then((r) => r.json()),
  ])
  onProgress('city')
  return { heights, mapTexture, heatFood, buildings, filler: new Float32Array(fillerBuf), transit, stations }
}

