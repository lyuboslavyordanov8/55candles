import { createHmac } from 'node:crypto'

import { getProductBySlug } from '@/data/products'
import { locales } from '@/i18n/locales'

/**
 * Visit counting for the admin's traffic page — the pure half.
 *
 * The shop counts its own visits rather than loading a third-party tracker,
 * and does it without cookies and without keeping anything that identifies a
 * person. What a page view leaves behind is a path, where the visit came from
 * (the referrer's host, on the first page only), a country from the edge, a
 * device class, and `visitorHash`.
 *
 * `visitorHash` is what makes "unique visitors" possible without an identifier
 * on the device: an HMAC of the IP address and the user agent, keyed with a
 * secret *and the day*. The same browser hashes the same within one Sofia
 * calendar day and to something unrelated the next, and without the secret no
 * hash can be recomputed from a guessed address. The IP and the user agent
 * themselves are never written anywhere.
 *
 * The consequence to keep in mind when reading the numbers: a visitor is a
 * visitor-*day*. Someone who comes on Monday and on Tuesday is two, and a week's
 * visitors are the sum of its days. That is the price of not following anyone
 * from one day to the next, and it is the right side of the trade.
 */

/** How long a page view is kept. The privacy policy promises this period. */
export const ANALYTICS_RETENTION_DAYS = 365

export type Device = 'mobile' | 'tablet' | 'desktop'

/**
 * The key the daily hash is made with.
 *
 * `ANALYTICS_SALT` if set, else the admin session secret — already a long
 * random value that never leaves the server. Null means the shop cannot count
 * without keeping something recomputable, so it does not count.
 */
export function analyticsSecret(env: Partial<Record<string, string>> = process.env): string | null {
  const secret = env.ANALYTICS_SALT || env.ADMIN_SESSION_SECRET || ''
  return secret.length >= 16 ? secret : null
}

const sofiaDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Sofia',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** `YYYY-MM-DD` in Sofia — the day a visitor-day belongs to. */
export function dayKey(at: Date): string {
  return sofiaDay.format(at)
}

export function visitorHash(secret: string, day: string, ip: string, userAgent: string): string {
  return createHmac('sha256', `${secret}:${day}`)
    .update(`${ip}\n${userAgent}`)
    .digest('base64url')
    .slice(0, 22)
}

/**
 * Crawlers, link previews, monitors and scripts.
 *
 * Most never run the beacon, because it needs JavaScript; this catches the ones
 * that do, and the ones that post to the endpoint by hand. An empty user agent
 * is a script too — every browser sends one.
 */
const BOT =
  /bot|crawl|spider|slurp|scrap|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|monitor|uptime|curl|wget|python|axios|node-fetch|undici|go-http|java\/|okhttp|httpclient|phantom|selenium|puppeteer|playwright/i

export function isBot(userAgent: string): boolean {
  return !userAgent.trim() || BOT.test(userAgent)
}

/** Tablet before mobile: an Android tablet omits `Mobile`, an iPad says `iPad`. */
export function deviceOf(userAgent: string): Device {
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(userAgent)) return 'tablet'
  if (/Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

const LOCALE_PATH = new RegExp(`^/(${locales.join('|')})(/[a-z0-9-]+)*$`)

/**
 * The page's path as stored, or null for one that is not a storefront page.
 *
 * The query string and the fragment are dropped before anything else: they are
 * where a search term, a campaign id or an order reference would be, and none of
 * those belong in visit statistics. What is left must look like one of the
 * shop's own locale-prefixed paths, so a hand-built POST cannot fill the table
 * with whatever text it likes.
 */
export function normalisePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null

  const path = raw.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '')
  if (!path || path.length > 200) return null

  return LOCALE_PATH.test(path) ? path : null
}

/**
 * The host of an external referrer, without `www.`, or empty.
 *
 * Empty for no referrer, for anything that is not an http(s) URL, and for the
 * shop's own host — moving from one of its pages to another is not "came from".
 * Only the host is kept: a full referrer URL can carry a search query or an
 * address in its path.
 */
export function referrerHostOf(raw: unknown, ownHost: string): string {
  if (typeof raw !== 'string' || !raw) return ''

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return ''
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const own = ownHost
    .toLowerCase()
    .split(':')[0]
    .replace(/^www\./, '')
  if (!host || host === own) return ''

  return host.slice(0, 100)
}

/** The edge's country header, if it is a two-letter code. */
export function countryOf(header: string | null): string {
  const code = (header ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : ''
}

/**
 * Whether the browser has asked not to be tracked.
 *
 * Nothing here tracks in the sense either signal was written against, but a
 * visitor who switched one on has said what they want, and honouring it costs
 * one uncounted visit.
 */
export function optedOut(headers: Headers): boolean {
  return headers.get('sec-gpc') === '1' || headers.get('dnt') === '1'
}

const SOURCES: [RegExp, string][] = [
  [/(^|\.)google\./, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)yahoo\./, 'Yahoo'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)pinterest\./, 'Pinterest'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'ChatGPT'],
]

/**
 * A referrer host as the admin would name it.
 *
 * `l.instagram.com`, `lm.facebook.com` and every national Google are one
 * source each to a shop owner. Anything unrecognised is shown as its host.
 */
export function sourceLabel(host: string): string {
  if (!host) return 'Директно'
  return SOURCES.find(([pattern]) => pattern.test(host))?.[1] ?? host
}

/**
 * The last `count` Sofia days, oldest first, ending with today.
 *
 * Stepped on the calendar date, not by subtracting 24 hours, so the change to
 * and from summer time neither repeats a day nor skips one.
 */
export function lastDays(count: number, now: Date = new Date()): string[] {
  const [year, month, day] = dayKey(now).split('-').map(Number)
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(year, month - 1, day - (count - 1 - index))).toISOString().slice(0, 10)
  )
}

/** Referrer hosts merged into the sources they belong to, largest first. */
export function mergeSources(
  rows: readonly { host: string; visits: number }[]
): { label: string; visits: number }[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const label = sourceLabel(row.host)
    totals.set(label, (totals.get(label) ?? 0) + row.visits)
  }
  return [...totals]
    .map(([label, visits]) => ({ label, visits }))
    .sort((a, b) => b.visits - a.visits)
}

const PAGE_LABELS: Record<string, string> = {
  '': 'Начало',
  '/products': 'Всички свещи',
  '/checkout': 'Поръчка',
  '/contact': 'Контакти',
  '/our-story': 'Нашата история',
  '/candle-care': 'Грижа за свещта',
}

/** What an admin would call a page, from its stored path. */
export function pageLabel(path: string): string {
  const [, locale = '', ...rest] = path.split('/')
  const tail = rest.length ? `/${rest.join('/')}` : ''
  const suffix = locale === 'bg' ? '' : ` (${locale.toUpperCase()})`

  if (tail in PAGE_LABELS) return PAGE_LABELS[tail] + suffix

  const product = tail.match(/^\/products\/([a-z0-9-]+)$/)?.[1]
  if (product) return (getProductBySlug(product)?.name ?? product) + suffix

  if (tail.startsWith('/legal/')) return `Правни: ${tail.slice(7)}${suffix}`

  return path
}
