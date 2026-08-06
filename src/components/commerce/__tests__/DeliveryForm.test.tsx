import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import DeliveryForm from '../DeliveryForm'

// The action is a server function; the form's own behaviour is what's under
// test here, so it is stubbed. `actions.test.ts` covers the real one.
vi.mock('@/app/[locale]/checkout/actions', () => ({
  submitCheckout: vi.fn(async () => ({ status: 'idle' as const })),
}))

function renderForm(props: Partial<Parameters<typeof DeliveryForm>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeliveryForm
        cart={[{ slug: 'cherry', quantity: 1 }]}
        paymentMethods={['cod']}
        shippingConfigured={false}
        {...props}
      />
    </NextIntlClientProvider>
  )
}

describe('DeliveryForm', () => {
  it('asks for the recipient and a phone number the courier can call', () => {
    renderForm()

    expect(screen.getByLabelText(/full name/i)).toBeRequired()
    expect(screen.getByLabelText(/phone number/i)).toBeRequired()
  })

  it('leaves email optional, since a COD customer may not have one', () => {
    renderForm()

    expect(screen.getByLabelText(/email address/i)).not.toBeRequired()
  })

  it('offers both couriers and all three delivery methods', () => {
    renderForm()

    expect(screen.getByRole('option', { name: 'Econt' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Speedy' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /to my address/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /courier office/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /parcel locker/i })).toBeInTheDocument()
  })

  describe('the method decides which location field is shown', () => {
    it('shows an office field by default, not a street', () => {
      renderForm()

      expect(screen.getByLabelText(/office or locker/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/street/i)).not.toBeInTheDocument()
    })

    it('swaps to a street field for door delivery', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getByRole('radio', { name: /to my address/i }))

      expect(screen.getByLabelText(/street/i)).toBeInTheDocument()
      // Asking for both would block every order.
      expect(screen.queryByLabelText(/office or locker/i)).not.toBeInTheDocument()
    })

    it('keeps typed details when the method changes', async () => {
      // `Field` is defined at module scope for exactly this reason: a
      // nested component would remount and wipe the inputs on every switch.
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByLabelText(/full name/i), 'Мария Иванова')
      await user.type(screen.getByLabelText(/city/i), 'София')
      await user.click(screen.getByRole('radio', { name: /to my address/i }))

      expect(screen.getByLabelText(/full name/i)).toHaveValue('Мария Иванова')
      expect(screen.getByLabelText(/city/i)).toHaveValue('София')
    })
  })

  it('hides card payment while Stripe is unconfigured, and says why', () => {
    renderForm({ paymentMethods: ['cod'] })

    expect(screen.getByRole('radio', { name: /cash on delivery/i })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^card/i })).not.toBeInTheDocument()
    expect(screen.getByText(/card payment is not connected yet/i)).toBeInTheDocument()
  })

  it('offers card when it is available', () => {
    renderForm({ paymentMethods: ['card', 'cod'] })

    expect(screen.getByRole('radio', { name: /card/i })).toBeInTheDocument()
    expect(screen.queryByText(/card payment is not connected yet/i)).not.toBeInTheDocument()
  })

  it('warns that delivery prices are unset rather than implying free shipping', () => {
    renderForm({ shippingConfigured: false })

    expect(screen.getByRole('note')).toHaveTextContent(/delivery prices are not set yet/i)
  })

  it('drops the warning once a rate card exists', () => {
    renderForm({ shippingConfigured: true })

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('carries the cart in the payload so the server can re-price it', () => {
    const { container } = renderForm({ cart: [{ slug: 'cherry', quantity: 2 }] })
    const hidden = container.querySelector('input[name="cart"]')

    expect(JSON.parse(hidden!.getAttribute('value')!)).toEqual([
      { slug: 'cherry', quantity: 2 },
    ])
  })

  it('tells the customer the office list is not connected yet', () => {
    // Better than a picker populated with invented offices, which produces a
    // parcel addressed somewhere that does not exist.
    renderForm()

    expect(screen.getByText(/searchable list will appear/i)).toBeInTheDocument()
  })
})
