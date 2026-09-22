'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * One click from an order to the printer (order-management back office).
 *
 * The label is a PDF on Econt's domain, and a cross-origin PDF cannot be sent to
 * the printer by script — so it comes through `labelPath()`, which serves it from
 * this origin (and keeps the courier's unauthenticated link off the page; see the
 * route). From there: fetch, blob URL, hidden frame, `print()` on the frame's own
 * `load` — a PDF printed before it has rendered comes out blank.
 *
 * Fetched rather than pointed at: with `iframe.src` set straight to the route, a
 * `404` or a `502` would be *rendered inside the print dialog* and the admin
 * would print an error page.
 *
 * ## Printing a PDF from a frame is the brittle part, so nothing here is silent
 *
 * Three things the browser can do instead of opening a dialog, and each says so
 * now. The first version of this component had `contentWindow?.print()` and no
 * timer, so two of the three produced a button that did nothing at all — which is
 * exactly what happened in production on 2026-09-22.
 *
 * - **No `contentWindow`.** The PDF is rendered by the browser's own viewer, and
 *   the frame need not hand its window over.
 * - **`print()` throws.** Reported with the browser's own wording.
 * - **`load` never fires.** Chrome does not always announce a PDF in a frame, so
 *   a dialog that has not appeared within `PRINT_WAIT_MS` is treated as failure.
 *
 * Every failure carries a link to the same label, because whatever the browser
 * did, there is still a parcel to send.
 *
 * Two details are load-bearing and both come from how the browsers behave rather
 * than from any specification:
 *
 * 1. **`focus()` before `print()`** — the proven implementations (print-js) do,
 *    and a dialog raised over an unfocused frame is not reliably raised at all.
 * 2. **The blob URL outlives the call.** `print()` does not reliably block for a
 *    PDF, so releasing the URL when it returns can pull the file out from under
 *    a dialog that has not read it. It is released when the component goes away.
 *
 * The frame stays in the tree, hidden by `visibility` and size — never
 * `display: none`, which is not laid out and prints nothing in Chrome.
 */

const FAILURES: Record<number, string> = {
  404: 'Няма запазен етикет за тази поръчка.',
  502: 'Econt не върна етикета. Опитай пак.',
}

const GENERIC_FAILURE = 'Етикетът не можа да бъде зареден.'
const NO_FRAME = 'Браузърът не даде достъп до рамката за печат.'
const NEVER_LOADED = 'Браузърът не зареди етикета за печат.'

/** How long a dialog may take to appear before the silence counts as failure. */
const PRINT_WAIT_MS = 3000

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
  const printing = useRef(false)

  /** Released here rather than after `print()` — see the docblock. */
  useEffect(() => {
    if (!blobUrl) return

    return () => URL.revokeObjectURL(blobUrl)
  }, [blobUrl])

  useEffect(() => {
    if (!blobUrl) return

    const timer = setTimeout(() => {
      if (!printing.current) setFailure(NEVER_LOADED)
    }, PRINT_WAIT_MS)

    return () => clearTimeout(timer)
  }, [blobUrl])

  async function handleClick() {
    setFailure(null)
    setLoading(true)
    printing.current = false

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

  function handleFrameLoad(event: React.SyntheticEvent<HTMLIFrameElement>) {
    const frame = event.currentTarget
    const frameWindow = frame.contentWindow

    if (!frameWindow) {
      setFailure(NO_FRAME)

      return
    }

    try {
      frame.focus()
      frameWindow.print()
      printing.current = true
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'непозната грешка'
      setFailure(`Печатът не можа да се стартира: ${reason}`)
    }
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
          {failure}{' '}
          <a href={labelUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Отвори етикета
          </a>
        </span>
      )}

      {blobUrl && (
        <iframe
          title="Етикет за печат"
          src={blobUrl}
          onLoad={handleFrameLoad}
          aria-hidden="true"
          className="invisible absolute h-0 w-0 border-0"
        />
      )}
    </>
  )
}
