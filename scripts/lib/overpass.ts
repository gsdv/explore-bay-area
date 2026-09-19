import { cachedDownload, log } from './util.ts'
import { BBOX } from '../../src/lib/geo.ts'

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter']

export const bbox = (b = BBOX) => `${b.south},${b.west},${b.north},${b.east}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Run an Overpass QL query (cached by name). Returns parsed OSM JSON. */
export async function overpass(name: string, ql: string, timeout = 300, maxsizeMB = 0): Promise<any> {
  const body = `[out:json][timeout:${timeout}]${maxsizeMB ? `[maxsize:${maxsizeMB * 1048576}]` : ''};${ql}`
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const ep of ENDPOINTS) {
      try {
        const buf = await cachedDownload(`overpass-${name}.json`, ep, {
          method: 'POST',
          body: new URLSearchParams({ data: body }),
          signal: AbortSignal.timeout((timeout + 30) * 1000),
        })
        const json = JSON.parse(buf.toString('utf8'))
        if (json.remark) log('overpass remark:', json.remark)
        return json
      } catch (e) {
        lastErr = e
        log('overpass failed on', ep, String(e).slice(0, 120))
      }
    }
    await sleep(20000 * (attempt + 1))
  }
  throw lastErr
}
