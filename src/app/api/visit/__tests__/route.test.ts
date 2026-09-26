import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const recordPageView = vi.fn()

vi.mock('@/lib/analytics-data', () => ({ recordPageView }))
vi.mock('@/lib/env', () => ({ isDatabaseConfigured: true }))

const { POST } = await import('../route')

const BROWSER =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

/** A distinct address per request: the rate limiter is module state. */
let ipCounter = 0

function post(body: unknown, headers: Record<string, string> = {}) {
  ipCounter += 1
  return POST(
    new Request('https://55candles.com/api/visit', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        host: '55candles.com',
        'user-agent': BROWSER,
        'x-forwarded-for': `10.1.0.${ipCounter}`,
        'x-vercel-ip-country': 'BG',
        'sec-fetch-site': 'same-origin',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )
}

describe('POST /api/visit', () => {
  beforeEach(() => {
    recordPageView.mockReset()
    process.env.ANALYTICS_SALT = 'a-test-salt-long-enough'
  })

  afterEach(() => {
    delete process.env.ANALYTICS_SALT
  })

  it('records the first page of a visit with its source, and nothing identifying', async () => {
    const response = await post({
      path: '/bg/products/cherry?utm_source=ig',
      entry: true,
      referrer: 'https://l.instagram.com/?u=something',
    })

    expect(response.status).toBe(204)
    expect(recordPageView).toHaveBeenCalledTimes(1)

    const view = recordPageView.mock.calls[0][0]
    expect(view).toMatchObject({
      path: '/bg/products/cherry',
      entry: true,
      referrerHost: 'l.instagram.com',
      country: 'BG',
      device: 'mobile',
    })
    expect(view.visitorHash).toMatch(/^[\w-]{22}$/)

    const stored = JSON.stringify(view)
    expect(stored).not.toContain('10.1.0.')
    expect(stored).not.toContain('iPhone')
    expect(stored).not.toContain('utm_source')
  })

  it('ignores the referrer on later pages of the visit', async () => {
    await post({ path: '/bg/products', entry: false, referrer: 'https://google.com/' })
    expect(recordPageView.mock.calls[0][0]).toMatchObject({ entry: false, referrerHost: '' })
  })

  it('does not count bots, opted-out browsers, other sites, or paths outside the storefront', async () => {
    await post({ path: '/bg' }, { 'user-agent': 'Googlebot/2.1' })
    await post({ path: '/bg' }, { dnt: '1' })
    await post({ path: '/bg' }, { 'sec-gpc': '1' })
    await post({ path: '/bg' }, { 'sec-fetch-site': 'cross-site' })
    await post({ path: '/admin' })
    await post('not json')

    expect(recordPageView).not.toHaveBeenCalled()
  })

  it('does not count without a secret to hash with', async () => {
    delete process.env.ANALYTICS_SALT
    const saved = process.env.ADMIN_SESSION_SECRET
    delete process.env.ADMIN_SESSION_SECRET
    try {
      const response = await post({ path: '/bg' })
      expect(response.status).toBe(204)
      expect(recordPageView).not.toHaveBeenCalled()
    } finally {
      if (saved !== undefined) process.env.ADMIN_SESSION_SECRET = saved
    }
  })

  it('stops counting one address that posts too often', async () => {
    const same = { 'x-forwarded-for': '10.9.9.9' }
    for (let i = 0; i < 125; i += 1) await post({ path: '/bg' }, same)
    expect(recordPageView).toHaveBeenCalledTimes(120)
  })

  it('still answers 204 when the database write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    recordPageView.mockRejectedValueOnce(new Error('relation "page_views" does not exist'))

    const response = await post({ path: '/bg' })
    expect(response.status).toBe(204)
    expect(console.error).toHaveBeenCalled()
  })
})
