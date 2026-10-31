/**
 * Bake one square photo per landmark for the detail card: public/data/photos/<id>.webp, plus the
 * credits in src/data/photos.ts.
 *
 * Every photo is a Wikimedia Commons file (mostly the Wikipedia article's lead image), fetched as a
 * 1000 px thumbnail, cropped to a square round a focus point and shrunk to SIZE px (2x the card's
 * 160 px column) as WebP. Thumbnails are cached in data-cache/photos/.
 *
 *   pnpm photos                  all landmarks
 *   pnpm photos -- --only coit   just these (comma-separated); the credits of the others are kept
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { landmarks } from '../src/data/landmarks.ts'
import type { Photo } from '../src/data/photos.ts'
import { CACHE, OUT, ROOT, UA, log } from './lib/util.ts'

const SIZE = 320
const QUALITY = 72

/** Commons file per landmark; x/y place the square crop along the long side (0 = left/top, 1 = right/bottom, default 0.5) */
const FILES: Record<string, { file: string; x?: number; y?: number }> = {
  ggb: { file: 'Golden_Gate_Bridge_as_seen_from_Battery_East.jpg' },
  baybridge: { file: 'Bay_Bridge_2022.jpg' },
  coit: { file: 'Coit_Tower_1.jpg' },
  transamerica: { file: 'Transamerica_Pyramid_from_Coit_Tower.jpg' },
  salesforcetower: { file: 'Salesforce_Tower_from_Salesforce_Park.jpg' },
  ferrybuilding: { file: 'Ferry_Building_San_Francisco_from_Hyatt_Regency_with_R-Evolution_and_Bay_Bridge_2026_dllu.jpg' },
  sutro: { file: 'Sutro_Tower_from_Grandview.jpg' },
  alcatraz: { file: 'Alcatraz_2021.jpg' },
  cityhall: { file: 'San_Francisco_City_Hall_2.JPG' },
  ghirardelli: { file: 'Ghirardelli_Square_Sign_in_San_Francisco.jpg' },
  gracecathedral: { file: '2009-0723-CA-005-GraceCathedral_(pc).jpg' },
  missiondolores: { file: 'Mission_San_Francisco_de_Asis_and_Dolores_Basilica_(2025).jpg' },
  conservatory: { file: 'Conservatory_of_Flowers_-_panoramio.jpg' },
  deyoung: { file: 'De_Young_Museum_-_Building_-_January_2022_-_Sarah_Stierch.jpg' },
  salesforcepark: { file: 'Salesforce_Park_and_bus_bridge,_seen_from_Salesforce_Tower.jpg' },
  palace: { file: 'Palace_of_Fine_Arts_(16794p).jpg' },
  oraclepark: { file: 'Oracle_Park_2021.jpg' },
  chasecenter: { file: 'Chase_Center.jpg' },
  paintedladies: { file: 'Painted_Ladies_San_Francisco_January_2013_panorama_2.jpg' },
  twinpeaks: { file: 'Twin_Peaks_2022_Aerial.png' },
  lombard: { file: 'Lombard_Street_2020.jpg' },
  ggpark: { file: 'California-06241_-_In_front_of_museum_(20449897948).jpg' },
  presidio: { file: 'Aerial_view_-_Presidio-whole.jpg' },
  landsend: { file: 'Coastal_Trail_and_Golden_Gate_Bridge,_April_2019.JPG' },
  oceanbeach: { file: 'Cliff_House_from_Ocean_Beach.jpg' },
  dolores: { file: 'Dolores_Park_May_2025.jpg' },
  bernal: { file: 'Bernal_Hill_from_Potrero_Hill.jpg' },
  pier39: { file: 'Pier_39_in_2021.jpg' },
  chinatown: { file: 'Dragon_Gate,_Chinatown,_SF_front.JPG' },
  exploratorium: { file: 'Exploratorium_entrance_at_Pier_15,_SF_(Nov_2015).jpg' },
  legion: { file: 'California_Palace_of_the_Legion_of_Honor_-_Façade.jpg', y: 0.55 },
  crissy: { file: 'The_Golden_Gate_Bridge_from_Crissy_Field_(40930793693).jpg', x: 0.55 },
  marina: { file: 'Marina_District_San_Francisco.jpg', x: 0.1 },
  mttam: { file: 'Mt._Tamalpais,_viewed_from_the_south.jpg' },
  muirwoods: { file: 'Muir_Woods_National_Monument_(47879029461).jpg' },
  sausalito: { file: 'Sausalito.jpg' },
  angelisland: { file: 'Angel_Island_(California).jpg' },
  campanile: { file: 'Campanile_Hi-Res_-_reduced_file_size.jpg' },
  stanford: { file: 'Hoover_Tower_Stanford_January_2013.jpg' },
  levis: { file: "Levi's_Stadium_from_air.jpg", x: 0.15 },
  mavericks: { file: '2006_Mavericks.jpg', x: 0.4 },
  mtdiablo: { file: 'View_of_Mount_Diablo_and_CA_Highway_24_from_Lafayette_Heights.jpg' },
  missionmurals: { file: 'Clarion_alley_sf.jpg' },
}

