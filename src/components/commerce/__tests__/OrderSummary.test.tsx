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

/** Two of one candle. The single-line case is asserted separately. */
const SUMMARY: OrderSummaryData = {
  lines: [{ slug: 'cherry', quantity: 2, unitPriceMinor: 1999, lineTotalMinor: 3998 }],
  goodsMinor: 3998,
  discountMinor: null,
  promoCode: null,
  shippingMinor: 599,
  freeShipping: false,
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
    expect(container.querySelector('[data-line-amount="3998"]')).toBeInTheDocument()
    expect(container.querySelector('[data-amount="599"]')).toBeInTheDocument()
    expect(container.querySelector('[data-amount="4597"]')).toBeInTheDocument()
  })

  it('names every candle in the order, not just "Candles"', () => {
    // The owner's complaint, and a real one: a customer confirming an order has
    // to be able to see *what* they are confirming. "Candles — 39,98 €" does not
    // say whether the second one is the cherry they wanted or a second orange.
    const { container } = renderSummary({
      lines: [
        { slug: 'cherry', quantity: 2, unitPriceMinor: 1999, lineTotalMinor: 3998 },
        { slug: 'orange', quantity: 1, unitPriceMinor: 1999, lineTotalMinor: 1999 },
      ],
      goodsMinor: 5997,
      totalMinor: 6596,
    })

    expect(screen.getByText(/Electric Cherry/)).toBeInTheDocument()
    expect(screen.getByText(/Sweet Orange/)).toBeInTheDocument()
    // The count beside each, so a line total cannot read as a unit price.
    expect(screen.getByText(/2 × €19.99/)).toBeInTheDocument()
    expect(container.querySelector('[data-line-amount="1999"]')).toBeInTheDocument()
  })

  it('subtotals the goods once there is more than one line to subtotal', () => {
    const { container } = renderSummary({
      lines: [
        { slug: 'cherry', quantity: 1, unitPriceMinor: 1999, lineTotalMinor: 1999 },
        { slug: 'orange', quantity: 1, unitPriceMinor: 1999, lineTotalMinor: 1999 },
      ],
    })

    expect(screen.getByText(/^Candles$/)).toBeInTheDocument()
    expect(container.querySelector('[data-amount="3998"]')).toBeInTheDocument()
  })

  it('does not restate a single line as a subtotal', () => {
    // With one line the goods row repeats the number directly above it, which
    // reads as a second charge for the same candle.
    renderSummary()

    expect(screen.queryByText(/^Candles$/)).not.toBeInTheDocument()
  })

  it('falls back to the slug if a line names a product no longer in the catalogue', () => {
    // A stale tab, or a slug retired between page load and submit. Showing the
    // raw slug is ugly; showing nothing at all next to a charge is worse.
    renderSummary({
      lines: [{ slug: 'ghost-candle', quantity: 1, unitPriceMinor: 1999, lineTotalMinor: 1999 }],
    })

    expect(screen.getByText(/ghost-candle/)).toBeInTheDocument()
  })

  it('shows a promo discount as its own signed line, named by its code', () => {
    // The customer agreed to a goods price. Quietly shrinking that figure hides
    // what the code was worth; a `−€4.00` line lets them check the arithmetic.
    const { container } = renderSummary({
      discountMinor: 400,
      promoCode: '55CANDLES10',
      totalMinor: 4197,
    })

    expect(screen.getByText(/Discount \(55CANDLES10\)/)).toBeInTheDocument()
    expect(container.querySelector('[data-amount="-400"]')).toBeInTheDocument()
    expect(screen.getByText('-€4.00')).toBeInTheDocument()
  })

  it('has no discount line when no code was used', () => {
    // null, not zero: a `€0.00` discount row invites the customer to wonder
    // which code they forgot.
    renderSummary()

    expect(screen.queryByText(/Discount/)).not.toBeInTheDocument()
  })

  it('names the discount without a code if one is somehow missing', () => {
    renderSummary({ discountMinor: 400, promoCode: null, totalMinor: 4197 })

    expect(screen.getByText(/^Discount$/)).toBeInTheDocument()
  })

  it('keeps the delivery line when the shop is paying it, and says so', () => {
    // Q-24. The line stays because the customer is owed the fact that delivery
    // was charged at nothing; a row that disappears reads as an omission. The
    // amount attribute still carries the zero, so the arithmetic is checkable.
    const { container } = renderSummary({
      shippingMinor: 0,
      freeShipping: true,
      totalMinor: 3998,
    })

    expect(screen.getByText(/^Delivery$/)).toBeInTheDocument()
    expect(screen.getByText(/^free$/)).toBeInTheDocument()
    expect(container.querySelector('[data-amount="0"]')).toBeInTheDocument()
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
