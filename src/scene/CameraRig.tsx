import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import { project, WORLD } from '../lib/geo'
import type { World } from '../lib/world'
import { viewStore, type ZoomTier } from './viewStore'

export { useZoomTier, useCameraDistance } from './viewStore'

/**
 * Map camera, "fly over a toy city" model:
 *   left-drag / one finger   grab the ground and pan (with inertia)
 *   right-drag / ctrl-drag   orbit around the point at screen centre (rotate + tilt)
 *   scroll / pinch           altitude, anchored on the ground under the cursor (zoom-to-cursor)
 *   arrows / WASD            pan (shift = fast)      Q / E rotate      R / F, PageUp / PageDown straight up / down
 *   double-click             fly to that spot
 * Pitch follows altitude by default (steep from high up, oblique near the ground); tilting adds an offset.
 * Hard bounds: camera x/z inside the region, altitude between FLOOR and CEILING.
 */
const FLOOR = 3.4 // world units (1 = 100 m) above sea level; clears most buildings
const CEILING = 420
const PITCH = { min: 0.2, max: 1.5, autoLow: 0.42, autoHigh: 1.3, altLow: 4, altHigh: 250 }
const TILT = { min: -0.5, max: 0.6 }
const MARGIN = 0.965
const [SF_X, SF_Z] = project(37.787, -122.41)
export const HOME = { x: SF_X, z: SF_Z, yaw: 0.46, alt: 30 }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smooth = (t: number) => t * t * (3 - 2 * t)
const ease = (t: number) => 1 - Math.pow(1 - t, 3)
/** default pitch (radians below horizontal) for an altitude */
const autoPitch = (alt: number) => {
  const t = clamp((Math.log(alt) - Math.log(PITCH.altLow)) / (Math.log(PITCH.altHigh) - Math.log(PITCH.altLow)), 0, 1)
  return PITCH.autoLow + (PITCH.autoHigh - PITCH.autoLow) * smooth(t)
}
/** view direction for yaw (0 = north) and pitch (down from horizontal) */
const dirOf = (yaw: number, pitch: number, out: THREE.Vector3) =>
  out.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))

const KEYMAP: Record<string, string> = {
  ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r',
  KeyQ: 'rl', KeyE: 'rr', KeyR: 'up', PageUp: 'up', KeyF: 'down', PageDown: 'down', ShiftLeft: 'fast', ShiftRight: 'fast',
}

type Anim = { t: number; from: { p: THREE.Vector3; yaw: number; pitch: number }; to: { p: THREE.Vector3; yaw: number; pitch: number } }
type Drag =
  | { kind: 'pan'; plane: number; last: THREE.Vector3; vel: THREE.Vector3; lastT: number }
  | { kind: 'orbit'; c: THREE.Vector3; d: number; lx: number; ly: number }
  | { kind: 'pinch'; d0: number; alt0: number; a0: number; my0: number }

