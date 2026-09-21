/**
 * Loads all generated data (public/data) once and exposes a height sampler.
 */
import * as THREE from 'three'
import { CITY_PARTS, DETAIL_AREAS, HEIGHTMAP_SIZE, HEIGHT_OFFSET, cityPartAt, elevationToY, project, worldToUV } from './geo'
import { decodeBlocks } from './blocks'
import type { HoodLabel, HoodsData } from './hoods'
import { startPoint } from './start'

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

/** The houses, building outlines and sharper ground of one city part (a detail area, or the rest of the region). */
export interface CityPart {
  id: string
  /** index into DETAIL_AREAS, −1 for the rest */
  area: number
  /** one box per house, 7 floats each (see blocks.ts) */
  blocks: Float32Array
  buildings: Building[]
  /** the area's sharper inset of the map texture, blended over mapTexture by the terrain (none for the rest) */
  inset: THREE.Texture | null
}

/** The ground washes the pipeline bakes (public/data/heat-food.webp, rent.webp, hoods.webp). */
export type HeatKind = 'food' | 'rent' | 'hoods'

export interface World {
  heights: Heightmap
  mapTexture: THREE.Texture
  /** pre-coloured washes draped over the terrain by scene/Heatmap.tsx */
  heat: Record<HeatKind, THREE.Texture>
  /** the city part the first view looks at: the only one the first frame waits for */
  city: CityPart[]
  /** every other part, nearest first; they download one after another once `city` is in (null = failed). See scene/useCity.ts */
  cityLater: Promise<CityPart | null>[]
  transit: TransitRoute[]
  stations: Station[]
  /** neighborhood / city names for the atlas wash, biggest area first */
  hoods: HoodLabel[]
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
  const wash = (file: string) =>
    loader.loadAsync(file).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      return t
    })
  const ground = (file: string) =>
    loader.loadAsync(file).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 16 // the ground is mostly seen at a grazing angle; three clamps this to what the GPU offers
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.generateMipmaps = true
      return t
    })
  const loadPart = async (id: string): Promise<CityPart> => {
    const area = DETAIL_AREAS.findIndex((a) => a.id === id)
    const [buf, buildings, inset] = await Promise.all([
      fetch(`/data/blocks-${id}.bin`).then((r) => r.arrayBuffer()),
      fetch(`/data/buildings-${id}.json`).then((r) => r.json() as Promise<Building[]>),
      area < 0 ? null : ground(`/data/map-${id}.webp`),
    ])
    return { id, area, blocks: decodeBlocks(buf), buildings, inset }
  }
  // the part under the first view, then the rest of the region (it surrounds everything), then the other areas by distance
  const [sx, sz] = startPoint()
  const first = cityPartAt(sx, sz)
  const away = (id: string) => {
    const b = DETAIL_AREAS.find((a) => a.id === id)
    if (!b) return 0
    const [x, z] = project((b.bbox.south + b.bbox.north) / 2, (b.bbox.west + b.bbox.east) / 2)
    return Math.hypot(x - sx, z - sz)
  }
  const later = CITY_PARTS.filter((id) => id !== first).sort((a, b) => away(a) - away(b))

  const [heights, mapTexture, city, heatFood, heatRent, heatHoods, transit, stations, hoods] = await Promise.all([
    loadHeightmap(onProgress),
    ground('/data/map.webp'),
    loadPart(first),
    wash('/data/heat-food.webp'),
    wash('/data/rent.webp'),
    wash('/data/hoods.webp'),
    fetch('/data/transit.json').then((r) => r.json()),
    fetch('/data/stations.json').then((r) => r.json()),
    fetch('/data/hoods.json').then((r) => r.json() as Promise<HoodsData>),
  ])
  onProgress('city')
  // one part at a time, so the nearest is whole soonest instead of all of them sharing the line
  let queue: Promise<unknown> = Promise.resolve()
  const cityLater = later.map((id) => {
    const part = queue.then(() => loadPart(id)).catch((e) => {
      console.warn(`city part ${id} failed to load`, e)
      return null
    })
    queue = part
    return part
  })
  return { heights, mapTexture, city: [city], cityLater, heat: { food: heatFood, rent: heatRent, hoods: heatHoods }, transit, stations, hoods: hoods.labels }
}

