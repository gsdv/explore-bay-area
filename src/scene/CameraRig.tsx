import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore } from '../store'
import { project, WORLD } from '../lib/geo'
import type { World } from '../lib/world'
import { viewStore, type ZoomTier } from './viewStore'

export { useZoomTier, useCameraDistance } from './viewStore'

/**
 * Custom map camera.
 *   arrows / WASD  move over the map (shift = faster)      Q / E  rotate
 *   left-drag      orbit (yaw + pitch)                      right-drag  pan
 *   scroll         camera height (orbit distance)
 * Hard bounds: the target stays inside the region, the distance is clamped, and the camera
 * never drops below a flat floor (FLOOR, world units above sea level) that clears most buildings.
 */
const LIMITS = { minDist: 2.2, maxDist: 520, minPitch: 0.16, maxPitch: 1.5, margin: 0.965 }
const FLOOR = 3.4
const [SF_X, SF_Z] = project(37.787, -122.41)
export const HOME = { x: SF_X, z: SF_Z, yaw: 0.46, pitch: 0.55, dist: 52 }

const ease = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

type Anim = { t: number; from: { x: number; z: number; dist: number; pitch: number }; to: { x: number; z: number; dist: number; pitch: number } }

const KEYMAP: Record<string, string> = {
  ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r',
  KeyQ: 'rl', KeyE: 'rr', ShiftLeft: 'fast', ShiftRight: 'fast',
}

