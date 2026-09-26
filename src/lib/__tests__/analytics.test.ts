import { describe, expect, it } from 'vitest'

import {
  analyticsSecret,
  countryOf,
  dayKey,
  deviceOf,
  isBot,
  lastDays,
  mergeSources,
  normalisePath,
  optedOut,
  pageLabel,
  referrerHostOf,
  sourceLabel,
  visitorHash,
} from '../analytics'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

describe('visitorHash', () => {
  const secret = 'a-long-enough-secret'

  it('is the same for one browser within a day', () => {
    expect(visitorHash(secret, '2026-09-26', '1.2.3.4', DESKTOP)).toBe(
      visitorHash(secret, '2026-09-26', '1.2.3.4', DESKTOP)
    )
  })

  it('changes with the day, so no one is followed from one day to the next', () => {
    expect(visitorHash(secret, '2026-09-26', '1.2.3.4', DESKTOP)).not.toBe(
      visitorHash(secret, '2026-09-27', '1.2.3.4', DESKTOP)
    )
  })

  it('changes with the secret, the address and the browser', () => {
    const base = visitorHash(secret, '2026-09-26', '1.2.3.4', DESKTOP)
    expect(visitorHash('another-long-secret', '2026-09-26', '1.2.3.4', DESKTOP)).not.toBe(base)
    expect(visitorHash(secret, '2026-09-26', '1.2.3.5', DESKTOP)).not.toBe(base)
    expect(visitorHash(secret, '2026-09-26', '1.2.3.4', IPHONE)).not.toBe(base)
  })

  it('does not contain the address', () => {
    expect(visitorHash(secret, '2026-09-26', '1.2.3.4', DESKTOP)).not.toContain('1.2.3.4')
  })
})

describe('analyticsSecret', () => {
  it('prefers ANALYTICS_SALT, falls back to the session secret, and refuses a short one', () => {
    const long = 'x'.repeat(32)
    expect(analyticsSecret({ ANALYTICS_SALT: long, ADMIN_SESSION_SECRET: 'y'.repeat(32) })).toBe(
      long
    )
    expect(analyticsSecret({ ADMIN_SESSION_SECRET: long })).toBe(long)
    expect(analyticsSecret({ ADMIN_SESSION_SECRET: 'short' })).toBeNull()
    expect(analyticsSecret({})).toBeNull()
  })
})

describe('dayKey and lastDays', () => {
  it('uses the Sofia date, not UTC', () => {
    // 22:30 UTC is already the next day in Sofia (UTC+3 in summer).
    expect(dayKey(new Date('2026-09-26T22:30:00Z'))).toBe('2026-09-27')
    expect(dayKey(new Date('2026-09-26T20:30:00Z'))).toBe('2026-09-26')
  })

  it('lists consecutive days ending today', () => {
    expect(lastDays(3, new Date('2026-09-26T10:00:00Z'))).toEqual([
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ])
  })

  it('neither repeats nor skips a day across the change from summer time', () => {
    const days = lastDays(5, new Date('2026-10-27T10:00:00Z'))
    expect(days).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
  })

  it('crosses a month boundary', () => {
    expect(lastDays(2, new Date('2026-10-01T10:00:00Z'))).toEqual(['2026-09-30', '2026-10-01'])
  })
})

describe('isBot', () => {
  it('lets real browsers through', () => {
    for (const ua of [IPHONE, ANDROID_PHONE, ANDROID_TABLET, IPAD, DESKTOP]) {
      expect(isBot(ua)).toBe(false)
    }
  })

  it('stops crawlers, previews, scripts and an empty user agent', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'facebookexternalhit/1.1',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/128.0 Safari/537.36',
      'curl/8.5.0',
      'python-requests/2.32',
      'Chrome-Lighthouse',
      '',
      '   ',
    ]) {
      expect(isBot(ua)).toBe(true)
    }
  })
})

describe('deviceOf', () => {
  it('tells phones, tablets and computers apart', () => {
    expect(deviceOf(IPHONE)).toBe('mobile')
    expect(deviceOf(ANDROID_PHONE)).toBe('mobile')
    expect(deviceOf(ANDROID_TABLET)).toBe('tablet')
    expect(deviceOf(IPAD)).toBe('tablet')
    expect(deviceOf(DESKTOP)).toBe('desktop')
  })
})

