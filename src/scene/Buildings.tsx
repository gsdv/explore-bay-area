import { useMemo } from 'react'
import * as THREE from 'three'
import { extrudeBuildings } from '../lib/extrude'
import { WORLD } from '../lib/geo'
import type { World } from '../lib/world'

const CHUNKS = 10

/** Downtown footprints (one merged mesh) + procedural blocks (instanced, chunked for frustum culling). */
export function Buildings({ world }: { world: World }) {
  const downtown = useMemo(() => extrudeBuildings(world.buildings), [world])

  const chunks = useMemo(() => {
    const f = world.filler
    const n = f.length / 7
    const buckets: number[][] = Array.from({ length: CHUNKS * CHUNKS }, () => [])
    for (let i = 0; i < n; i++) {
      const x = f[i * 7], z = f[i * 7 + 2]
      const cx = Math.min(CHUNKS - 1, Math.max(0, Math.floor((x / WORLD.width + 0.5) * CHUNKS)))
      const cz = Math.min(CHUNKS - 1, Math.max(0, Math.floor((z / WORLD.depth + 0.5) * CHUNKS)))
      buckets[cz * CHUNKS + cx].push(i)
    }
    const box = new THREE.BoxGeometry(1, 1, 1)
    box.translate(0, 0.5, 0)
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true })
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color()
    const up = new THREE.Vector3(0, 1, 0)
    return buckets
      .filter((b) => b.length)
      .map((b) => {
        const mesh = new THREE.InstancedMesh(box, mat, b.length)
        b.forEach((i, k) => {
          const o = i * 7
          p.set(f[o], f[o + 1] - 0.03, f[o + 2])
          q.setFromAxisAngle(up, f[o + 6])
          s.set(f[o + 3], f[o + 5], f[o + 4])
          m.compose(p, q, s)
          mesh.setMatrixAt(k, m)
          const r = ((i * 7919) % 100) / 100
          c.setHSL(0.09 + r * 0.04, 0.16, 0.8 + r * 0.12)
          mesh.setColorAt(k, c)
        })
        mesh.computeBoundingSphere()
        mesh.raycast = () => {}
        return mesh
      })
  }, [world])

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
