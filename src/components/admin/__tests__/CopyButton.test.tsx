import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import CopyButton from '../CopyButton'

/**
 * Tap-to-copy for the address block (order-management back office UX
 * requirement). jsdom exposes `navigator.clipboard` as a getter-only
 * accessor with no real implementation, so the whole global is stubbed —
 * `vi.stubGlobal` rather than `Object.assign(navigator, …)`, which throws
 * against that accessor.
 */
describe('CopyButton', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    writeText.mockClear()
    vi.stubGlobal('navigator', { clipboard: { writeText } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('copies the given text when clicked', async () => {
    render(<CopyButton text={'Мария Иванова, +359887115957\nул. Тест 1'} />)

    await userEvent.click(screen.getByRole('button'))

    expect(writeText).toHaveBeenCalledWith('Мария Иванова, +359887115957\nул. Тест 1')
  })

  it('confirms the copy in the button itself', async () => {
    render(<CopyButton text="address" label="Копирай" />)

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('button')).toHaveTextContent('Копирано')
  })

  it('does not throw when the clipboard API refuses', async () => {
    writeText.mockRejectedValueOnce(new Error('no permission'))

    render(<CopyButton text="address" />)

    await expect(userEvent.click(screen.getByRole('button'))).resolves.not.toThrow()
  })
})
