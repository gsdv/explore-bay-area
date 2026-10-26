import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2 } from 'three-stdlib'
import { project } from '../../lib/geo'
import { timeRange } from '../days'
import type { World } from '../world'
import { useStore } from '../store'

const POLE_VERT = /* glsl */ `
  varying float vY;
  void main() {
    vY = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`
const POLE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying float vY;
  void main() {
    // a soft pulse sliding from the pin (top, vY=1) down to the ground, on a faint base
    float p = 1.0 - fract(uTime * 0.55);
    float d = vY - p;
    float pulse = exp(-d * d * 90.0) * step(0.0, d) + exp(-d * d * 900.0);
    float a = 0.28 + 0.72 * clamp(pulse, 0.0, 1.0);
    gl_FragColor = vec4(uColor, a);
  }`

/** The open day as a draped, animated dashed path through its stops, with a numbered pin on a pole at each. A pin jumps the tour there. */
export function DayRoute({ world }: { world: World }) {
  const day = useStore((s) => s.day)
  const step = useStore((s) => s.step)
  const goToStop = useStore((s) => s.goToStop)
  const line = useRef<Line2>(null)
  const poleMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uTime: { value: 0 } },
        vertexShader: POLE_VERT,
        fragmentShader: POLE_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => {
    if (day) poleMat.uniforms.uColor.value.set(day.color)
  }, [day, poleMat])

  const { points, stops } = useMemo(() => {
    if (!day) return { points: [] as [number, number, number][], stops: [] }
    const stops = day.stops.map((s) => {
      const [x, z] = project(s.lat, s.lng)
      return { s, x, z, y: Math.max(0, world.heights.yAt(x, z)) }
    })
    const curve = new THREE.CatmullRomCurve3(stops.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal', 0.3)
    const n = Math.max(120, stops.length * 60)
    const points = curve.getPoints(n).map((p) => [p.x, Math.max(0, world.heights.yAt(p.x, p.z)) + 0.35, p.z] as [number, number, number])
    return { points, stops }
  }, [day, world])

  useFrame(({ clock }, dt) => {
    const m = line.current?.material as (THREE.ShaderMaterial & { dashOffset: number }) | undefined
    if (m) m.dashOffset -= dt * 1.2
    poleMat.uniforms.uTime.value = clock.elapsedTime
  })

  if (!day) return null
  return (
    <group>
      <Line ref={line} points={points} color={day.color} lineWidth={4.5} dashed dashSize={1.2} gapSize={0.7} depthWrite={false} raycast={() => null} renderOrder={3} />
      <Line points={points} color="#1b1d1a" lineWidth={7} transparent opacity={0.18} depthWrite={false} raycast={() => null} renderOrder={2} />
      {stops.map((p, i) => {
        const state = step === null ? '' : i === step ? ' is-current' : i < step ? ' is-passed' : ''
        return (
          <group key={p.s.id} position={[p.x, p.y, p.z]}>
            <mesh position-y={0.95} material={poleMat} raycast={() => null} renderOrder={4}>
              <cylinderGeometry args={[0.028, 0.028, 1.9, 6]} />
            </mesh>
            <Html position={[0, 2.1, 0]} center zIndexRange={[39, 30]}>
              <button
                className={'pin' + state}
                style={{ ['--day' as any]: day.color }}
                onClick={(e) => {
                  e.stopPropagation()
                  goToStop(i)
                }}
                title={`${timeRange(p.s.start, p.s.end)} · ${p.s.title}`}
              >
                <span className="pin__n">{i + 1}</span>
                <span className="pin__name">{p.s.title}</span>
              </button>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
