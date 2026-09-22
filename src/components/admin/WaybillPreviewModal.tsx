'use client'

import { useEffect, useState } from 'react'
import ConfirmSubmit from './ConfirmSubmit'
import { button } from './ui'

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
        className={button('primary')}
      >
        Прегледай преди издаване
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/45 p-4 backdrop-blur-[2px]"
          onClick={(event) => {
            // Only the backdrop itself closes it — a click inside the card must not.
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="waybill-preview-heading"
            className="w-full max-w-md rounded-lg border border-border bg-paper-white text-xs shadow-xl"
          >
            <div className="border-b border-border/60 px-5 py-4">
              <h3
                id="waybill-preview-heading"
                className="font-serif text-lg leading-tight text-charcoal"
              >
                Издаване на товарителница
              </h3>
              <p className="mt-1 text-ink-secondary">
                {courierLabel} · {orderNumber} · пратката се създава веднага и се заплаща, дори да
                не бъде подадена.
              </p>
            </div>

            <div className="space-y-3 px-5 py-4">

              {sender && (
                <div>
                  <p className="text-[11px] tracking-wide text-ink-ghost uppercase">Подател</p>
                  <p className="text-ink-primary">
                    {sender.name} · <span className="tabular-nums">{sender.phone}</span>
                  </p>
                  <p className="text-ink-secondary">{sender.from}</p>
                </div>
              )}

              <div>
                <p className="text-[11px] tracking-wide text-ink-ghost uppercase">Получател</p>
                <p className="text-ink-primary">
                  {recipientName} · <span className="tabular-nums">{recipientPhone}</span>
                </p>
                <p className="text-ink-secondary">{destination}</p>
              </div>

              <dl className="space-y-1 border-t border-border/60 pt-3">
                <div className="flex justify-between">
                  <dt className="text-ink-ghost">Тегло</dt>
                  <dd className="tabular-nums">{weightGrams} г</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-ghost">Наложен платеж</dt>
                  <dd className="font-medium text-ink-primary tabular-nums">{codAmount}</dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/60 bg-cream-surface/60 px-5 py-4">
              <form action={issueWaybill}>
                <input type="hidden" name="orderId" value={orderId} />
                <ConfirmSubmit expected={orderNumber} buttonLabel="Издай товарителница" />
              </form>

              <button type="button" onClick={() => setOpen(false)} className={button('ghost')}>
                Затвори
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
