/**
 * Company X posts, baked nightly into public/data/tweets.json by scripts/fetch-tweets.ts.
 * Loaded lazily the first time a company card opens; never fetched from X at runtime.
 */
import { useEffect, useState } from 'react'

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

let pending: Promise<TweetsFile> | null = null

export function loadTweets(): Promise<TweetsFile> {
  if (!pending) {
    pending = fetch('/data/tweets.json')
      .then((r) => {
        if (!r.ok) throw new Error(`tweets.json -> ${r.status}`)
        return r.json() as Promise<TweetsFile>
      })
      .catch((e) => {
        pending = null // allow a retry on the next card
        throw e
      })
  }
  return pending
}

export type FeedState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; posts: Post[]; fetchedAt: string }

const EMPTY: Post[] = []

export function useTweets(companyId: string): FeedState {
  const [file, setFile] = useState<TweetsFile | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    loadTweets().then(
      (f) => live && setFile(f),
      () => live && setFile(null),
    )
    return () => {
      live = false
    }
  }, [])
  if (file === undefined) return { status: 'loading' }
  if (file === null) return { status: 'error' }
  return { status: 'ready', posts: file.posts[companyId] ?? EMPTY, fetchedAt: file.fetchedAt }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "3h ago", "5d ago", "Sep 4", "Mar 2022" */
export function fmtWhen(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  const age = now - d.getTime()
  const h = age / 3.6e6
  if (h < 1) return 'just now'
  if (h < 24) return `${Math.floor(h)}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return sameYear ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "Sep 19" / "Mar 3, 2025" — for the "as of" stamp */
export function fmtDate(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? '' : `, ${d.getFullYear()}`}`
}

/** 1234 -> "1.2k", 2277071 -> "2.3M" */
export function fmtCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`
  return String(n)
}
