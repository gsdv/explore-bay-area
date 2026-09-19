import fs from 'node:fs'
import path from 'node:path'
import dns from 'node:dns'

// overpass-api.de's IPv6 address is unreachable from some networks; prefer v4.
dns.setDefaultResultOrder('ipv4first')

export const ROOT = path.resolve(import.meta.dirname, '..', '..')
export const CACHE = path.join(ROOT, 'data-cache')
export const OUT = path.join(ROOT, 'public', 'data')
fs.mkdirSync(CACHE, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })

export const UA = 'explore-bay-area/0.1 (local dev; github.com/gab)'

export function log(...a: unknown[]) {
  const t = new Date().toISOString().slice(11, 19)
  console.log(`[${t}]`, ...a)
}

export async function cachedDownload(name: string, url: string, init?: RequestInit): Promise<Buffer> {
  const file = path.join(CACHE, name)
  if (fs.existsSync(file)) return fs.readFileSync(file)
  log('download', url)
  const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init?.headers as any) } })
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(file, buf)
  log('saved', name, (buf.length / 1e6).toFixed(1), 'MB')
  return buf
}

export function readJSON<T = any>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}
export function writeJSON(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data))
  log('wrote', path.relative(ROOT, file), (fs.statSync(file).size / 1e6).toFixed(2), 'MB')
}

/** Simple bounded-concurrency map */
export async function pmap<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await fn(items[k], k)
      }
    }),
  )
  return out
}

export function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
