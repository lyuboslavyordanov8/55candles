'use client'

import { useActionState, useState } from 'react'

import { saveExpense } from '@/app/admin/accounting/actions'
import type { ExpenseFormState } from '@/lib/accounting/expense-form'
import {
  EXPENSE_PAYMENT_METHODS,
  groupedCategories,
  type Vocabulary,
} from '@/lib/accounting/vocabulary'
import { button, fieldLabel, input, Notice, Section, select, textarea } from './ui'

/**
 * Entering one purchase, in as few taps as it can be done in.
 *
 * Shaped around where it is actually used: standing in a workshop with a paper
 * receipt, on a phone. So four fields are visible — supplier, date, total,
 * category — and everything else is behind "още полета", collapsed by default.
 * A form that asks for a supplier's ЕИК before it will accept €9,50 of wicks is
 * a form that does not get used, and an expense not entered is worse than one
 * entered without its ЕИК.
 *
 * `useActionState` so a rejected amount does not navigate away and take the rest
 * of the typing with it. The date defaults to today, the two number fields ask
 * the phone for a numeric keypad, and the supplier field is what gets focus.
 *
 * There is no photograph here. Storing one needs a blob store this project does
 * not have; the checkbox records whether the document exists, which is what the
 * monthly close asks. When storage arrives the camera input belongs right here,
 * beside that checkbox.
 */
export default function ExpenseForm({ defaultDate }: { defaultDate: string }) {
  const [state, submit, pending] = useActionState<ExpenseFormState, FormData>(saveExpense, null)
  const [expanded, setExpanded] = useState(false)

  const marked = (name: string) => (state?.field === name ? 'border-red-400' : '')

  return (
    <form action={submit} className="space-y-5">
      {state?.error && <Notice>{state.error}</Notice>}

      <Section title="Разход" description="Четирите полета отгоре са достатъчни, за да запишеш.">
        <div className="space-y-3">
          <label className="block">
            <span className={fieldLabel}>Доставчик</span>
            <input
              name="supplier"
              required
              autoFocus
              maxLength={200}
              placeholder="напр. Опаковки ЕООД"
              className={`${input} h-9 text-sm ${marked('supplier')}`}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={fieldLabel}>Дата на документа</span>
              <input
                type="date"
                name="documentDate"
                required
                defaultValue={defaultDate}
                className={`${input} h-9 text-sm ${marked('documentDate')}`}
              />
            </label>

            <label className="block">
              <span className={fieldLabel}>Общо платено (€)</span>
              <input
                name="total"
                required
                inputMode="decimal"
                maxLength={20}
                placeholder="86,40"
                className={`${input} h-9 text-right text-sm tabular-nums ${marked('total')}`}
              />
            </label>
          </div>

          <label className="block">
            <span className={fieldLabel}>Категория</span>
            <select
              name="category"
              required
              defaultValue=""
              className={`${select} h-9 text-sm ${marked('category')}`}
            >
              <option value="" disabled>
                избери…
              </option>
              {groupedCategories().map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.entries.map((entry: Vocabulary) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-2 rounded-md border border-border bg-cream-surface/60 px-3 py-2.5 text-xs">
            <input
              type="checkbox"
              name="documentInHand"
              defaultChecked
              className="mt-0.5 size-4 accent-charcoal"
            />
            <span>
              <span className="font-medium text-ink-primary">Документът е у мен</span>
              <span className="mt-0.5 block text-ink-ghost">
                Махни отметката, ако още няма фактура или бон — месецът ще го покаже като липсващ,
                докато не се появи.
              </span>
            </span>
          </label>
        </div>
      </Section>

      {expanded ? (
        <Section
          title="Още полета"
          description="Каквото има на документа. Може и по-късно."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={fieldLabel}>ЕИК на доставчика</span>
              <input name="supplierEik" maxLength={40} className={`${input} tabular-nums`} />
            </label>

            <label className="block">
              <span className={fieldLabel}>Документ №</span>
              <input name="documentNumber" maxLength={60} className={`${input} tabular-nums`} />
            </label>

            <label className="block">
              <span className={fieldLabel}>Без ДДС (по документа)</span>
              <input
                name="net"
                inputMode="decimal"
                maxLength={20}
                className={`${input} text-right tabular-nums ${marked('net')}`}
              />
            </label>

            <label className="block">
              <span className={fieldLabel}>ДДС по документа</span>
              <input
                name="vatShown"
                inputMode="decimal"
                maxLength={20}
                className={`${input} text-right tabular-nums ${marked('vatShown')}`}
              />
            </label>

            <label className="block">
              <span className={fieldLabel}>Плащане</span>
              <select name="paymentMethod" defaultValue="card" className={select}>
                {EXPENSE_PAYMENT_METHODS.map((method) => (
                  <option key={method.key} value={method.key}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={fieldLabel}>Описание</span>
              <input name="description" maxLength={200} className={input} />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={fieldLabel}>Бележка</span>
            <textarea name="note" rows={2} maxLength={500} className={textarea} />
          </label>

          <p className="mt-3 text-xs text-ink-ghost">
            ДДС-то, което доставчикът е начислил, се записва както е на документа. Дали то значи
            нещо за нас е въпрос към счетоводителя — дружеството не е регистрирано по ЗДДС.
          </p>
        </Section>
      ) : (
        <>
          <input type="hidden" name="paymentMethod" value="card" />
          <button type="button" onClick={() => setExpanded(true)} className={button('ghost')}>
            + още полета (ЕИК, номер на документ, ДДС)
          </button>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={button('primary', 'lg')}>
          {pending ? 'Записвам…' : 'Запиши разхода'}
        </button>
        <span className="text-xs text-ink-ghost">Записва се като „за преглед“.</span>
      </div>
    </form>
  )
}
