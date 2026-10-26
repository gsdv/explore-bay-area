import { useMemo } from 'react'
import * as THREE from 'three'
import { toUV, worldToUV } from '../../lib/geo'
import { BOX } from '../region'
import type { World } from '../world'

/** grid spacing in world units: about the heightmap's own pixel (≈80 m), so no detail is lost or invented */
const STEP = 0.75
/** the diorama's slab: the cut sides run from the ground (or the sea surface) down to here */
export const BASE = -3
const SIDE = '#c9b994'

/** The displaced terrain over the box, its uv in the regional map texture's space. */
function terrainGeometry(world: World): THREE.BufferGeometry {
  const nx = Math.ceil(BOX.width / STEP) + 1, nz = Math.ceil(BOX.depth / STEP) + 1
  const pos = new Float32Array(nx * nz * 3)
  const uv = new Float32Array(nx * nz * 2)
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = BOX.x0 + (i / (nx - 1)) * BOX.width, z = BOX.z0 + (j / (nz - 1)) * BOX.depth
      const k = j * nx + i
      const [u, v] = worldToUV(x, z)
      pos[k * 3] = x
      pos[k * 3 + 1] = world.heights.yAt(x, z)
      pos[k * 3 + 2] = z
      uv[k * 2] = u
      uv[k * 2 + 1] = 1 - v
    }
  }
  let o = 0
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
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
  return g
}

/** The four cut faces of the slab, following the ground's (or the sea's) edge down to BASE. */
function sideGeometry(world: World): THREE.BufferGeometry {
  const top = (x: number, z: number) => Math.max(0, world.heights.yAt(x, z))
  const pos: number[] = []
  // each edge walked so its outward side faces the viewer: north, east, south, west
  const edges: [number, number, number, number][] = [
    [BOX.x1, BOX.z0, BOX.x0, BOX.z0],
    [BOX.x1, BOX.z1, BOX.x1, BOX.z0],
    [BOX.x0, BOX.z1, BOX.x1, BOX.z1],
    [BOX.x0, BOX.z0, BOX.x0, BOX.z1],
  ]
  for (const [ax, az, bx, bz] of edges) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / STEP)
    for (let i = 0; i < n; i++) {
      const x0 = ax + ((bx - ax) * i) / n, z0 = az + ((bz - az) * i) / n
      const x1 = ax + ((bx - ax) * (i + 1)) / n, z1 = az + ((bz - az) * (i + 1)) / n
      const y0 = top(x0, z0), y1 = top(x1, z1)
      pos.push(x0, y0, z0, x0, BASE, z0, x1, y1, z1, x1, y1, z1, x0, BASE, z0, x1, BASE, z1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** The regional map with SF's sharper inset mixed in over its rectangle, feathered so the seam never shows. */
function groundMaterial(world: World): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: world.mapTexture, roughness: 1, metalness: 0 })
  const b = world.inset.bbox
  const [u0, v0] = toUV(b.north, b.west), [u1, v1] = toUV(b.south, b.east)
  // the mesh's uv is (u, 1 - v), so the inset's south edge is its origin
  const rect = new THREE.Vector4(u0, 1 - v1, 1 / (u1 - u0), 1 / (v1 - v0))
  m.onBeforeCompile = (shader) => {
    shader.uniforms.insetMap = { value: world.inset.texture }
    shader.uniforms.insetRect = { value: rect }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D insetMap;\nuniform vec4 insetRect;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 insetUv = (vMapUv - insetRect.xy) * insetRect.zw;
          vec2 insetEdge = min(insetUv, 1.0 - insetUv);
          float insetMix = smoothstep(0.0, 0.015, min(insetEdge.x, insetEdge.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(insetMap, insetUv).rgb, insetMix);
        }`,
      )
  }
  return m
}

export function Terrain({ world }: { world: World }) {
  const geometry = useMemo(() => terrainGeometry(world), [world])
  const sides = useMemo(() => sideGeometry(world), [world])
  const material = useMemo(() => groundMaterial(world), [world])
  return (
    <group>
      <mesh geometry={geometry} material={material} raycast={() => null} receiveShadow />
      <mesh geometry={sides} raycast={() => null}>
        <meshStandardMaterial color={SIDE} roughness={1} metalness={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
