/**
 * Bake the latest original X posts for every company into public/data/tweets.json.
 *
 * One Apify run per company, sequential, using kaitoeasyapi's pay-per-result tweet scraper (works on
 * the free plan; ~$0.005 per company at 20 items). The X advanced-search query already excludes
 * replies and retweets; the normaliser re-checks and keeps the newest 5. A company's entry is only
 * replaced on success so a bad night keeps yesterday's posts.
 *
 *   pnpm tweets                       all companies
 *   pnpm tweets -- --only anthropic,openai
 *   pnpm tweets -- --dry              fetch and report, don't write
 *
 * Needs APIFY_TOKEN (read from .env.local if present, else the environment). Raw actor output is kept in
 * data-cache/tweets-raw/<id>.json for debugging.
 */
import fs from 'node:fs'
import path from 'node:path'
import { companies } from '../src/data/companies.ts'
import { CACHE, OUT, ROOT, log, readJSON } from './lib/util.ts'

const ACTOR = 'kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest'
const API = 'https://api.apify.com/v2'
const KEEP = 5
/** tweets requested per company; 20 is the actor's minimum and is billed at $0.25 / 1000 */
const MAX_ITEMS = 20
/** hard cap per run, USD — a runaway run cannot cost more than this */
const MAX_CHARGE_USD = 0.05
const RUN_TIMEOUT_S = 240

export interface Post {
  id: string
  url: string
  text: string
  /** ISO 8601 */
  createdAt: string
  likes: number
  reposts: number
  replies: number
  views?: number
}
export interface TweetsFile {
  fetchedAt: string
  /** companyId -> newest first */
  posts: Record<string, Post[]>
}

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

// local dev keeps the token in .env.local (gitignored); CI provides it through the environment
try {
  process.loadEnvFile(path.join(ROOT, '.env.local'))
} catch {}
const token = process.env.APIFY_TOKEN
if (!token) {
  console.error('APIFY_TOKEN is not set (put it in .env.local or the environment)')
  process.exit(1)
}
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

const RAW = path.join(CACHE, 'tweets-raw')
fs.mkdirSync(RAW, { recursive: true })
const OUT_FILE = path.join(OUT, 'tweets.json')

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers as any) } })
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} -> ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

interface Run {
  id: string
  status: string
  defaultDatasetId: string
  usageTotalUsd?: number
  statusMessage?: string
}

async function runActor(handle: string): Promise<{ run: Run; items: any[] }> {
  const q = new URLSearchParams({
    waitForFinish: '60',
    timeout: String(RUN_TIMEOUT_S),
    maxTotalChargeUsd: String(MAX_CHARGE_USD),
  })
  let { data: run } = await api<{ data: Run }>(`${API}/acts/${ACTOR}/runs?${q}`, {
    method: 'POST',
    body: JSON.stringify({
      twitterContent: `from:${handle} -filter:replies -filter:retweets`,
      queryType: 'Latest',
      maxItems: MAX_ITEMS,
    }),
  })
  const terminal = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'])
  while (!terminal.has(run.status)) {
    ;({ data: run } = await api<{ data: Run }>(`${API}/actor-runs/${run.id}?waitForFinish=60`))
  }
  if (run.status !== 'SUCCEEDED') {
    throw new Error(`run ${run.id} ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ''}`)
  }
  const items = await api<any[]>(`${API}/datasets/${run.defaultDatasetId}/items?clean=true`)
  // Free-plan accounts get `{demo: true}` placeholders and a SUCCEEDED status; treat as a failure so
  // the existing posts for this company are kept rather than replaced with nothing.
  if (items.length > 0 && items.every((it) => it && it.demo)) {
    throw new Error(`run ${run.id} returned demo items only — the actor needs a paid Apify plan`)
  }
  return { run, items }
}

/** "Wed Sep 17 18:00:00 +0000 2025" (Twitter) or ISO -> ISO; undefined if unparseable */
function toISO(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

function normalise(items: any[], handle: string): Post[] {
  const posts: Post[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    if (it.noResults || (it.type && it.type !== 'tweet')) continue
    if (!it.id || !it.url) continue
    if (it.isRetweet || it.isReply || it.retweeted_tweet || it.inReplyToId) continue
    // guard against the odd item from another account (quoted/unrolled)
    const author = it.author?.userName ?? it.author?.screen_name
    if (author && author.toLowerCase() !== handle.toLowerCase()) continue
    const createdAt = toISO(it.createdAt)
    if (!createdAt) continue
    const text = String(it.fullText ?? it.text ?? '').trim()
    if (!text) continue
    const post: Post = {
      id: String(it.id),
      url: String(it.url),
      text,
      createdAt,
      likes: Number(it.likeCount ?? 0),
      reposts: Number(it.retweetCount ?? 0),
      replies: Number(it.replyCount ?? 0),
    }
    if (it.viewCount != null) post.views = Number(it.viewCount)
    posts.push(post)
  }
  posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return posts.slice(0, KEEP)
}

async function main() {
  const only = opt('only')?.split(',').filter(Boolean)
  const dry = flag('dry')
  const targets = companies.filter((c) => c.twitter && (!only || only.includes(c.id)))
  if (only) {
    for (const id of only) if (!targets.some((c) => c.id === id)) log('warn: no company with handle for id', id)
  }

  const existing: TweetsFile = fs.existsSync(OUT_FILE)
    ? readJSON<TweetsFile>(OUT_FILE)
    : { fetchedAt: new Date(0).toISOString(), posts: {} }
  const posts: Record<string, Post[]> = { ...existing.posts }

  let ok = 0
  let failed = 0
  let usd = 0
  const t0 = Date.now()
  for (const c of targets) {
    const handle = c.twitter!
    const started = Date.now()
    try {
      const { run, items } = await runActor(handle)
      fs.writeFileSync(path.join(RAW, `${c.id}.json`), JSON.stringify(items, null, 2))
      const kept = normalise(items, handle)
      posts[c.id] = kept
      ok++
      usd += run.usageTotalUsd ?? 0
      log(
        `${c.id.padEnd(16)} @${handle.padEnd(18)} ${String(items.length).padStart(3)} raw -> ${kept.length} kept` +
          `  ${((Date.now() - started) / 1000).toFixed(0)}s` +
          (run.usageTotalUsd ? `  $${run.usageTotalUsd.toFixed(4)}` : ''),
      )
      if (kept.length === 0) log(`  warn: nothing kept for @${handle} — check the handle / raw file`)
    } catch (e) {
      failed++
      log(`${c.id.padEnd(16)} @${handle.padEnd(18)} FAILED: ${(e as Error).message}`)
    }
  }

  // stable key order so the committed file diffs cleanly
  const sorted: Record<string, Post[]> = {}
  for (const id of Object.keys(posts).sort()) sorted[id] = posts[id]
  const out: TweetsFile = { fetchedAt: new Date().toISOString(), posts: sorted }

  // Apify settles usage shortly after a run ends, so this is usually a lower bound; the console has exact figures.
  log(`done: ${ok} ok, ${failed} failed, ${((Date.now() - t0) / 1000).toFixed(0)}s, ~$${usd.toFixed(3)} (≈$${(ok * 0.005).toFixed(2)} expected)`)
  if (dry) {
    log('dry run — not writing', path.relative(process.cwd(), OUT_FILE))
    return
  }
  if (ok === 0) {
    log('nothing succeeded — leaving the existing file untouched')
    process.exitCode = 1
    return
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n')
  log('wrote', path.relative(process.cwd(), OUT_FILE), (fs.statSync(OUT_FILE).size / 1e3).toFixed(1), 'KB')
  if (failed) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
