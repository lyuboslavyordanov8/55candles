'use client'

import { useState } from 'react'

/**
 * One click from an order to the printer (order-management back office).
 *
 * The label is a PDF on Econt's domain, and a cross-origin PDF cannot be sent to
 * the printer by script — so it comes through `/api/admin/orders/[id]/label`,
 * which serves it from this origin (and keeps the courier's unauthenticated link
 * off the page; see the route).
 *
 * Fetched rather than pointed at: with `iframe.src` set straight to the route, a
 * `404` or a `502` would be *rendered inside the print dialog* and the admin
 * would print an error page. A fetch makes the same failure a sentence under the
 * button, and the dialog only ever opens over a real label.
 *
 * The frame stays in the tree, hidden, while there is a label in it: Chrome and
 * Firefox both need the document alive for the dialog the user is looking at.
 */

const FAILURES: Record<number, string> = {
  404: 'Няма запазен етикет за тази поръчка. Отвори я в my.econt.com.',
  502: 'Econt не върна етикета. Опитай пак, или го отвори в my.econt.com.',
}

const GENERIC_FAILURE = 'Етикетът не можа да бъде зареден. Опитай пак.'

export default function PrintLabelButton({
  labelUrl,
  label = 'Принтирай етикет',
}: {
  /** From `labelPath()`, which is also what the "етикет (PDF)" link points at. */
  labelUrl: string
  label?: string
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function handleClick() {
    setFailure(null)
    setLoading(true)

    try {
      const response = await fetch(labelUrl)

      if (!response.ok) {
        setFailure(FAILURES[response.status] ?? GENERIC_FAILURE)

        return
      }

      setBlobUrl(URL.createObjectURL(await response.blob()))
    } catch {
      // Offline, or the request never arrived. Nothing was printed and nothing
      // was spent — the button is there to press again.
      setFailure(GENERIC_FAILURE)
    } finally {
      setLoading(false)
    }
  }

  /**
   * The dialog is opened from the frame's own `load`, not after setting `src`:
   * printing a PDF that has not finished rendering prints a blank page.
   */
  function handleFrameLoad(event: React.SyntheticEvent<HTMLIFrameElement>) {
    event.currentTarget.contentWindow?.print()

    if (blobUrl) URL.revokeObjectURL(blobUrl)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded-sm border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100 disabled:opacity-50"
      >
        {loading ? 'Зареждам…' : label}
      </button>

      {/* A `span`, not a `p`: this sits inside the paragraph that names the waybill. */}
      {failure && (
        <span role="alert" className="mt-1 block text-xs text-red-800">
          {failure}
        </span>
      )}

      {blobUrl && (
        <iframe
          title="Етикет за печат"
          src={blobUrl}
          onLoad={handleFrameLoad}
          aria-hidden="true"
          // Hidden by `visibility` and size, **not** by `display: none`: a frame
          // that is not displayed is not laid out, and Chrome then prints either
          // nothing or a blank page from it. Off-screen-and-invisible is what the
          // print-from-iframe trick actually needs.
          className="invisible absolute h-0 w-0 border-0"
        />
      )}
    </>
  )
}
