import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ConfirmSubmit from '../ConfirmSubmit'

/**
 * Type-to-confirm for an irreversible action (order-management back office UX
 * requirement). The server action re-checks the same value — see
 * `confirmedOrderNumber` in `src/app/admin/actions.ts` — so what matters here
 * is purely that the button stays disabled until the typed text matches.
 */
describe('ConfirmSubmit', () => {
  it('disables the button until the typed value matches exactly', async () => {
    render(<ConfirmSubmit expected="55C-2026-000123" buttonLabel="Издай товарителница" />)

    const button = screen.getByRole('button', { name: 'Издай товарителница' })
    const input = screen.getByRole('textbox')

    expect(button).toBeDisabled()

    await userEvent.type(input, '55C-2026-000122')
    expect(button).toBeDisabled()

    await userEvent.clear(input)
    await userEvent.type(input, '55C-2026-000123')
    expect(button).toBeEnabled()
  })

  it('trims surrounding whitespace before comparing', async () => {
    render(<ConfirmSubmit expected="55C-2026-000123" buttonLabel="Издай" />)

    await userEvent.type(screen.getByRole('textbox'), '  55C-2026-000123  ')

    expect(screen.getByRole('button')).toBeEnabled()
  })

  it('names the input confirmOrderNumber, matching what the action reads', () => {
    render(<ConfirmSubmit expected="55C-2026-000123" buttonLabel="Издай" />)

    expect(screen.getByRole('textbox')).toHaveAttribute('name', 'confirmOrderNumber')
  })
})
