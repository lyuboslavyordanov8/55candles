'use client'

import { useActionState } from 'react'

import { createProforma } from '@/app/admin/proformas/actions'
import { PROFORMA_LINE_ROWS, type ProformaFormState } from '@/lib/proforma-form'
import { button, fieldLabel, input, Notice, Section, textarea } from './ui'

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
 *
 * The line columns are labelled once, in a header row, and every input still
 * carries its own `aria-label`: a screen reader reading the fourth price field
 * has no header to refer back to.
 */
export default function ProformaForm() {
  const [state, submit, pending] = useActionState<ProformaFormState, FormData>(
    createProforma,
    null
  )

  return (
    <form action={submit} className="space-y-5">
      {state?.error && <Notice>{state.error}</Notice>}

      <Section title="Получател" description="Данните, както ще се отпечатат на документа.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="buyerName" label="Име / лице за контакт" required />
          <Field name="buyerCompany" label="Фирма" />
          <Field name="buyerEik" label="ЕИК / Булстат" />
          <Field name="buyerVatNumber" label="ДДС №" />
          <Field name="buyerAccountable" label="МОЛ" />
          <Field name="buyerAddress" label="Адрес" />
        </div>
      </Section>

      <Section
        title="Редове"
        description="Цените са в евро, за брой. Празните редове се пропускат, а сумата се смята от тях."
      >
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_4.5rem_6.5rem] gap-2 sm:grid-cols-[1fr_5rem_7rem]">
            <span className={`${fieldLabel} mb-0`}>Описание</span>
            <span className={`${fieldLabel} mb-0 text-right`}>К-во</span>
            <span className={`${fieldLabel} mb-0 text-right`}>Ед. цена</span>
          </div>

          {Array.from({ length: PROFORMA_LINE_ROWS }, (_, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_4.5rem_6.5rem] gap-2 sm:grid-cols-[1fr_5rem_7rem]"
            >
              <input
                name={`line${index}Description`}
                aria-label={`Описание, ред ${index + 1}`}
                placeholder={index === 0 ? 'Свещ „Лавандула“, 200 g' : undefined}
                maxLength={200}
                className={input}
              />
              <input
                name={`line${index}Quantity`}
                aria-label={`Количество, ред ${index + 1}`}
                placeholder={index === 0 ? '12' : undefined}
                inputMode="numeric"
                maxLength={10}
                className={`${input} text-right tabular-nums`}
              />
              <input
                name={`line${index}Price`}
                aria-label={`Единична цена, ред ${index + 1}`}
                placeholder={index === 0 ? '9,50' : undefined}
                inputMode="decimal"
                maxLength={20}
                className={`${input} text-right tabular-nums`}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Бележка"
        description="Печата се на документа — срок за изработка, условия, каквото клиентът трябва да прочете."
      >
        <textarea name="note" rows={3} maxLength={500} className={textarea} />
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={button('primary', 'lg')}>
          {pending ? 'Издавам…' : 'Издай проформа'}
        </button>
        <span className="text-xs text-ink-ghost">
          Издадената проформа получава номер и може да се изтрие, но номерът не се връща.
        </span>
      </div>
    </form>
  )
}

function Field({ name, label, required = false }: { name: string; label: string; required?: boolean }) {
  return (
    <label className="block">
      <span className={fieldLabel}>
        {label}
        {required && <span className="text-clay"> ·</span>}
      </span>
      <input name={name} required={required} maxLength={200} className={input} />
    </label>
  )
}
