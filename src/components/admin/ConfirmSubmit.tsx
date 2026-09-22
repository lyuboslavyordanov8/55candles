'use client'

import { useState } from 'react'

import { button, fieldLabel, input } from './ui'

/**
 * Type-to-confirm for an irreversible action (order-management back office UX
 * requirement) — renders the input and the submit button; the surrounding
 * `<form>` and its hidden fields are the caller's.
 *
 * Disabling the button is a courtesy, not the boundary: the action this form
 * posts to (`issueWaybill`, `issueInvoice`) re-checks the typed value against
 * the real order number after `requireAdmin()`, because a hand-built POST is
 * bound by nothing rendered here. See `confirmedOrderNumber` in
 * `src/app/admin/actions.ts`.
 */
export default function ConfirmSubmit({
  expected,
  buttonLabel,
  className = '',
}: {
  /** What has to be typed — the order number, in every use so far. */
  expected: string
  buttonLabel: string
  className?: string
}) {
  const [typed, setTyped] = useState('')
  const matches = typed.trim() === expected

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <label className="text-xs">
        <span className={fieldLabel}>
          Напиши <span className="font-medium">{expected}</span>, за да потвърдиш
        </span>
        <input
          name="confirmOrderNumber"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          className={`${input} w-44`}
        />
      </label>
      <button
        type="submit"
        disabled={!matches}
        className={button('primary')}
      >
        {buttonLabel}
      </button>
    </div>
  )
}
