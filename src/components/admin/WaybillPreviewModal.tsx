'use client'

import { useEffect, useState } from 'react'
import ConfirmSubmit from './ConfirmSubmit'

interface Props {
  orderId: string
  orderNumber: string
  courierLabel: string
  /** `null` when the courier has no ad-hoc sender identity to show (e.g. Speedy, whose sender comes from the contract client, not a name typed anywhere). */
  sender: { name: string; phone: string; from: string } | null
  recipientName: string
  recipientPhone: string
  destination: string
  weightGrams: number
  codAmount: string
  /** The server action itself, passed through so the confirming form still posts straight to it. */
  issueWaybill: (formData: FormData) => void | Promise<void>
}

/**
 * "Show me everything first," for an action nothing here can undo (order-management
 * back office UX requirement — see `ConfirmSubmit`).
 *
 * Not a preview of the real label: Econt has no "show me the PDF without booking"
 * call, the printable label only exists once the parcel is actually created (see
 * `toWaybill` in `src/lib/couriers/econt.ts`). This is the next best thing —
 * everything that is about to go onto it, laid out the way the label will read it —
 * with the irreversible press gated behind that recap rather than sitting under a
 * paragraph nobody has to stop and read.
 *
 * A plain overlay rather than `<dialog>`: this needs no more than a backdrop, a
 * focus-worthy heading and an Escape handler, and writing those three lines here
 * avoids finding out later which target browsers disagree with `showModal()`.
 */
export default function WaybillPreviewModal({
  orderId,
  orderNumber,
  courierLabel,
  sender,
  recipientName,
  recipientPhone,
  destination,
  weightGrams,
  codAmount,
  issueWaybill,
}: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-sm bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700"
      >
        Прегледай преди издаване
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
          onClick={(event) => {
            // Only the backdrop itself closes it — a click inside the card must not.
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="waybill-preview-heading"
            className="w-full max-w-md space-y-3 rounded-sm border border-stone-300 bg-white p-5 text-xs"
          >
            <h3 id="waybill-preview-heading" className="text-sm font-medium text-stone-900">
              Преглед на товарителницата
            </h3>
            <p className="text-stone-500">
              {courierLabel} · {orderNumber}
            </p>

            {sender && (
              <div>
                <p className="text-stone-500">Подател</p>
                <p className="text-stone-900">
                  {sender.name} · {sender.phone}
                </p>
                <p className="text-stone-600">{sender.from}</p>
              </div>
            )}

            <div>
              <p className="text-stone-500">Получател</p>
              <p className="text-stone-900">
                {recipientName} · {recipientPhone}
              </p>
              <p className="text-stone-600">{destination}</p>
            </div>

            <div className="flex justify-between border-t border-stone-100 pt-2">
              <span className="text-stone-500">Тегло</span>
              <span>{weightGrams} г</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Наложен платеж</span>
              <span className="font-medium text-stone-900">{codAmount}</span>
            </div>

            <form action={issueWaybill} className="space-y-2 border-t border-stone-100 pt-3">
              <input type="hidden" name="orderId" value={orderId} />
              <ConfirmSubmit expected={orderNumber} buttonLabel="Издай товарителница" />
            </form>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-stone-500 underline"
            >
              Затвори без да издаваш
            </button>
          </div>
        </div>
      )}
    </>
  )
}
