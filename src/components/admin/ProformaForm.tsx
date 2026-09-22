'use client'

import { useActionState } from 'react'

import { createProforma } from '@/app/admin/proformas/actions'
import { PROFORMA_LINE_ROWS, type ProformaFormState } from '@/lib/proforma-form'

/**
 * The form one проформа is written on.
 *
 * A Client Component for one reason: `useActionState` reports a failure without
 * navigating, so the rows stay typed in. A plain form action would redirect to
 * an error and take eight lines of prices with it, which is the difference
 * between a form the shop uses and one it avoids.
 *
 * Nothing else here is interactive — no rows added by script, no totals computed
 * as you type. The total on the document is added up from the stored lines on the
 * server, and a second number here would be a figure that can disagree with it.
 */
export default function ProformaForm() {
  const [state, submit, pending] = useActionState<ProformaFormState, FormData>(
    createProforma,
    null
  )

  return (
    <form action={submit} className="space-y-6">
      {state?.error && (
        <p role="alert" className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {state.error}
        </p>
      )}

      <section className="space-y-3 rounded-sm border border-stone-200 bg-white p-4">
        <h2 className="text-xs font-medium tracking-wide text-stone-500 uppercase">Получател</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="buyerName" label="Име / лице за контакт" required />
          <Field name="buyerCompany" label="Фирма" />
          <Field name="buyerEik" label="ЕИК / Булстат" />
          <Field name="buyerVatNumber" label="ДДС №" />
          <Field name="buyerAccountable" label="МОЛ" />
          <Field name="buyerAddress" label="Адрес" />
        </div>
      </section>

      <section className="space-y-3 rounded-sm border border-stone-200 bg-white p-4">
        <h2 className="text-xs font-medium tracking-wide text-stone-500 uppercase">Редове</h2>
        <p className="text-xs text-stone-500">
          Цените са в евро, за брой. Празните редове се пропускат.
        </p>

        <div className="space-y-2">
          {Array.from({ length: PROFORMA_LINE_ROWS }, (_, index) => (
            <div key={index} className="grid grid-cols-[1fr_5rem_7rem] gap-2">
              <input
                name={`line${index}Description`}
                aria-label={`Описание, ред ${index + 1}`}
                placeholder={index === 0 ? 'Свещ „Лавандула“, 200 g' : undefined}
                maxLength={200}
                className="w-full rounded-sm border border-stone-300 px-2 py-1.5 text-xs"
              />
              <input
                name={`line${index}Quantity`}
                aria-label={`Количество, ред ${index + 1}`}
                placeholder={index === 0 ? 'бр.' : undefined}
                inputMode="numeric"
                maxLength={10}
                className="w-full rounded-sm border border-stone-300 px-2 py-1.5 text-right text-xs tabular-nums"
              />
              <input
                name={`line${index}Price`}
                aria-label={`Единична цена, ред ${index + 1}`}
                placeholder={index === 0 ? '9,50' : undefined}
                inputMode="decimal"
                maxLength={20}
                className="w-full rounded-sm border border-stone-300 px-2 py-1.5 text-right text-xs tabular-nums"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-sm border border-stone-200 bg-white p-4">
        <h2 className="text-xs font-medium tracking-wide text-stone-500 uppercase">Бележка</h2>
        <p className="text-xs text-stone-500">
          Печата се на документа — срок за изработка, условия, каквото клиентът трябва да прочете.
        </p>
        <textarea
          name="note"
          rows={3}
          maxLength={500}
          className="w-full rounded-sm border border-stone-300 px-2 py-1.5 text-xs"
        />
      </section>

      <button
        type="submit"
        disabled={pending}
        className="rounded-sm border border-stone-800 bg-stone-800 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {pending ? 'Издавам…' : 'Издай проформа'}
      </button>
    </form>
  )
}

function Field({ name, label, required = false }: { name: string; label: string; required?: boolean }) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-stone-500">{label}</span>
      <input
        name={name}
        required={required}
        maxLength={200}
        className="w-full rounded-sm border border-stone-300 px-2 py-1.5"
      />
    </label>
  )
}
