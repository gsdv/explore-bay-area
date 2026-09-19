import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MapControls } from '@react-three/drei'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useStore } from '../store'
import { project } from '../lib/geo'
import { create } from 'zustand'

export type ZoomTier = 'far' | 'mid' | 'near'
const tierStore = create<{ tier: ZoomTier; dist: number }>(() => ({ tier: 'mid', dist: 100 }))
export const useZoomTier = () => tierStore((s) => s.tier)
export const useCameraDistance = () => tierStore((s) => s.dist)

const [SF_X, SF_Z] = project(37.787, -122.41)
export const HOME = { target: new THREE.Vector3(SF_X, 0.5, SF_Z), offset: new THREE.Vector3(20, 26, 40) }

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

export function CameraRig() {
  const controls = useRef<MapControlsImpl>(null)
  const { camera } = useThree()
  const fly = useStore((s) => s.fly)
  const anim = useRef<{ t: number; from: THREE.Vector3; to: THREE.Vector3; fromCam: THREE.Vector3; toCam: THREE.Vector3 } | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    camera.position.copy(HOME.target).add(HOME.offset)
    camera.lookAt(HOME.target)
    setReady(true)
  }, [camera])

  const handled = useRef(0)
  const startFly = () => {
    if (!fly || !controls.current) return
    handled.current = fly.nonce
    const c = controls.current
    const to = new THREE.Vector3(fly.x, 0.5, fly.z)
    const dir = camera.position.clone().sub(c.target)
    const dist = fly.distance ?? Math.min(dir.length(), 40)
    dir.normalize()
    // keep a pleasant pitch when arriving
    if (dir.y < 0.45) dir.y = 0.55
    dir.normalize().multiplyScalar(dist)
    anim.current = { t: 0, from: c.target.clone(), to, fromCam: camera.position.clone(), toCam: to.clone().add(dir) }
  }

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    if (fly && fly.nonce !== handled.current) startFly()
    if (anim.current) {
      const a = anim.current
      a.t = Math.min(1, a.t + dt / 1.4)
      const k = ease(a.t)
      c.target.lerpVectors(a.from, a.to, k)
      camera.position.lerpVectors(a.fromCam, a.toCam, k)
      if (a.t >= 1) anim.current = null
    }
    c.update()
    const d = camera.position.distanceTo(c.target)
    const tier: ZoomTier = d > 260 ? 'far' : d > 55 ? 'mid' : 'near'
    const s = tierStore.getState()
    if (s.tier !== tier || Math.abs(s.dist - d) > 2) tierStore.setState({ tier, dist: d })
  })

  if (!ready) return null
  return (
    <MapControls
      ref={controls}
      target={HOME.target}
      enableDamping
      dampingFactor={0.12}
      minDistance={4}
      maxDistance={950}
      maxPolarAngle={1.32}
      minPolarAngle={0.15}
      zoomSpeed={1.1}
      panSpeed={1}
      rotateSpeed={0.6}
      screenSpacePanning={false}
    />
  )
}
