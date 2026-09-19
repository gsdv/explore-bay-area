import * as THREE from 'three'
import type { Landmark } from '../data/landmarks'
import { project, UNIT, BUILDING_EXAGGERATION } from '../lib/geo'

export interface Part {
  geo: 'box' | 'cyl' | 'cone' | 'sphere' | 'ring'
  pos: [number, number, number]
  rot?: [number, number, number]
  scale: [number, number, number]
  color: string
  args?: (number | boolean)[]
}

const ORANGE = '#f04a00'
const STONE = '#efe8d8'
const CONCRETE = '#d9d5cc'
const GREEN = '#6fa35a'
const RED = '#c9463d'
const H = (m: number) => m * UNIT * BUILDING_EXAGGERATION

/** Returns primitive parts in landmark-local space (y up, origin at ground). */
export function landmarkParts(l: Landmark): Part[] {
  switch (l.kind) {
    case 'bridge': {
      const [x1, z1] = project(l.lat, l.lng)
      const [x2, z2] = project(l.lat2!, l.lng2!)
      const len = Math.hypot(x2 - x1, z2 - z1)
      const isGG = l.id === 'ggb'
      const col = isGG ? ORANGE : '#c8cbd0'
      const deckH = isGG ? 0.9 : 0.6
      const towerH = isGG ? 3.4 : 2.4
      const parts: Part[] = [{ geo: 'box', pos: [len / 2, deckH, 0], scale: [len, 0.12, 0.5], color: col }]
      const towers = isGG ? [0.29, 0.71] : [0.12, 0.28, 0.44, 0.78]
      for (const t of towers) {
        for (const side of [-0.18, 0.18]) parts.push({ geo: 'box', pos: [len * t, towerH / 2, side], scale: [0.16, towerH, 0.12], color: col })
        parts.push({ geo: 'box', pos: [len * t, towerH * 0.95, 0], scale: [0.16, 0.12, 0.5], color: col })
        parts.push({ geo: 'box', pos: [len * t, towerH * 0.6, 0], scale: [0.16, 0.12, 0.5], color: col })
      }
      // main cables as thin boxes sagging between towers (approximation: straight segments)
      if (isGG) {
        const [a, b] = towers
        parts.push({ geo: 'box', pos: [len * (a + b) / 2, towerH * 0.72, -0.2], scale: [len * (b - a), 0.04, 0.04], color: col })
        parts.push({ geo: 'box', pos: [len * (a + b) / 2, towerH * 0.72, 0.2], scale: [len * (b - a), 0.04, 0.04], color: col })
      }
      return parts
    }
    case 'tower':
      return [
        { geo: 'cyl', pos: [0, H(l.height ?? 200) / 2, 0], scale: [1, H(l.height ?? 200), 1], color: '#cfd6dd', args: [0.55, 0.7, 24] },
        { geo: 'cyl', pos: [0, H(l.height ?? 200) + 0.12, 0], scale: [1, 0.25, 1], color: '#f4f2ec', args: [0.4, 0.55, 24] },
      ]
    case 'pyramid':
      return [
        { geo: 'cone', pos: [0, H(l.height ?? 200) / 2, 0], scale: [1, H(l.height ?? 200), 1], color: '#e9e6df', args: [0.6, 4] },
        { geo: 'box', pos: [0, H(l.height ?? 200) * 0.9, 0], scale: [0.16, H(l.height ?? 200) * 0.25, 0.16], color: '#d0cdc4' },
      ]
    case 'coit':
      return [
        { geo: 'cyl', pos: [0, 0.1, 0], scale: [1, 0.2, 1], color: STONE, args: [0.6, 0.6, 16] },
        { geo: 'cyl', pos: [0, H(l.height ?? 64) / 2, 0], scale: [1, H(l.height ?? 64), 1], color: STONE, args: [0.28, 0.32, 16] },
        { geo: 'cyl', pos: [0, H(l.height ?? 64) + 0.08, 0], scale: [1, 0.16, 1], color: '#e0d8c4', args: [0.36, 0.28, 16] },
      ]
    case 'sutro': {
      const h = H(l.height ?? 298)
      const p: Part[] = []
      for (const [dx, dz] of [[-0.35, 0], [0.35, 0], [0, 0.3]] as const) {
        p.push({ geo: 'box', pos: [dx * 0.6, h * 0.55, dz * 0.6], rot: [0, 0, 0], scale: [0.09, h * 1.1, 0.09], color: '#d94b32' })
      }
      p.push({ geo: 'box', pos: [0, h * 0.35, 0.05], scale: [1.0, 0.08, 0.08], color: '#f2f2f2' })
      p.push({ geo: 'box', pos: [0, h * 0.75, 0.05], scale: [1.0, 0.08, 0.08], color: '#f2f2f2' })
      return p
    }
    case 'ferry':
      return [
        { geo: 'box', pos: [0, 0.22, 0], scale: [2.6, 0.44, 0.45], color: '#e6dcc4' },
        { geo: 'box', pos: [0, 0.75, 0], scale: [0.36, 1.1, 0.36], color: '#e6dcc4' },
        { geo: 'cone', pos: [0, 1.42, 0], scale: [1, 0.3, 1], color: '#b7b0a0', args: [0.25, 4] },
      ]
    case 'rotunda':
      return [
        { geo: 'cyl', pos: [0, 0.5, 0], scale: [1, 1, 1], color: '#e5cfa8', args: [0.75, 0.8, 8, 1, true] },
        { geo: 'sphere', pos: [0, 1.0, 0], scale: [0.85, 0.5, 0.85], color: '#c9906a', args: [1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2] },
        { geo: 'box', pos: [1.6, 0.4, 0], scale: [1.8, 0.8, 0.35], color: '#e5cfa8' },
      ]
    case 'stadium':
      return [
        { geo: 'cyl', pos: [0, 0.35, 0], scale: [1.4, 0.7, 1.1], color: '#d5cbb8', args: [1, 1.1, 20, 1, true] },
        { geo: 'cyl', pos: [0, 0.02, 0], scale: [1.4, 0.04, 1.1], color: GREEN, args: [0.85, 0.85, 20] },
      ]
    case 'arena':
      return [{ geo: 'cyl', pos: [0, 0.4, 0], scale: [1, 0.8, 1], color: '#e8e2d6', args: [1.1, 1.2, 24] }]
    case 'peak':
      return [
        { geo: 'cone', pos: [0, 0.35, 0], scale: [1, 0.7, 1], color: '#c9b98f', args: [0.55, 6] },
        { geo: 'box', pos: [0, 0.9, 0], scale: [0.05, 0.6, 0.05], color: '#4a4a4a' },
        { geo: 'box', pos: [0.13, 1.08, 0], scale: [0.26, 0.16, 0.02], color: ORANGE },
      ]
    case 'park':
      return [
        { geo: 'sphere', pos: [-0.5, 0.45, 0.1], scale: [0.5, 0.5, 0.5], color: GREEN },
        { geo: 'sphere', pos: [0.2, 0.55, -0.2], scale: [0.6, 0.6, 0.6], color: '#5c9350' },
        { geo: 'sphere', pos: [0.6, 0.4, 0.35], scale: [0.45, 0.45, 0.45], color: '#7db068' },
        { geo: 'cyl', pos: [-0.5, 0.15, 0.1], scale: [1, 0.3, 1], color: '#8a5a3c', args: [0.06, 0.08, 6] },
        { geo: 'cyl', pos: [0.2, 0.2, -0.2], scale: [1, 0.4, 1], color: '#8a5a3c', args: [0.07, 0.09, 6] },
        { geo: 'cyl', pos: [0.6, 0.12, 0.35], scale: [1, 0.25, 1], color: '#8a5a3c', args: [0.05, 0.07, 6] },
      ]
    case 'forest':
      return [0, 1, 2, 3, 4, 5].map((i) => ({
        geo: 'cone' as const,
        pos: [Math.cos(i * 1.7) * 0.6, 0.6 + (i % 2) * 0.2, Math.sin(i * 1.7) * 0.6],
        scale: [1, 1.2 + (i % 3) * 0.3, 1],
        color: i % 2 ? '#3f7a45' : '#4f8f52',
        args: [0.32, 7],
      }))
    case 'beach':
      return [
        { geo: 'box', pos: [0, 0.03, 0], rot: [0, 0.4, 0], scale: [1.8, 0.06, 0.8], color: '#f0e2b8' },
        { geo: 'sphere', pos: [0.4, 0.2, 0.15], scale: [0.22, 0.22, 0.22], color: '#3f6fb0' },
        { geo: 'box', pos: [-0.4, 0.25, -0.1], scale: [0.06, 0.5, 0.06], color: '#e35c3b' },
      ]
    case 'houses': {
      const p: Part[] = []
      for (const i of [-2, -1, 0, 1, 2]) {
        p.push({ geo: 'box', pos: [i * 0.36, 0.3, 0], scale: [0.3, 0.6, 0.4], color: ['#d7a3bd', '#a8c7d8', '#e9d7a0', '#b9d3b1', '#e3b09c'][i + 2] })
        p.push({ geo: 'cone', pos: [i * 0.36, 0.7, 0], scale: [1, 0.22, 1], color: '#5c4a44', args: [0.24, 4] })
      }
      return p
    }
    case 'island':
      return [
        { geo: 'box', pos: [0, 0.3, 0], scale: [1.2, 0.6, 0.6], color: CONCRETE },
        { geo: 'cyl', pos: [0.4, 0.85, 0], scale: [1, 0.5, 1], color: '#ecebe6', args: [0.12, 0.14, 10] },
        { geo: 'cone', pos: [0.4, 1.18, 0], scale: [1, 0.18, 1], color: RED, args: [0.16, 8] },
      ]
    case 'campanile':
      return [
        { geo: 'box', pos: [0, H(l.height ?? 90) / 2, 0], scale: [0.36, H(l.height ?? 90), 0.36], color: STONE },
        { geo: 'cone', pos: [0, H(l.height ?? 90) + 0.22, 0], scale: [1, 0.45, 1], color: '#b0a894', args: [0.3, 4] },
      ]
    case 'campus':
      return [
        { geo: 'box', pos: [0, H(l.height ?? 87) / 2, 0], scale: [0.4, H(l.height ?? 87), 0.4], color: '#e4d2b0' },
        { geo: 'sphere', pos: [0, H(l.height ?? 87) + 0.1, 0], scale: [0.32, 0.3, 0.32], color: '#c0392b' },
        { geo: 'box', pos: [1.2, 0.25, 0.6], scale: [1.8, 0.5, 1.2], color: '#e4d2b0' },
        { geo: 'box', pos: [1.2, 0.6, 0.6], scale: [1.9, 0.14, 1.3], color: '#b5502f' },
      ]
    case 'museum':
      return [
        { geo: 'box', pos: [0, 0.3, 0], scale: [1.4, 0.6, 0.8], color: '#e0d4bb' },
        { geo: 'box', pos: [0, 0.68, 0], scale: [1.5, 0.12, 0.9], color: '#a89f8c' },
      ]
    case 'wharf':
      return [
        { geo: 'box', pos: [0, 0.12, 0], scale: [1.5, 0.24, 0.7], color: '#c4a87a' },
        { geo: 'box', pos: [-0.3, 0.45, 0], scale: [0.5, 0.4, 0.5], color: '#d9d0c0' },
        { geo: 'sphere', pos: [0.5, 0.36, 0.1], scale: [0.18, 0.13, 0.28], color: '#6b5b4b' },
        { geo: 'sphere', pos: [0.25, 0.34, -0.2], scale: [0.16, 0.11, 0.24], color: '#7d6a58' },
      ]
    case 'street':
      return [
        { geo: 'box', pos: [0, 0.05, 0], rot: [0, 0, 0.18], scale: [0.9, 0.1, 0.5], color: '#f7f4ee' },
        { geo: 'box', pos: [-0.3, 0.16, -0.14], scale: [0.14, 0.14, 0.14], color: '#d96c9a' },
        { geo: 'box', pos: [0.05, 0.22, 0.12], scale: [0.14, 0.14, 0.14], color: '#7f8ed0' },
        { geo: 'box', pos: [0.32, 0.27, -0.1], scale: [0.14, 0.14, 0.14], color: '#e6a94f' },
      ]
    case 'gate':
      return [
        { geo: 'box', pos: [-0.35, 0.35, 0], scale: [0.12, 0.7, 0.12], color: '#2f8f5b' },
        { geo: 'box', pos: [0.35, 0.35, 0], scale: [0.12, 0.7, 0.12], color: '#2f8f5b' },
        { geo: 'box', pos: [0, 0.78, 0], scale: [1.0, 0.16, 0.3], color: '#c8402f' },
        { geo: 'box', pos: [0, 0.94, 0], scale: [0.7, 0.14, 0.26], color: '#2f8f5b' },
      ]
    case 'town':
      return [0, 1, 2, 3].map((i) => ({
        geo: 'box' as const,
        pos: [(i - 1.5) * 0.4, 0.2 + i * 0.05, (i % 2) * 0.3],
        scale: [0.3, 0.4 + i * 0.1, 0.3],
        color: ['#f3e6cf', '#e9d3b3', '#f7efe1', '#dfc9a9'][i],
      }))
  }
}

export function partGeometry(p: Part): THREE.BufferGeometry {
  const a = (p.args ?? []) as number[]
  switch (p.geo) {
    case 'box': return new THREE.BoxGeometry(1, 1, 1)
    case 'cyl': return new THREE.CylinderGeometry(a[0] ?? 0.5, a[1] ?? 0.5, 1, a[2] ?? 16, 1, !!a[4])
    case 'cone': return new THREE.ConeGeometry(a[0] ?? 0.5, 1, a[1] ?? 8)
    case 'sphere': return new THREE.SphereGeometry(1, a[1] ?? 16, a[2] ?? 12, a[3] ?? 0, a[4] ?? Math.PI * 2, a[5] ?? 0, a[6] ?? Math.PI)
    case 'ring': return new THREE.TorusGeometry(1, 0.1, 8, 24)
  }
}
