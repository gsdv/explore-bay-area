import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { extrudeBuildings } from '../lib/extrude'
import { WORLD } from '../lib/geo'
import type { World } from '../lib/world'

/** World units (25 km): past this a house is about a pixel tall, so its chunk is skipped. */
const HOUSE_RANGE = 250
const CHUNKS = 20 // ≈4 km cells: SF alone holds ~200k blocks, so cull it in pieces

/**
 * House paint, as [hue, saturation, lightness]. SF is mostly cream, white and grey stucco with the odd pastel,
 * so the neutrals are listed more than once; everything stays pale enough to sit on the paper palette.
 */
const PAINT: [number, number, number][] = [
  [0.1, 0.22, 0.88], [0.1, 0.22, 0.88], [0.11, 0.14, 0.92], [0.11, 0.14, 0.92], [0.09, 0.08, 0.84], [0.09, 0.08, 0.84],
  [0.13, 0.5, 0.84], // butter
  [0.05, 0.48, 0.84], // peach
  [0.98, 0.4, 0.86], // rose
  [0.27, 0.26, 0.8], // sage
  [0.56, 0.34, 0.83], // fog blue
  [0.06, 0.42, 0.74], // terracotta wash
]
/** Flat tar-and-gravel roofs: the top face of every block goes most of the way to this, keeping a little of its paint. */
const ROOF = new THREE.Color('#ded9cd')

/** Blocks are painted per instance; this greys their top faces so they read as walls + roof instead of solid bricks. */
function blockMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.roofColor = { value: ROOF }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRoof;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoof = normal.y;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRoof;\nuniform vec3 roofColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, roofColor, 0.7 * step(0.5, vRoof));')
  }
  return mat
}

/** Footprints with a true outline (one merged mesh) + a block per house, real in SF and procedural elsewhere (instanced, chunked for frustum culling). */
export function Buildings({ world }: { world: World }) {
  const downtown = useMemo(() => extrudeBuildings(world.buildings), [world])

  const chunks = useMemo(() => {
    const f = world.filler
    const n = f.length / 7
    const buckets: number[][] = Array.from({ length: CHUNKS * CHUNKS * 2 }, () => [])
    for (let i = 0; i < n; i++) {
      const x = f[i * 7], z = f[i * 7 + 2]
      const cx = Math.min(CHUNKS - 1, Math.max(0, Math.floor((x / WORLD.width + 0.5) * CHUNKS)))
      const cz = Math.min(CHUNKS - 1, Math.max(0, Math.floor((z / WORLD.depth + 0.5) * CHUNKS)))
      // two meshes per chunk: houses, which drop out once they are about a pixel (HOUSE_RANGE), and everything bigger
      const o = i * 7
      const house = f[o + 3] * f[o + 4] < 0.04 && f[o + 5] < 0.4 // under 400 m² and ~20 m
      buckets[(cz * CHUNKS + cx) * 2 + (house ? 1 : 0)].push(i)
    }
    const box = new THREE.BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    // nobody sees the underside: BoxGeometry's faces are +x −x +y −y +z −z, six indices each
    const idx = Array.from(box.index!.array)
    box.setIndex([...idx.slice(0, 18), ...idx.slice(24)])
    const mat = blockMaterial()
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color()
    const up = new THREE.Vector3(0, 1, 0)
    return buckets
      .map((b, bi) => ({ b, house: bi % 2 === 1 }))
      .filter(({ b }) => b.length)
      .map(({ b, house }) => {
        const mesh = new THREE.InstancedMesh(box, mat, b.length)
        b.forEach((i, k) => {
          const o = i * 7
          p.set(f[o], f[o + 1], f[o + 2])
          q.setFromAxisAngle(up, f[o + 6])
          s.set(f[o + 3], f[o + 5], f[o + 4])
          m.compose(p, q, s)
          mesh.setMatrixAt(k, m)
          const r = ((i * 7919) % 100) / 100
          const [hue, sat, light] = PAINT[(i * 2654435761) % PAINT.length]
          c.setHSL(hue, sat, light + (r - 0.5) * 0.06)
          mesh.setColorAt(k, c)
        })
        mesh.computeBoundingSphere()
        mesh.raycast = () => {}
        mesh.userData.house = house
        return mesh
      })
  }, [world])

  // with ~400k real houses the far view would draw millions of sub-pixel triangles: cull house chunks by distance
  useFrame(({ camera }) => {
    for (const mesh of chunks) {
      if (!mesh.userData.house) continue
      const sphere = mesh.boundingSphere!
      mesh.visible = camera.position.distanceTo(sphere.center) - sphere.radius < HOUSE_RANGE
    }
  })

  return (
    <group>
      <mesh geometry={downtown} raycast={() => null} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} metalness={0} />
      </mesh>
      {chunks.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  )
}
