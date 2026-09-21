import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import WaybillPreviewModal from '../WaybillPreviewModal'

/**
 * The recap gate before an irreversible Econt booking (AUDIT.md order-management
 * back office UX requirement). Not a preview of the real label — Econt has no
 * "show me the PDF without booking" call — so what matters here is that nothing
 * about the parcel is hidden behind the button, and that the actual submit only
 * exists once the recap is open.
 */

function renderModal(overrides: Partial<Parameters<typeof WaybillPreviewModal>[0]> = {}) {
  return render(
    <WaybillPreviewModal
      orderId="order-1"
      orderNumber="55C-2026-000123"
      courierLabel="Econt"
      sender={{ name: 'ВиреонЛабс ЕООД', phone: '+359888123456', from: 'от офис (код 1120)' }}
      recipientName="Мария Иванова"
      recipientPhone="+359887115957"
      destination="Пловдив Кършияка, бул. Дунав 5 (код 4015), 4000 Пловдив"
      weightGrams={550}
      codAmount="19,99 €"
      issueWaybill={vi.fn()}
      {...overrides}
    />
  )
}

describe('WaybillPreviewModal', () => {
  it('shows nothing but the trigger until it is opened', () => {
    renderModal()

    expect(screen.getByRole('button', { name: /прегледай преди издаване/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the recap with the sender, the recipient and the parcel details', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('button', { name: /прегледай преди издаване/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('ВиреонЛабс ЕООД')
    expect(dialog).toHaveTextContent('+359888123456')
    expect(dialog).toHaveTextContent('от офис (код 1120)')
    expect(dialog).toHaveTextContent('Мария Иванова')
    expect(dialog).toHaveTextContent('+359887115957')
    expect(dialog).toHaveTextContent('4000 Пловдив')
    expect(dialog).toHaveTextContent('550')
    expect(dialog).toHaveTextContent('19,99')
  })

  it('omits the sender block for a courier with no ad-hoc identity to show', async () => {
    const user = userEvent.setup()
    renderModal({ sender: null, courierLabel: 'Speedy' })

    await user.click(screen.getByRole('button', { name: /прегледай преди издаване/i }))

    expect(screen.queryByText('Подател')).not.toBeInTheDocument()
    expect(screen.getByText('Получател')).toBeInTheDocument()
  })

  it('closes on Escape without ever having posted anything', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('button', { name: /прегледай преди издаване/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on a backdrop click, and reopens with the same data', async () => {
    const user = userEvent.setup()
    const { container } = renderModal()

    await user.click(screen.getByRole('button', { name: /прегледай преди издаване/i }))

    const backdrop = container.querySelector('.fixed.inset-0')
    if (!backdrop) throw new Error('expected a backdrop element')
    await user.click(backdrop)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /прегледай преди издаване/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('gates the real submission behind the type-to-confirm inside the recap', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('button', { name: /прегледай преди издаване/i }))

    const submit = screen.getByRole('button', { name: 'Издай товарителница' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByRole('textbox'), '55C-2026-000123')
    expect(submit).toBeEnabled()
  })
})
