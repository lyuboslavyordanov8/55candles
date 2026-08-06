import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import OrderSummary, { type OrderSummaryData } from '../OrderSummary'

/**
 * These assertions used to live in `DeliveryForm.test.tsx`, driven through a
 * form submit. They cannot work there: the summary only exists after a Server
 * Action round trip, which jsdom will not perform. Rendering the component
 * directly tests the same thing without pretending the network happened.
 */

const SUMMARY: OrderSummaryData = {
  goodsMinor: 3998,
  shippingMinor: 599,
  codFeeMinor: null,
  totalMinor: 4597,
  weightGrams: 1150,
}

function renderSummary(summary: Partial<OrderSummaryData> = {}, locale = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <OrderSummary summary={{ ...SUMMARY, ...summary }} locale={locale} />
    </NextIntlClientProvider>
  )
}

describe('OrderSummary', () => {
  it('itemises goods, delivery and total separately', () => {
    // Consumer law requires each as its own line before the customer
    // confirms; one opaque number is not compliant.
    const { container } = renderSummary()

    expect(screen.getByRole('heading', { name: /order summary/i })).toBeInTheDocument()
    expect(container.querySelector('[data-amount="3998"]')).toBeInTheDocument()
    expect(container.querySelector('[data-amount="599"]')).toBeInTheDocument()
    expect(container.querySelector('[data-amount="4597"]')).toBeInTheDocument()
  })

  it('omits the cash-on-delivery line when the merchant absorbs the fee', () => {
    // Q-23: `COD_FEE_PAID_BY` is currently 'merchant', so charging the
    // customer for it on screen would be a lie.
    renderSummary({ codFeeMinor: null })

    expect(screen.queryByText(/cash-on-delivery fee/i)).not.toBeInTheDocument()
  })

  it('shows the cash-on-delivery fee as its own line when the customer bears it', () => {
    const { container } = renderSummary({ codFeeMinor: 60, totalMinor: 4657 })

    expect(screen.getByText(/cash-on-delivery fee/i)).toBeInTheDocument()
    expect(container.querySelector('[data-amount="60"]')).toBeInTheDocument()
    expect(container.querySelector('[data-amount="4657"]')).toBeInTheDocument()
  })

  it('states the parcel weight, since that is what the rate band keys off', () => {
    renderSummary()

    expect(screen.getByText(/1150 g/)).toBeInTheDocument()
  })

  it('formats amounts for the reader’s locale', () => {
    // Bulgarian writes the symbol last with a comma decimal; English leads
    // with it. Getting this wrong reads as a different price.
    renderSummary({}, 'en')
    expect(screen.getByText('€45.97')).toBeInTheDocument()

    renderSummary({}, 'bg')
    expect(screen.getByText(/45,97/)).toBeInTheDocument()
  })

  it('tells the customer no payment was taken, once the flow can say so', () => {
    // The status message lives in `DeliveryForm`, keyed by the action's
    // `messageKey`. Asserting the catalogue text here keeps the promise
    // honest: `readyToPay` must not read as "order placed".
    expect(messages.checkout.message.noOrderStorageYet).toMatch(/no payment was taken/i)
  })
})
