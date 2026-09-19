import { useMemo } from 'react'
import * as THREE from 'three'
import { WORLD } from '../lib/geo'
import type { World } from '../lib/world'

const GRID = 512

const cache = new WeakMap<World, THREE.BufferGeometry>()

/** The displaced terrain grid, built once per world and shared by every layer that drapes over the ground. */
export function useTerrainGeometry(world: World): THREE.BufferGeometry {
  return useMemo(() => {
    const hit = cache.get(world)
    if (hit) return hit
    const n = GRID
    const pos = new Float32Array(n * n * 3)
    const uv = new Float32Array(n * n * 2)
    const idx = new Uint32Array((n - 1) * (n - 1) * 6)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), v = j / (n - 1)
        const x = (u - 0.5) * WORLD.width, z = (v - 0.5) * WORLD.depth
        const k = j * n + i
        pos[k * 3] = x
        pos[k * 3 + 1] = world.heights.yAt(x, z)
        pos[k * 3 + 2] = z
        uv[k * 2] = u
        uv[k * 2 + 1] = 1 - v
      }
    }
    let o = 0
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1
        idx[o++] = a; idx[o++] = c; idx[o++] = b
        idx[o++] = b; idx[o++] = c; idx[o++] = d
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    cache.set(world, g)
    return g
  }, [world])
}

export function Terrain({ world }: { world: World }) {
  const geometry = useTerrainGeometry(world)
  return (
    <mesh geometry={geometry} raycast={() => null} receiveShadow>
      <meshStandardMaterial map={world.mapTexture} roughness={1} metalness={0} />
    </mesh>
  )
}
