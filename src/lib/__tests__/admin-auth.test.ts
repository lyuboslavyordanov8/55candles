import { describe, it, expect, beforeEach } from 'vitest'

import {
  isAdminConfigured,
  isCorrectPassword,
  isValidSessionValue,
  newSessionValue,
} from '@/lib/admin-auth'

/**
 * Admin access (AUDIT.md Phase 7).
 *
 * The cookie-writing half needs a request, so it is exercised by using the admin.
 * What is tested here is the part that decides *who gets in* — and the failure
 * mode that matters is a cookie someone forged, or an unset password that turns
 * the admin into a public page.
 */

const HOUR = 60 * 60 * 1000

describe('admin password', () => {
  beforeEach(() => {
    delete process.env.ADMIN_PASSWORD
    delete process.env.ADMIN_SESSION_SECRET
  })

  it('is unconfigured, and refuses everything, when no password is set', () => {
    expect(isAdminConfigured()).toBe(false)
    // The dangerous bug this rules out: an unset password accepting any input.
    expect(isCorrectPassword('')).toBe(false)
    expect(isCorrectPassword('anything')).toBe(false)
  })

  it('accepts the configured password and nothing else', () => {
    process.env.ADMIN_PASSWORD = 'correct horse battery staple'

    expect(isAdminConfigured()).toBe(true)
    expect(isCorrectPassword('correct horse battery staple')).toBe(true)
    expect(isCorrectPassword('correct horse battery stapl')).toBe(false)
    expect(isCorrectPassword('CORRECT HORSE BATTERY STAPLE')).toBe(false)
    expect(isCorrectPassword('')).toBe(false)
  })
})

describe('admin session cookie', () => {
  beforeEach(() => {
    delete process.env.ADMIN_SESSION_SECRET
    process.env.ADMIN_PASSWORD = 'a-password'
  })

  it('issues a value it accepts back', () => {
    expect(isValidSessionValue(newSessionValue())).toBe(true)
  })

  it('issues a different value every time', () => {
    // Two logins in the same millisecond must not share a cookie.
    expect(newSessionValue()).not.toBe(newSessionValue())
  })

  it('rejects an expired session', () => {
    const issued = newSessionValue(Date.now() - 24 * HOUR)
    expect(isValidSessionValue(issued)).toBe(false)
  })

  it('rejects a session whose expiry was edited', () => {
    const issued = newSessionValue()
    const [, nonce, signature] = issued.split('.')
    const extended = `${Date.now() + 1000 * HOUR}.${nonce}.${signature}`

    expect(isValidSessionValue(extended)).toBe(false)
  })

  it('rejects an unsigned or malformed value', () => {
    expect(isValidSessionValue(undefined)).toBe(false)
    expect(isValidSessionValue('')).toBe(false)
    expect(isValidSessionValue(String(Date.now() + HOUR))).toBe(false)
    expect(isValidSessionValue(`${Date.now() + HOUR}.nonce.not-a-signature`)).toBe(false)
  })

  it('stops accepting old sessions once the password changes', () => {
    const issued = newSessionValue()
    process.env.ADMIN_PASSWORD = 'a-new-password'

    // Changing the password is how you log everyone out.
    expect(isValidSessionValue(issued)).toBe(false)
  })

  it('survives a password change when a separate signing secret is set', () => {
    process.env.ADMIN_SESSION_SECRET = 'a-long-random-signing-secret'
    const issued = newSessionValue()
    process.env.ADMIN_PASSWORD = 'a-new-password'

    expect(isValidSessionValue(issued)).toBe(true)
  })

  it('accepts nothing when neither a password nor a secret is configured', () => {
    const issued = newSessionValue()
    delete process.env.ADMIN_PASSWORD

    expect(isValidSessionValue(issued)).toBe(false)
  })
})
