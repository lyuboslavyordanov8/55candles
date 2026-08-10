import { describe, it, expect } from 'vitest'
import { buildCsp, buildSecurityHeaders } from '../security-headers'

/**
 * Regression guard for a bug that reached a real device.
 *
 * `upgrade-insecure-requests` was applied in development as well as
 * production. Browsers exempt localhost from the upgrade, so the dev machine
 * looked fine, but opening the dev server from a phone at
 * http://192.168.x.x:3000 upgraded every CSS, JS and image request to https —
 * which the dev server does not speak — and the page rendered as raw
 * unstyled HTML.
 */
describe('buildCsp', () => {
  describe('production', () => {
    const csp = buildCsp(false)

    it('upgrades insecure requests', () => {
      expect(csp).toContain('upgrade-insecure-requests')
    })

    it('does not allow eval', () => {
      expect(csp).not.toContain("'unsafe-eval'")
    })

    it('does not allow websocket connections', () => {
      expect(csp).not.toMatch(/\bws:/)
      expect(csp).not.toMatch(/\bwss:/)
    })
  })

  describe('development', () => {
    const csp = buildCsp(true)

    it('does NOT upgrade insecure requests', () => {
      // Keep this. Re-adding it breaks LAN testing from a phone, and the
      // failure is invisible on localhost.
      expect(csp).not.toContain('upgrade-insecure-requests')
    })

    it('allows eval for React Refresh', () => {
      expect(csp).toContain("'unsafe-eval'")
    })

    it('allows websockets for HMR', () => {
      expect(csp).toContain('ws:')
      expect(csp).toContain('wss:')
    })
  })

  describe('both modes', () => {
    for (const [name, isDev] of [
      ['production', false],
      ['development', true],
    ] as const) {
      it(`${name} keeps the non-negotiable directives`, () => {
        const csp = buildCsp(isDev)
        expect(csp).toContain("default-src 'self'")
        expect(csp).toContain("object-src 'none'")
        expect(csp).toContain("base-uri 'self'")
        expect(csp).toContain("form-action 'self'")
        expect(csp).toContain("frame-ancestors 'none'")
      })
    }
  })
})

describe('buildSecurityHeaders', () => {
  const required = [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'X-Frame-Options',
    'Permissions-Policy',
  ]

  for (const [name, isDev] of [
    ['production', false],
    ['development', true],
  ] as const) {
    it(`${name} sets every required header exactly once`, () => {
      const keys = buildSecurityHeaders(isDev).map((h) => h.key)
      for (const key of required) {
        expect(keys.filter((k) => k === key)).toHaveLength(1)
      }
    })
  }

  it('never emits an empty header value', () => {
    for (const isDev of [true, false]) {
      for (const { key, value } of buildSecurityHeaders(isDev)) {
        expect(value.trim(), `${key} is empty`).not.toBe('')
      }
    }
  })
})
