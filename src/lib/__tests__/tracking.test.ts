import { describe, it, expect, vi, beforeEach } from 'vitest'

import { courierClient } from '../couriers'
import type { CourierClient, LookupResult, TrackingReport } from '../couriers/types'
import { trackOrder, trackOrders } from '../tracking'

vi.mock('../couriers', () => ({ courierClient: vi.fn() }))

const trackShipments = vi.fn<(numbers: readonly string[]) => Promise<LookupResult<TrackingReport>>>()

beforeEach(() => {
  trackShipments.mockReset()
  vi.mocked(courierClient).mockImplementation(
    (courier) => ({ courier, trackShipments }) as unknown as CourierClient
  )
})

describe('trackOrders', () => {
  it('asks each courier once, for distinct numbers, and skips orders with none', async () => {
    trackShipments.mockResolvedValue({ status: 'ok', data: { found: [], missing: [] } })

    await trackOrders([
      { courier: 'econt', waybillNumber: '1' },
      { courier: 'econt', waybillNumber: ' 1 ' },
      { courier: 'econt', waybillNumber: '2' },
      { courier: 'econt', waybillNumber: null },
    ])

    expect(trackShipments).toHaveBeenCalledTimes(1)
    expect(trackShipments).toHaveBeenCalledWith(['1', '2'])
  })

  it('keys found and missing parcels by number', async () => {
    trackShipments.mockResolvedValue({
      status: 'ok',
      data: {
        found: [{ number: '1', status: 'Доставена', events: [] }],
        missing: [{ number: '2', reason: 'няма такава' }],
      },
    })

    const result = await trackOrders([
      { courier: 'econt', waybillNumber: '1' },
      { courier: 'econt', waybillNumber: '2' },
    ])

    expect(result.get('1')).toEqual({
      state: 'ok',
      tracking: { number: '1', status: 'Доставена', events: [] },
    })
    expect(result.get('2')).toEqual({ state: 'missing', reason: 'няма такава' })
  })

  it('tells "not available" from "did not answer"', async () => {
    trackShipments.mockImplementation(async () => ({ status: 'unconfigured', courier: 'speedy' }))
    expect((await trackOrders([{ courier: 'speedy', waybillNumber: '9' }])).get('9')).toEqual({
      state: 'unavailable',
    })

    trackShipments.mockImplementation(async () => ({
      status: 'failed',
      courier: 'econt',
      reason: 'timeout',
    }))
    expect((await trackOrders([{ courier: 'econt', waybillNumber: '9' }])).get('9')).toEqual({
      state: 'failed',
      reason: 'timeout',
    })
  })

  it('survives a courier client that throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    trackShipments.mockRejectedValue(new Error('boom'))

    const result = await trackOrders([{ courier: 'econt', waybillNumber: '1' }])

    expect(result.get('1')?.state).toBe('failed')
  })
})

describe('trackOrder', () => {
  it('is null for an order with no waybill, without asking anyone', async () => {
    expect(await trackOrder({ courier: 'econt', waybillNumber: null })).toBeNull()
    expect(trackShipments).not.toHaveBeenCalled()
  })
})
