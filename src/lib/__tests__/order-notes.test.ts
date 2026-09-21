import { describe, it, expect } from 'vitest'

import { normalizedNote, NOTE_MAX } from '@/lib/order-notes'

/**
 * `addOrderNote` itself writes to the database and is not tested here — the
 * same convention as `createOrder` and `issueWaybillForOrder`. This is its
 * pure half: what a note actually gets stored as.
 */
describe('normalizedNote', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizedNote('  called twice, no answer  ')).toBe('called twice, no answer')
  })

  it('returns null for whitespace-only input, rather than an empty string on the row', () => {
    expect(normalizedNote('   ')).toBeNull()
    expect(normalizedNote('')).toBeNull()
  })

  it('caps length so a hand-built POST cannot store an unbounded note', () => {
    const result = normalizedNote('x'.repeat(5_000))

    expect(result).not.toBeNull()
    expect(result!.length).toBe(NOTE_MAX)
  })
})