describe('normalisePath', () => {
  it('keeps storefront paths and drops the query and the fragment', () => {
    expect(normalisePath('/bg')).toBe('/bg')
    expect(normalisePath('/en/products/cherry')).toBe('/en/products/cherry')
    expect(normalisePath('/bg/checkout?order=55C-0001&token=abc')).toBe('/bg/checkout')
    expect(normalisePath('/bg/products/#top')).toBe('/bg/products')
    expect(normalisePath('/BG/Products')).toBe('/bg/products')
  })

  it('refuses anything that is not one of the shop’s own paths', () => {
    for (const raw of [
      '/admin',
      '/api/visit',
      '/de/products',
      'https://evil.example/bg',
      '/bg/<script>',
      '/bg/' + 'a'.repeat(300),
      '',
      42,
      null,
      undefined,
    ]) {
      expect(normalisePath(raw)).toBeNull()
    }
  })
})

describe('referrerHostOf', () => {
  it('keeps only the host, without www', () => {
    expect(referrerHostOf('https://www.google.com/search?q=candles', '55candles.com')).toBe(
      'google.com'
    )
    expect(referrerHostOf('https://l.instagram.com/?u=x', '55candles.com')).toBe('l.instagram.com')
  })

  it('is empty for the shop itself, for nothing and for junk', () => {
    expect(referrerHostOf('https://www.55candles.com/bg', '55candles.com')).toBe('')
    expect(referrerHostOf('https://55candles.com/bg', 'www.55candles.com:443')).toBe('')
    expect(referrerHostOf('', '55candles.com')).toBe('')
    expect(referrerHostOf('not a url', '55candles.com')).toBe('')
    expect(referrerHostOf('android-app://com.google.android.gm/', '55candles.com')).toBe('')
    expect(referrerHostOf({}, '55candles.com')).toBe('')
  })
})

describe('countryOf and optedOut', () => {
  it('accepts only a two-letter code', () => {
    expect(countryOf('bg')).toBe('BG')
    expect(countryOf('BGR')).toBe('')
    expect(countryOf(null)).toBe('')
  })

  it('honours Do Not Track and Global Privacy Control', () => {
    expect(optedOut(new Headers({ dnt: '1' }))).toBe(true)
    expect(optedOut(new Headers({ 'sec-gpc': '1' }))).toBe(true)
    expect(optedOut(new Headers({ dnt: '0' }))).toBe(false)
    expect(optedOut(new Headers())).toBe(false)
  })
})

describe('sources', () => {
  it('names the sources a shop owner would recognise', () => {
    expect(sourceLabel('')).toBe('Директно')
    expect(sourceLabel('google.bg')).toBe('Google')
    expect(sourceLabel('google.com')).toBe('Google')
    expect(sourceLabel('l.instagram.com')).toBe('Instagram')
    expect(sourceLabel('lm.facebook.com')).toBe('Facebook')
    expect(sourceLabel('blog.example.com')).toBe('blog.example.com')
  })

  it('merges hosts of one source and sorts by visits', () => {
    expect(
      mergeSources([
        { host: 'google.com', visits: 3 },
        { host: '', visits: 4 },
        { host: 'google.bg', visits: 2 },
        { host: 'l.instagram.com', visits: 1 },
      ])
    ).toEqual([
      { label: 'Google', visits: 5 },
      { label: 'Директно', visits: 4 },
      { label: 'Instagram', visits: 1 },
    ])
  })
})

describe('pageLabel', () => {
  it('names pages and products, and marks the English ones', () => {
    expect(pageLabel('/bg')).toBe('Начало')
    expect(pageLabel('/en')).toBe('Начало (EN)')
    expect(pageLabel('/bg/products')).toBe('Всички свещи')
    expect(pageLabel('/bg/products/winter-wonderland')).toBe('Winter Wonderland')
    expect(pageLabel('/bg/products/no-such-candle')).toBe('no-such-candle')
    expect(pageLabel('/bg/legal/privacy')).toBe('Правни: privacy')
  })
})
