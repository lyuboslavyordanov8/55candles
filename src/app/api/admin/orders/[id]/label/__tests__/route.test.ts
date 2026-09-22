import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { GET } from '../route'
import { hasAdminSession } from '@/lib/admin-auth'
import { getOrderDetail } from '@/lib/admin-orders'
import type { Order, OrderEvent } from '@/db/schema'

/**
 * The label PDF, served from our own domain (order-management back office).
 *
 * Exists so the admin can print with one click: a PDF can only be printed by
 * script from an iframe of the same origin, and Econt's link is not that. Two
 * things follow from it being a proxy and both are tested here.
 *
 * **It is a door into our data, so it is shut by default.** Unauthenticated,
 * unknown order and "this order has no label" all answer `404` — the same
 * answer, because an outsider probing order ids should not learn from the
 * difference which ones exist.
 *
 * **Econt's `200` proves nothing.** `PDFService.getPDF.json` answers `200
 * text/html` with an empty body for an id that is not ours, so success is the
 * `%PDF` signature and nothing else. Verified against the live service on
 * 2026-09-22.
 */

vi.mock('@/lib/admin-auth', () => ({
  hasAdminSession: vi.fn(),
}))

vi.mock('@/lib/admin-orders', () => ({
  getOrderDetail: vi.fn(),
}))

const ORDER_ID = '11111111-1111-1111-1111-111111111111'
const PDF_URL = 'https://ee.econt.com/services/PDFService.getPDF.json?id=1053118220'

/** A real PDF's first bytes, which is all the route looks at. */
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n')

function bookedEvent(): OrderEvent {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    orderId: ORDER_ID,
    fromStatus: 'confirmed',
    toStatus: 'confirmed',
    actor: 'admin',
    detail: { waybillPdfUrl: PDF_URL } as OrderEvent['detail'],
    createdAt: new Date('2026-09-22T07:47:00Z'),
  }
}

/** Only the two fields the route reads; the rest of an `Order` is irrelevant here. */
function stubOrder(events: OrderEvent[]) {
  vi.mocked(getOrderDetail).mockResolvedValue({
    order: { id: ORDER_ID, orderNumber: '55C-2026-000123' } as Order,
    items: [],
    events,
  })
}

function get() {
  return GET(new Request(`http://localhost/api/admin/orders/${ORDER_ID}/label`), {
    params: Promise.resolve({ id: ORDER_ID }),
  })
}

beforeEach(() => {
  vi.mocked(hasAdminSession).mockResolvedValue(true)
  stubOrder([bookedEvent()])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the label PDF route', () => {
  it('serves the PDF Econt returned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(PDF_BYTES, { headers: { 'content-type': 'application/pdf' } })
      )
    )

    const response = await get()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    // Spread on both sides: the two typed arrays come from different realms and
    // compare unequal despite identical contents.
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...PDF_BYTES])
  })

  it('names the file after the order, so a printed pile can be sorted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(PDF_BYTES))
    )

    const response = await get()

    expect(response.headers.get('content-disposition')).toContain('55C-2026-000123')
  })

  it('is never cached: it is one order\'s paperwork behind a login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(PDF_BYTES)))

    expect((await get()).headers.get('cache-control')).toBe('no-store')
  })

  it('asks Econt for exactly the recorded link, and nothing else', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(PDF_BYTES))
    vi.stubGlobal('fetch', fetchMock)

    await get()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(PDF_URL)
  })

  it('answers 404 without an admin session, and does not look at the order', async () => {
    vi.mocked(hasAdminSession).mockResolvedValue(false)
    vi.stubGlobal('fetch', vi.fn())

    expect((await get()).status).toBe(404)
    expect(getOrderDetail).not.toHaveBeenCalled()
  })

  it('answers 404 for an order that does not exist', async () => {
    vi.mocked(getOrderDetail).mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn())

    expect((await get()).status).toBe(404)
  })

  it('answers 404 for an order with no label recorded', async () => {
    stubOrder([])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect((await get()).status).toBe(404)
    // Nothing to ask for, so Econt is not asked.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 502 when Econt returns a 200 that is not a PDF', async () => {
    // The shape actually observed for an id Econt does not recognise.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', { status: 200, headers: { 'content-type': 'text/html' } })
      )
    )

    expect((await get()).status).toBe(502)
  })

  it('answers 502 when Econt refuses outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })))

    expect((await get()).status).toBe(502)
  })

  it('answers 502 when Econt cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    expect((await get()).status).toBe(502)
  })

  it('keeps the courier link out of the log', async () => {
    // Econt's PDF link is a capability URL — the id in it is the only thing
    // guarding the file. Keeping it server-side is the point of this route, and a
    // log line is not server-side enough: logs get pasted into chats and tickets.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await get()

    expect(logged).toHaveBeenCalled()
    for (const call of logged.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('1053118220')
    }
  })

  it('tells the reader nothing about why, in any failure', async () => {
    // The body is for a fetch() in the admin, not for a stranger: an error page
    // that names the courier, the order or the link would be a disclosure.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))

    const body = await (await get()).text()

    expect(body).not.toContain('econt')
    expect(body).not.toContain('55C-2026-000123')
  })
})