export function CameraRig({ world }: { world: World }) {
  const { camera, gl } = useThree()
  const fly = useStore((s) => s.fly)
  const s = useRef({
    ...HOME,
    distGoal: HOME.dist,
    vx: 0,
    vz: 0,
    keys: new Set<string>(),
    drag: null as null | { button: number; lx: number; ly: number },
    anim: null as null | Anim,
    handled: 0,
    published: 0,
  }).current

  // ---- input ----
  useEffect(() => {
    const el = gl.domElement
    const isTyping = (e: KeyboardEvent) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const k = KEYMAP[e.code]
      if (!k) return
      s.keys.add(k)
      if (e.code.startsWith('Arrow')) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      const k = KEYMAP[e.code]
      if (k) s.keys.delete(k)
    }
    const blur = () => s.keys.clear()
    const pdown = (e: PointerEvent) => {
      if (e.button > 2) return
      s.drag = { button: e.button, lx: e.clientX, ly: e.clientY }
      el.setPointerCapture(e.pointerId)
    }
    const pmove = (e: PointerEvent) => {
      if (!s.drag) return
      const dx = e.clientX - s.drag.lx, dy = e.clientY - s.drag.ly
      s.drag.lx = e.clientX
      s.drag.ly = e.clientY
      if (s.drag.button === 0) {
        s.yaw -= dx * 0.0055
        s.pitch = clamp(s.pitch + dy * 0.0045, LIMITS.minPitch, LIMITS.maxPitch)
      } else {
        const k = s.dist * 0.0016
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw)
        const rx = -fz, rz = fx
        s.x += (-dx * rx + dy * fx) * k
        s.z += (-dx * rz + dy * fz) * k
      }
    }
    const pup = (e: PointerEvent) => {
      s.drag = null
      try { el.releasePointerCapture(e.pointerId) } catch {}
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      s.distGoal = clamp(s.distGoal * Math.exp(d * 0.0016), LIMITS.minDist, LIMITS.maxDist)
    }
    const ctx = (e: Event) => e.preventDefault()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    el.addEventListener('pointerdown', pdown)
    el.addEventListener('pointermove', pmove)
    el.addEventListener('pointerup', pup)
    el.addEventListener('pointercancel', pup)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', ctx)
    el.style.touchAction = 'none'
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      el.removeEventListener('pointerdown', pdown)
      el.removeEventListener('pointermove', pmove)
      el.removeEventListener('pointerup', pup)
      el.removeEventListener('pointercancel', pup)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', ctx)
    }
  }, [gl, s])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    // ---- fly-to requests ----
    if (fly && fly.nonce !== s.handled) {
      s.handled = fly.nonce
      const dist = clamp(fly.distance ?? Math.min(s.dist, 40), LIMITS.minDist, LIMITS.maxDist)
      s.anim = { t: 0, from: { x: s.x, z: s.z, dist: s.dist, pitch: s.pitch }, to: { x: fly.x, z: fly.z, dist, pitch: Math.max(s.pitch, 0.6) } }
      if (fly.instant) s.anim.t = 1 - 1e-6
      s.vx = s.vz = 0
    }
    if (s.anim) {
      const a = s.anim
      a.t = Math.min(1, a.t + dt / 1.4)
      const k = ease(a.t)
      s.x = a.from.x + (a.to.x - a.from.x) * k
      s.z = a.from.z + (a.to.z - a.from.z) * k
      s.dist = s.distGoal = a.from.dist + (a.to.dist - a.from.dist) * k
      s.pitch = a.from.pitch + (a.to.pitch - a.from.pitch) * k
      if (a.t >= 1) s.anim = null
    }
    // ---- keyboard movement (velocity-smoothed) ----
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw)
    const rx = -fz, rz = fx
    let ax = 0, az = 0
    if (s.keys.has('f')) { ax += fx; az += fz }
    if (s.keys.has('b')) { ax -= fx; az -= fz }
    if (s.keys.has('r')) { ax += rx; az += rz }
    if (s.keys.has('l')) { ax -= rx; az -= rz }
    const len = Math.hypot(ax, az)
    const speed = (s.keys.has('fast') ? 2.6 : 1) * Math.max(5, s.dist) * 0.75
    const tx = len ? (ax / len) * speed : 0, tz = len ? (az / len) * speed : 0
    const sm = Math.min(1, dt * (len ? 6 : 9))
    s.vx += (tx - s.vx) * sm
    s.vz += (tz - s.vz) * sm
    if (len || Math.abs(s.vx) + Math.abs(s.vz) > 0.01) {
      s.x += s.vx * dt
      s.z += s.vz * dt
      s.anim = null
    }
    if (s.keys.has('rl')) s.yaw += 1.3 * dt
    if (s.keys.has('rr')) s.yaw -= 1.3 * dt
    // ---- zoom smoothing ----
    s.dist += (s.distGoal - s.dist) * Math.min(1, dt * 9)

    // ---- bounds: the walls ----
    const hx = (WORLD.width / 2) * LIMITS.margin, hz = (WORLD.depth / 2) * LIMITS.margin
    if (s.x < -hx || s.x > hx) { s.x = clamp(s.x, -hx, hx); s.vx = 0 }
    if (s.z < -hz || s.z > hz) { s.z = clamp(s.z, -hz, hz); s.vz = 0 }
    s.dist = clamp(s.dist, LIMITS.minDist, LIMITS.maxDist)
    s.distGoal = clamp(s.distGoal, LIMITS.minDist, LIMITS.maxDist)
    s.pitch = clamp(s.pitch, LIMITS.minPitch, LIMITS.maxPitch)

    // ---- place the camera, never below the floor ----
    const ty = world.heights.yAt(s.x, s.z)
    const needed = FLOOR - ty
    if (needed > 0 && s.dist * Math.sin(s.pitch) < needed) {
      // tilt down first, then back off
      s.pitch = Math.min(LIMITS.maxPitch, Math.asin(Math.min(1, needed / s.dist)))
      if (s.dist * Math.sin(s.pitch) < needed) {
        s.dist = Math.min(LIMITS.maxDist, needed / Math.sin(s.pitch))
        s.distGoal = Math.max(s.distGoal, s.dist)
      }
    }
    const h = s.dist * Math.cos(s.pitch)
    const cx = s.x + h * Math.sin(s.yaw), cz = s.z + h * Math.cos(s.yaw), cy = ty + s.dist * Math.sin(s.pitch)
    camera.position.set(cx, cy, cz)
    camera.lookAt(s.x, ty, s.z)

    // ---- publish (throttled) ----
    s.published += dt
    const v = viewStore.getState()
    const tier: ZoomTier = s.dist > 260 ? 'far' : s.dist > 55 ? 'mid' : 'near'
    if (s.published > 0.08 || tier !== v.tier) {
      s.published = 0
      if (Math.abs(v.x - s.x) > 0.05 || Math.abs(v.z - s.z) > 0.05 || Math.abs(v.yaw - s.yaw) > 0.005 || Math.abs(v.dist - s.dist) > 0.2 || tier !== v.tier) {
        viewStore.setState({ x: s.x, z: s.z, yaw: s.yaw, dist: s.dist, tier })
      }
    }
  })

  return null
}

