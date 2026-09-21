import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRateLimiter } from '../rate-limit'

describe('createRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to max hits per key within the window', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 })

    expect(limiter.hit('a')).toBe(false)
    expect(limiter.hit('a')).toBe(false)
    expect(limiter.hit('a')).toBe(false)
    expect(limiter.hit('a')).toBe(true)
  })

  it('tracks each key independently', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })

    expect(limiter.hit('a')).toBe(false)
    expect(limiter.hit('b')).toBe(false)
    expect(limiter.hit('a')).toBe(true)
    expect(limiter.hit('b')).toBe(true)
  })

  it('frees up budget once hits age out of the window', () => {
    vi.useFakeTimers()
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1 })

    expect(limiter.hit('a')).toBe(false)
    expect(limiter.hit('a')).toBe(true)

    vi.advanceTimersByTime(1_001)

    expect(limiter.hit('a')).toBe(false)
  })
})