const DIR = path.join(OUT, 'photos')
const RAW = path.join(CACHE, 'photos')
const CREDITS = path.join(ROOT, 'src', 'data', 'photos.ts')
fs.mkdirSync(DIR, { recursive: true })
fs.mkdirSync(RAW, { recursive: true })

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim()

/** fetch with a few patient retries: Wikimedia answers bursts with 429 */
async function get(url: string | URL): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } })
    if (res.ok || res.status !== 429 || i === 4) {
      if (!res.ok) throw new Error(`${url}: ${res.status}`)
      return res
    }
    const wait = Number(res.headers.get('retry-after')) * 1000 || 5000 * 2 ** i
    log('429, waiting', wait / 1000, 's')
    await new Promise((r) => setTimeout(r, wait))
  }
}

/** one API call for every file (Commons takes 50 titles at a time) */
async function fileInfo(files: string[]) {
  const u = new URL('https://commons.wikimedia.org/w/api.php')
  u.search = new URLSearchParams({
    action: 'query', format: 'json', titles: files.map((f) => 'File:' + f).join('|'),
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1000',
  }).toString()
  const q = (await (await get(u)).json()).query
  const norm = new Map<string, string>((q.normalized ?? []).map((n: any) => [n.to, n.from]))
  const out = new Map<string, { thumb: string; page: string; credit: string; license: string }>()
  for (const page of Object.values(q.pages) as any[]) {
    const ii = page.imageinfo?.[0]
    if (!ii) continue
    const meta = ii.extmetadata ?? {}
    out.set((norm.get(page.title) ?? page.title).slice(5), {
      thumb: ii.thumburl ?? ii.url,
      page: ii.descriptionurl,
      credit: stripHtml(meta.Artist?.value ?? 'Unknown')
        .replace(/^Photograph by /, '').replace(/\s*\(www\.[^)]*\)/, '').replace(/ Original uploader.*$/, '').replace(/\.$/, '')
        .replace(/^en:User:/, ''),
      license: stripHtml(meta.LicenseShortName?.value ?? ''),
    })
  }
  return out
}

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only'))
  const want = only ? new Set((only.includes('=') ? only.split('=')[1] : process.argv[process.argv.indexOf(only) + 1]).split(',')) : null
  const missing = landmarks.filter((l) => !FILES[l.id]).map((l) => l.id)
  if (missing.length) throw new Error('no photo listed for ' + missing.join(', '))

  const credits: Record<string, Photo> = {}
  if (want && fs.existsSync(CREDITS)) Object.assign(credits, (await import(CREDITS)).photos)

  const todo = landmarks.filter((l) => !want || want.has(l.id))
  const infos = await fileInfo(todo.map((l) => FILES[l.id].file))
  let total = 0
  for (const l of todo) {
    const { file, x = 0.5, y = 0.5 } = FILES[l.id]
    const info = infos.get(file)
    if (!info) throw new Error(`${l.id}: ${file} is not on Commons`)
    const raw = path.join(RAW, file.replace(/[^\w.-]/g, '_'))
    if (!fs.existsSync(raw)) {
      fs.writeFileSync(raw, Buffer.from(await (await get(info.thumb)).arrayBuffer()))
      await new Promise((r) => setTimeout(r, 1000)) // be gentle with upload.wikimedia.org
    }
    const img = sharp(raw).rotate()
    const { width = 0, height = 0 } = await img.metadata()
    const side = Math.min(width, height)
    const out = path.join(DIR, `${l.id}.webp`)
    await img
      .extract({ left: Math.round((width - side) * x), top: Math.round((height - side) * y), width: side, height: side })
      .resize(SIZE, SIZE)
      .webp({ quality: QUALITY, effort: 6 })
      .toFile(out)
    const kb = fs.statSync(out).size / 1024
    total += kb
    credits[l.id] = { credit: info.credit, license: info.license, source: info.page }
    log(l.id.padEnd(16), `${width}x${height}`, '->', kb.toFixed(1), 'KB', '·', info.credit, info.license)
  }

  const body = Object.entries(credits)
    .map(([id, p]) => `  ${JSON.stringify(id)}: ${JSON.stringify(p)},`)
    .join('\n')
  fs.writeFileSync(
    CREDITS,
    `// Generated by scripts/photos.ts (pnpm photos). The images are public/data/photos/<id>.webp.\n\n` +
      `export interface Photo {\n  /** author, as Commons lists it */\n  credit: string\n  license: string\n  /** the file's Commons page */\n  source: string\n}\n\n` +
      `export const photos: Record<string, Photo> = {\n${body}\n}\n\n` +
      `export const photoUrl = (id: string) => \`/data/photos/\${id}.webp\`\n`,
  )
  log('wrote', path.relative(ROOT, CREDITS), '·', total.toFixed(0), 'KB of photos')
}

main()
