import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { money } from '@/lib/money'
import type { ShipmentTracking } from '@/lib/couriers/types'
import { TrackingBadge, TrackingPanel } from '../ShipmentTracking'

/**
 * The courier's view of a parcel beside the order's own. What matters is that the
 * money is never ambiguous — collected from the customer and paid out to the shop
 * are different facts — and that the panel says which status to move to when the
 * courier is ahead, without moving it.
 */

const delivered: ShipmentTracking = {
  number: '1505005745538',
  status: 'Доставена',
  deliveredAt: '2026-08-21T07:32:05.000Z',
  events: [
    { at: '2026-08-21T07:32:05.000Z', text: 'предадена на Мария Иванова' },
    { at: '2026-08-20T10:01:32.000Z', text: 'приета в офис София НЛЦ Орион' },
  ],
}

const collected: ShipmentTracking = {
  ...delivered,
  codCollected: { amount: money(2490), at: '2026-08-21T07:32:05.000Z' },
}

const paid: ShipmentTracking = {
  ...collected,
  codPaid: { amount: money(2490), at: '2026-08-22T09:00:00.000Z' },
}

describe('TrackingPanel', () => {
  it('shows the status, the history and that nothing was collected', () => {
    render(
      <TrackingPanel
        lookup={{ state: 'ok', tracking: delivered }}
        orderStatus="delivered"
        courierLabel="Econt"
      />
    )

    // Once as the courier's status, once as the label of the delivery time.
    expect(screen.getAllByText('Доставена')).toHaveLength(2)
    expect(screen.getByText('приета в офис София НЛЦ Орион')).toBeInTheDocument()
    expect(screen.getByText('не е събран')).toBeInTheDocument()
  })

  it('tells collected-but-not-paid apart from paid out', () => {
    const { rerender } = render(
      <TrackingPanel
        lookup={{ state: 'ok', tracking: collected }}
        orderStatus="cod_collected"
        courierLabel="Econt"
      />
    )

    expect(screen.getByText(/събран .*24,90/)).toBeInTheDocument()
    expect(screen.getByText('още не е преведен към фирмата')).toBeInTheDocument()

    rerender(
      <TrackingPanel
        lookup={{ state: 'ok', tracking: paid }}
        orderStatus="cod_collected"
        courierLabel="Econt"
      />
    )

    expect(screen.getByText(/преведен .*24,90/)).toBeInTheDocument()
    expect(screen.getByText(/Щом ги видиш по сметката/)).toBeInTheDocument()
  })

  it('suggests the next status when the courier is ahead of the order', () => {
    render(
      <TrackingPanel
        lookup={{ state: 'ok', tracking: delivered }}
        orderStatus="shipped"
        courierLabel="Econt"
      />
    )

    expect(screen.getByText(/Смени статуса на „доставена“/)).toBeInTheDocument()
  })

  it('says so plainly when the courier did not answer or does not know the number', () => {
    const { rerender } = render(
      <TrackingPanel
        lookup={{ state: 'failed', reason: 'timeout' }}
        orderStatus="shipped"
        courierLabel="Econt"
      />
    )
    expect(screen.getByText(/Econt не отговори \(timeout\)/)).toBeInTheDocument()

    rerender(
      <TrackingPanel
        lookup={{ state: 'missing', reason: 'Не е намерена пратка.' }}
        orderStatus="shipped"
        courierLabel="Econt"
      />
    )
    expect(screen.getByText(/не намира тази товарителница/)).toBeInTheDocument()
  })
})

describe('TrackingBadge', () => {
  it('flags cash that was collected and not yet paid out', () => {
    render(<TrackingBadge lookup={{ state: 'ok', tracking: collected }} />)

    expect(screen.getByText('Доставена')).toBeInTheDocument()
    expect(screen.getByText('НП събран, чака превод')).toBeInTheDocument()
  })

  it('is a dash when there is nothing to track', () => {
    render(<TrackingBadge lookup={{ state: 'unavailable' }} />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