export function CameraRig({ world }: { world: World }) {
  const { camera, gl } = useThree()
  const fly = useStore((s) => s.fly)
  const s = useRef({
    p: new THREE.Vector3(),
    yaw: HOME.yaw,
    tilt: 0,
    pitch: autoPitch(HOME.alt),
    altGoal: HOME.alt,
    anchor: new THREE.Vector3(),
    center: new THREE.Vector3(HOME.x, 0, HOME.z),
    centerDist: 40,
    keys: new Set<string>(),
    pointers: new Map<number, { x: number; y: number }>(),
    drag: null as Drag | null,
    inertia: new THREE.Vector3(),
    anim: null as Anim | null,
    handled: 0,
    published: 0,
    init: false,
  }).current
  const tmp = useRef({ v: new THREE.Vector3(), d: new THREE.Vector3(), g: new THREE.Vector3() }).current

  /** ground hit for a client position on a horizontal plane; falls back to a far point when looking at the sky */
  const groundAt = (clientX: number, clientY: number, planeY: number, out: THREE.Vector3) => {
    const r = gl.domElement.getBoundingClientRect()
    tmp.v.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize()
    let t = (planeY - camera.position.y) / tmp.v.y
    if (!(t > 0) || t > 2000) t = 2000
    return out.copy(camera.position).addScaledVector(tmp.v, t)
  }

  useEffect(() => {
    const el = gl.domElement
    const isTyping = (e: KeyboardEvent) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const k = KEYMAP[e.code]
      if (!k) return
      s.keys.add(k)
      if (e.code.startsWith('Arrow') || e.code.startsWith('Page')) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      const k = KEYMAP[e.code]
      if (k) s.keys.delete(k)
    }
    const blur = () => s.keys.clear()

    const pdown = (e: PointerEvent) => {
      if (e.button > 2) return
      el.setPointerCapture(e.pointerId)
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      s.anim = null
      if (s.pointers.size === 2) {
        const [a, b] = [...s.pointers.values()]
        s.drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), alt0: s.p.y, a0: Math.atan2(b.y - a.y, b.x - a.x), my0: (a.y + b.y) / 2 }
        return
      }
      const orbit = e.button === 2 || e.button === 1 || e.ctrlKey || e.metaKey
      if (orbit) {
        s.drag = { kind: 'orbit', c: s.center.clone(), d: s.centerDist, lx: e.clientX, ly: e.clientY }
      } else {
        const plane = world.heights.yAt(s.center.x, s.center.z)
        s.drag = { kind: 'pan', plane, last: groundAt(e.clientX, e.clientY, plane, new THREE.Vector3()), vel: new THREE.Vector3(), lastT: performance.now() }
        s.inertia.set(0, 0, 0)
        el.style.cursor = 'grabbing'
      }
    }
    const pmove = (e: PointerEvent) => {
      const pt = s.pointers.get(e.pointerId)
      if (!pt) return
      pt.x = e.clientX
      pt.y = e.clientY
      const d = s.drag
      if (!d) return
      if (d.kind === 'pinch' && s.pointers.size === 2) {
        const [a, b] = [...s.pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        s.altGoal = clamp((d.alt0 * d.d0) / Math.max(1, dist), FLOOR, CEILING)
        groundAt((a.x + b.x) / 2, (a.y + b.y) / 2, 0, s.anchor)
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        s.yaw += ang - d.a0
        d.a0 = ang
        const my = (a.y + b.y) / 2
        s.tilt = clamp(s.tilt + (my - d.my0) * 0.004, TILT.min, TILT.max)
        d.my0 = my
        return
      }
      if (d.kind === 'pan') {
        const g = groundAt(e.clientX, e.clientY, d.plane, tmp.g)
        const dx = d.last.x - g.x, dz = d.last.z - g.z
        s.p.x += dx
        s.p.z += dz
        const now = performance.now(), dt = Math.max(1, now - d.lastT) / 1000
        d.vel.set(dx / dt, 0, dz / dt)
        d.lastT = now
        // the camera moved, so re-evaluate the grab point under the same cursor next move
        d.last.copy(g).add(new THREE.Vector3(dx, 0, dz))
      } else if (d.kind === 'orbit') {
        const dx = e.clientX - d.lx, dy = e.clientY - d.ly
        d.lx = e.clientX
        d.ly = e.clientY
        s.yaw -= dx * 0.005
        const pitch = clamp(s.pitch + dy * 0.004, PITCH.min, PITCH.max)
        dirOf(s.yaw, pitch, tmp.d)
        s.p.copy(d.c).addScaledVector(tmp.d, -d.d)
        s.tilt = clamp(pitch - autoPitch(s.p.y), TILT.min, TILT.max)
      }
    }
    const pup = (e: PointerEvent) => {
      s.pointers.delete(e.pointerId)
      try { el.releasePointerCapture(e.pointerId) } catch {}
      if (s.drag?.kind === 'pan' && performance.now() - s.drag.lastT < 80) s.inertia.copy(s.drag.vel)
      s.drag = null
      el.style.cursor = ''
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      s.altGoal = clamp(s.altGoal * Math.exp(dy * 0.0016), FLOOR, CEILING)
      groundAt(e.clientX, e.clientY, 0, s.anchor)
      s.anim = null
    }
    const dbl = (e: MouseEvent) => {
      const g = groundAt(e.clientX, e.clientY, 0, new THREE.Vector3())
      useStore.getState().flyTo(g.x, g.z, Math.max(6, s.centerDist * 0.45))
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
    el.addEventListener('dblclick', dbl)
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
      el.removeEventListener('dblclick', dbl)
      el.removeEventListener('contextmenu', ctx)
    }
  }, [gl, s, camera, world, tmp])

  /** camera placement so that ground point (x,z) sits at screen centre `dist` away along the current yaw */
  const placeFor = (x: number, z: number, dist: number, yaw: number) => {
    const gy = world.heights.yAt(x, z)
    let pitch = s.pitch
    for (let i = 0; i < 4; i++) pitch = clamp(autoPitch(Math.max(FLOOR, gy + dist * Math.sin(pitch))) + s.tilt, PITCH.min, PITCH.max)
    const p = dirOf(yaw, pitch, new THREE.Vector3()).multiplyScalar(-dist).add(new THREE.Vector3(x, gy, z))
    p.y = clamp(p.y, FLOOR, CEILING)
    return { p, pitch }
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    if (!s.init) {
      s.init = true
      const { p, pitch } = placeFor(HOME.x, HOME.z, HOME.alt / Math.sin(autoPitch(HOME.alt)), HOME.yaw)
      s.p.copy(p)
      s.pitch = pitch
      s.altGoal = p.y
    }
    // ---- fly-to ----
    if (fly && fly.nonce !== s.handled) {
      s.handled = fly.nonce
      const dist = clamp(fly.distance ?? Math.min(s.centerDist, 40), 3, CEILING)
      const { p, pitch } = placeFor(fly.x, fly.z, dist, s.yaw)
      s.anim = { t: fly.instant ? 1 - 1e-6 : 0, from: { p: s.p.clone(), yaw: s.yaw, pitch: s.pitch }, to: { p, yaw: s.yaw, pitch } }
      s.inertia.set(0, 0, 0)
    }
    if (s.anim) {
      const a = s.anim
      a.t = Math.min(1, a.t + dt / 1.4)
      const k = ease(a.t)
      s.p.lerpVectors(a.from.p, a.to.p, k)
      s.pitch = a.from.pitch + (a.to.pitch - a.from.pitch) * k
      s.altGoal = s.p.y
      s.tilt = clamp(s.pitch - autoPitch(s.p.y), TILT.min, TILT.max)
      if (a.t >= 1) s.anim = null
    }
    // ---- keys ----
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = -fz, rz = fx
    let ax = 0, az = 0
    if (s.keys.has('f')) { ax += fx; az += fz }
    if (s.keys.has('b')) { ax -= fx; az -= fz }
    if (s.keys.has('r')) { ax += rx; az += rz }
    if (s.keys.has('l')) { ax -= rx; az -= rz }
    const fast = s.keys.has('fast') ? 2.6 : 1
    if (ax || az) {
      const len = Math.hypot(ax, az)
      const speed = fast * Math.max(4, s.p.y) * 0.9
      s.inertia.x += ((ax / len) * speed - s.inertia.x) * Math.min(1, dt * 6)
      s.inertia.z += ((az / len) * speed - s.inertia.z) * Math.min(1, dt * 6)
      s.anim = null
    }
    if (s.keys.has('rl') || s.keys.has('rr')) {
      const dy = (s.keys.has('rl') ? 1.3 : -1.3) * dt
      // rotate around the screen-centre ground point
      dirOf(s.yaw + dy, s.pitch, tmp.d)
      s.p.copy(s.center).addScaledVector(tmp.d, -s.centerDist)
      s.yaw += dy
    }
    if (s.keys.has('up') || s.keys.has('down')) {
      s.altGoal = clamp(s.altGoal * Math.exp((s.keys.has('up') ? 1.4 : -1.4) * fast * dt), FLOOR, CEILING)
      s.anchor.set(s.p.x, 0, s.p.z)
      s.anim = null
    }
    // ---- pan inertia ----
    if (!s.drag && s.inertia.lengthSq() > 1e-4) {
      s.p.x += s.inertia.x * dt
      s.p.z += s.inertia.z * dt
      const decay = Math.exp(-dt * (ax || az ? 0 : 5))
      s.inertia.multiplyScalar(decay)
    }
    // ---- altitude toward goal, anchored on the ground point under the cursor ----
    if (Math.abs(s.altGoal - s.p.y) > 0.002) {
      const alt = s.p.y - s.anchor.y, goal = s.altGoal - s.anchor.y
      const next = alt + (goal - alt) * Math.min(1, dt * 9)
      const f = next / alt
      s.p.x = s.anchor.x + (s.p.x - s.anchor.x) * f
      s.p.z = s.anchor.z + (s.p.z - s.anchor.z) * f
      s.p.y = s.anchor.y + next
    }
    // ---- bounds ----
    const hx = (WORLD.width / 2) * MARGIN, hz = (WORLD.depth / 2) * MARGIN
    if (s.p.x < -hx || s.p.x > hx) { s.p.x = clamp(s.p.x, -hx, hx); s.inertia.x = 0 }
    if (s.p.z < -hz || s.p.z > hz) { s.p.z = clamp(s.p.z, -hz, hz); s.inertia.z = 0 }
    s.p.y = clamp(s.p.y, FLOOR, CEILING)
    s.altGoal = clamp(s.altGoal, FLOOR, CEILING)
    if (!s.anim) s.pitch = clamp(autoPitch(s.p.y) + s.tilt, PITCH.min, PITCH.max)

    // ---- apply ----
    camera.position.copy(s.p)
    dirOf(s.yaw, s.pitch, tmp.d)
    camera.lookAt(tmp.v.copy(s.p).add(tmp.d))
    // screen-centre ground point (two passes so the terrain height converges)
    let gy = world.heights.yAt(s.center.x, s.center.z)
    for (let i = 0; i < 2; i++) {
      const t = Math.max(0.5, (s.p.y - gy) / Math.max(0.05, Math.sin(s.pitch)))
      s.center.copy(s.p).addScaledVector(tmp.d, t)
      s.centerDist = t
      gy = world.heights.yAt(s.center.x, s.center.z)
    }

    // ---- publish ----
    s.published += dt
    const v = viewStore.getState()
    const tier: ZoomTier = s.centerDist > 260 ? 'far' : s.centerDist > 55 ? 'mid' : 'near'
    if (s.published > 0.08 || tier !== v.tier) {
      s.published = 0
      if (Math.abs(v.x - s.center.x) > 0.05 || Math.abs(v.z - s.center.z) > 0.05 || Math.abs(v.yaw - s.yaw) > 0.005 || Math.abs(v.dist - s.centerDist) > 0.2 || tier !== v.tier) {
        viewStore.setState({ x: s.center.x, z: s.center.z, yaw: s.yaw, dist: s.centerDist, tier })
      }
    }
  })

  return null
}
