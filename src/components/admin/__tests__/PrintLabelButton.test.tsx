import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PrintLabelButton from '../PrintLabelButton'

/**
 * One click from the order to the printer (order-management back office UX).
 *
 * The label is fetched from `labelPath()` — our own origin,
 * because a cross-origin PDF cannot be printed by script — turned into a blob
 * URL and printed from a hidden iframe.
 *
 * Why `fetch` and not simply pointing the iframe at the route: a failure would
 * then be *rendered inside the print dialog*, and the admin would print an error
 * page. Fetching first makes a failure a sentence under the button, which is what
 * these tests are mostly about.
 *
 * jsdom has neither `createObjectURL` nor a printable iframe, so both are stubbed
 * — the same treatment `CopyButton.test.tsx` gives the clipboard.
 */

const LABEL_URL = '/admin/orders/11111111-1111-1111-1111-111111111111/label'
const BLOB_URL = 'blob:http://localhost/label'

const print = vi.fn()
const createObjectURL = vi.fn().mockReturnValue(BLOB_URL)
const revokeObjectURL = vi.fn()

function pdfResponse() {
  return new Response(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { status: 200 })
}

/** The button, clicked, with the fetch it makes already settled. */
async function clickPrint() {
  render(<PrintLabelButton labelUrl={LABEL_URL} />)
  await userEvent.click(screen.getByRole('button'))
}

beforeEach(() => {
  print.mockClear()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()

  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    get: () => ({ print }),
    configurable: true,
  })

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pdfResponse()))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PrintLabelButton', () => {
  it('asks our own route for the label, not the courier', async () => {
    await clickPrint()

    expect(fetch).toHaveBeenCalledWith(LABEL_URL)
  })

  it('prints once the label has loaded in the frame', async () => {
    await clickPrint()

    // The frame appears only while there is something to print.
    const frame = await screen.findByTitle('Етикет за печат')
    expect(frame).toHaveAttribute('src', BLOB_URL)

    fireEvent.load(frame)

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('focuses the frame before printing, as the print dialog expects', async () => {
    const focus = vi.spyOn(HTMLIFrameElement.prototype, 'focus')

    await clickPrint()
    fireEvent.load(await screen.findByTitle('Етикет за печат'))

    expect(focus).toHaveBeenCalled()
    expect(focus.mock.invocationCallOrder[0]).toBeLessThan(print.mock.invocationCallOrder[0])
  })

  it('keeps the blob alive after printing, because the dialog still reads it', async () => {
    // `print()` does not reliably block for a PDF in Chrome. Releasing the URL
    // as soon as it returns pulls the file out from under a dialog that has not
    // read it yet — and a dialog that never appears is exactly the symptom.
    await clickPrint()

    fireEvent.load(await screen.findByTitle('Етикет за печат'))

    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('releases the blob when the order leaves the screen', async () => {
    const { unmount } = render(<PrintLabelButton labelUrl={LABEL_URL} />)
    await userEvent.click(screen.getByRole('button'))
    await screen.findByTitle('Етикет за печат')

    unmount()

    expect(revokeObjectURL).toHaveBeenCalledWith(BLOB_URL)
  })

  it('says so when the browser hands back no frame to print from', async () => {
    // What `?.print()` used to swallow in silence.
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      get: () => null,
      configurable: true,
    })

    await clickPrint()
    fireEvent.load(await screen.findByTitle('Етикет за печат'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('says so, with the reason, when printing throws', async () => {
    print.mockImplementationOnce(() => {
      throw new Error('blocked by the browser')
    })

    await clickPrint()
    fireEvent.load(await screen.findByTitle('Етикет за печат'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked by the browser/)
  })

  it('says so when the frame never loads at all', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    try {
      render(<PrintLabelButton labelUrl={LABEL_URL} />)
      await userEvent.click(screen.getByRole('button'))
      await screen.findByTitle('Етикет за печат')

      // No `load` event — the case where Chrome never announces the PDF.
      await vi.advanceTimersByTimeAsync(4000)

      expect(await screen.findByRole('alert')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('offers the label as a link whenever printing fails', async () => {
    // A dead end is not an option: whatever the browser did, the admin still has
    // a parcel to send.
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 502 }))

    await clickPrint()

    expect(await screen.findByRole('link', { name: /етикет/i })).toHaveAttribute('href', LABEL_URL)
  })

  it('says so when the route has no label to give', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }))

    await clickPrint()

    expect(await screen.findByRole('alert')).toHaveTextContent(/етикет/i)
    expect(print).not.toHaveBeenCalled()
  })

  it('says so when the courier cannot be reached', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 502 }))

    await clickPrint()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(print).not.toHaveBeenCalled()
  })

  it('says so when the request itself fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))

    await clickPrint()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('cannot be pressed twice while a label is on its way', async () => {
    let release: (value: Response) => void = () => {}
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve
      })
    )

    render(<PrintLabelButton labelUrl={LABEL_URL} />)
    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('button')).toBeDisabled()

    release(pdfResponse())
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
  })

  it('clears a previous failure when tried again', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 502 }))

    render(<PrintLabelButton labelUrl={LABEL_URL} />)
    await userEvent.click(screen.getByRole('button'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
