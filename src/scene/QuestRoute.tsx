import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2 } from 'three-stdlib'
import { project } from '../lib/geo'
import type { World } from '../lib/world'
import { useStore } from '../store'

/** The active quest as a draped, animated dashed path with numbered stops. */
export function QuestRoute({ world }: { world: World }) {
  const quest = useStore((s) => s.activeQuest)
  const allProgress = useStore((s) => s.questProgress)
  const progress = quest ? allProgress[quest.id] ?? [] : []
  const toggleStop = useStore((s) => s.toggleStop)
  const line = useRef<Line2>(null)

  const { points, stops } = useMemo(() => {
    if (!quest) return { points: [] as [number, number, number][], stops: [] }
    const stops = quest.stops.map((s) => {
      const [x, z] = project(s.lat, s.lng)
      return { s, x, z, y: world.heights.yAt(x, z) }
    })
    const curve = new THREE.CatmullRomCurve3(stops.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal', 0.3)
    const n = Math.max(120, stops.length * 60)
    const points = curve.getPoints(n).map((p) => [p.x, world.heights.yAt(p.x, p.z) + 0.35, p.z] as [number, number, number])
    return { points, stops }
  }, [quest, world])

  useFrame((_, dt) => {
    const m = line.current?.material as THREE.ShaderMaterial & { dashOffset: number } | undefined
    if (m) m.dashOffset -= dt * 1.2
  })

  if (!quest) return null
  return (
    <group>
      <Line ref={line} points={points} color={quest.color} lineWidth={4.5} dashed dashSize={1.2} gapSize={0.7} depthWrite={false} raycast={() => null} renderOrder={3} />
      <Line points={points} color="#1b1d1a" lineWidth={7} transparent opacity={0.18} depthWrite={false} raycast={() => null} renderOrder={2} />
      {stops.map((p, i) => {
        const done = progress.includes(p.s.id)
        return (
          <group key={p.s.id} position={[p.x, p.y, p.z]}>
            <mesh position-y={0.9} raycast={() => null}>
              <cylinderGeometry args={[0.06, 0.06, 1.8, 6]} />
              <meshStandardMaterial color="#1b1d1a" />
            </mesh>
            <Html position={[0, 2.1, 0]} center zIndexRange={[60, 50]}>
              <button
                className={'quest-pin' + (done ? ' is-done' : '')}
                style={{ ['--quest' as any]: quest.color }}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleStop(quest.id, p.s.id)
                }}
                title={p.s.todo}
              >
                <span className="quest-pin__n">{done ? '✓' : i + 1}</span>
                <span className="quest-pin__name">{p.s.name}</span>
              </button>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
