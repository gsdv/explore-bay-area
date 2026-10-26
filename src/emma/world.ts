/**
 * Loads what Emma's scene draws, from the main app's baked public/data: the heightmap, the regional map texture with SF's
 * sharper inset, and the houses of SF plus the rest-of-region part (South San Francisco, Marin), cut to the box in region.ts.
 * No transit, washes, neighborhood names or the other cities.
 */
import * as THREE from 'three'
import { DETAIL_AREAS, HEIGHTMAP_SIZE, HEIGHT_OFFSET, elevationToY, worldToUV } from '../lib/geo'
import { BLOCK_STRIDE, decodeBlocks } from '../lib/blocks'
import { inBox } from './region'

export interface Heightmap {
  /** world y at world x,z (already exaggerated) */
  yAt(x: number, z: number): number
}

export interface Building {
  p: number[]
  h: number
  y: number
}

export interface World {
  heights: Heightmap
  mapTexture: THREE.Texture
  /** SF's sharper inset of the map texture and its box (DETAIL_AREAS 'sf'), blended over mapTexture by the terrain */
  inset: { texture: THREE.Texture; bbox: (typeof DETAIL_AREAS)[number]['bbox'] }
  /** one box per house, 7 floats each (see lib/blocks.ts) */
  blocks: Float32Array
  buildings: Building[]
}

async function loadHeightmap(): Promise<Heightmap> {
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
    yAt(x, z) {
      const [u, v] = worldToUV(x, z)
      return elevationToY(sample(u, v))
    },
  }
}

/** the blocks of one baked part whose position is inside the box */
function blocksInBox(all: Float32Array): Float32Array {
  const S = BLOCK_STRIDE
  const keep: number[] = []
  for (let i = 0; i < all.length; i += S) if (inBox(all[i], all[i + 2])) keep.push(i)
  const out = new Float32Array(keep.length * S)
  keep.forEach((i, k) => out.set(all.subarray(i, i + S), k * S))
  return out
}

/** an outline belongs to the box if its first corner does (they are a few dozen metres across) */
const buildingsInBox = (all: Building[]) => all.filter((b) => inBox(b.p[0], b.p[1]))

export async function loadWorld(): Promise<World> {
  const loader = new THREE.TextureLoader()
  const ground = (file: string) =>
    loader.loadAsync(file).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 16 // the ground is mostly seen at a grazing angle; three clamps this to what the GPU offers
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.generateMipmaps = true
      return t
    })
  const part = (id: string) =>
    Promise.all([
      fetch(`/data/blocks-${id}.bin`).then((r) => r.arrayBuffer()),
      fetch(`/data/buildings-${id}.json`).then((r) => r.json() as Promise<Building[]>),
    ]).then(([buf, buildings]) => ({ blocks: blocksInBox(decodeBlocks(buf)), buildings: buildingsInBox(buildings) }))

  const sf = DETAIL_AREAS.find((a) => a.id === 'sf')!
  const [heights, mapTexture, inset, city, rest] = await Promise.all([
    loadHeightmap(),
    ground('/data/map.webp'),
    ground('/data/map-sf.webp'),
    part('sf'),
    part('rest'),
  ])
  const blocks = new Float32Array(city.blocks.length + rest.blocks.length)
  blocks.set(city.blocks)
  blocks.set(rest.blocks, city.blocks.length)
  return { heights, mapTexture, inset: { texture: inset, bbox: sf.bbox }, blocks, buildings: [...city.buildings, ...rest.buildings] }
}
