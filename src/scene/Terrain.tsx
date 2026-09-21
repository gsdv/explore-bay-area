import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DETAIL_AREAS, WORLD, toUV } from '../lib/geo'
import type { World } from '../lib/world'
import { useCity } from './useCity'

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

/** An inset's sampler and how far it is mixed in (0 until its texture has arrived; the regional map stands in as the sampler). */
interface Inset {
  map: { value: THREE.Texture }
  on: { value: number }
}

/** The regional map with each detail area's sharper inset mixed in over its rectangle, feathered so the seams never show. */
function groundMaterial(world: World): { material: THREE.MeshStandardMaterial; insets: Inset[] } {
  const m = new THREE.MeshStandardMaterial({ map: world.mapTexture, roughness: 1, metalness: 0 })
  const insets: Inset[] = DETAIL_AREAS.map(() => ({ map: { value: world.mapTexture }, on: { value: 0 } }))
  // what the first frame waited for is sharp from the start; the others fade in as they arrive (see Terrain)
  for (const part of world.city) if (part.inset) insets[part.area] = { map: { value: part.inset }, on: { value: 1 } }
  const rects = DETAIL_AREAS.map(({ bbox: b }) => {
    const [u0, v0] = toUV(b.north, b.west), [u1, v1] = toUV(b.south, b.east)
    // the mesh's uv is (u, 1 - v), so an inset's south edge is its origin
    return new THREE.Vector4(u0, 1 - v1, 1 / (u1 - u0), 1 / (v1 - v0))
  })
  m.onBeforeCompile = (shader) => {
    // one sampler per inset, unrolled: GLSL won't index a sampler array with anything but a constant
    rects.forEach((rect, i) => {
      shader.uniforms[`insetMap${i}`] = insets[i].map
      shader.uniforms[`insetOn${i}`] = insets[i].on
      shader.uniforms[`insetRect${i}`] = { value: rect }
    })
    const pars = rects.map((_, i) => `uniform sampler2D insetMap${i};\nuniform vec4 insetRect${i};\nuniform float insetOn${i};`).join('\n')
    const mix = rects
      .map(
        (_, i) => `{
          vec2 insetUv = (vMapUv - insetRect${i}.xy) * insetRect${i}.zw;
          vec2 insetEdge = min(insetUv, 1.0 - insetUv);
          float insetMix = insetOn${i} * smoothstep(0.0, 0.015, min(insetEdge.x, insetEdge.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(insetMap${i}, insetUv).rgb, insetMix);
        }`,
      )
      .join('\n')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n${pars}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${mix}`)
  }
  return { material: m, insets }
}

export function Terrain({ world }: { world: World }) {
  const geometry = useTerrainGeometry(world)
  const { material, insets } = useMemo(() => groundMaterial(world), [world])
  const city = useCity(world)
  useEffect(() => {
    for (const part of city) if (part.inset) insets[part.area].map.value = part.inset
  }, [city, insets])
  useFrame((_, dt) => {
    for (const inset of insets) {
      if (inset.on.value < 1 && inset.map.value !== world.mapTexture) inset.on.value = Math.min(1, inset.on.value + Math.min(dt, 0.05) / 0.6)
    }
  })
  return <mesh geometry={geometry} material={material} raycast={() => null} receiveShadow />
}
