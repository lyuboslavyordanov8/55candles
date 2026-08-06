'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { submitCheckout, type CheckoutState } from '@/app/[locale]/checkout/actions'
import { COURIERS, DELIVERY_METHODS, type Courier, type DeliveryMethod } from '@/lib/shipping'
import OrderSummary from './OrderSummary'
import type { PaymentMethod } from '@/lib/payments'

/**
 * Delivery and payment form (AUDIT.md Q-21, Q-25).
 *
 * Client Component because the visible fields depend on the chosen delivery
 * method: door needs a street, office and locker need an office. Rendering all
 * of them and hoping the customer picks correctly produces unroutable parcels.
 *
 * Uses `useActionState` per the Next 16 forms guide, which keeps the form
 * working without JavaScript and gives a `pending` flag for free. The action
 * re-validates and re-prices everything server-side — this form's validation
 * is a convenience, not a boundary.
 */

const INITIAL: CheckoutState = { status: 'idle' }

const inputClass =
  'w-full rounded-sm px-4 py-3 text-sm bg-cream-base border border-border focus:border-clay focus:outline-none transition-colors duration-200 text-charcoal'

/**
 * Declared at module scope, not inside `DeliveryForm`.
 *
 * A component defined during render is a *new component type* on every render,
 * so React unmounts and remounts its DOM node — which for an uncontrolled
 * input throws away whatever the customer had typed. Switching delivery method
 * re-renders this form, so nesting it would silently clear the address fields
 * mid-checkout.
 */
function Field({
  name,
  label,
  error,
  type = 'text',
  autoComplete,
  required = true,
  inputMode,
  optionalLabel,
}: {
  name: string
  label: string
  error?: string
  type?: string
  autoComplete?: string
  required?: boolean
  inputMode?: 'text' | 'tel' | 'email' | 'numeric'
  optionalLabel?: string
}) {
  const id = `delivery-${name}`

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs text-ink-secondary tracking-wide">
        {label}
        {!required && optionalLabel && <span className="ml-1 text-ink-ghost">{optionalLabel}</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

interface Props {
  /** Cart lines, serialised into the form so the action can re-price them. */
  cart: Array<{ slug: string; quantity: number }>
  /** Methods the server can actually take payment with. */
  paymentMethods: readonly PaymentMethod[]
  /** True when at least one courier rate card exists (Q-22). */
  shippingConfigured: boolean
  /** For currency formatting — Bulgarian writes `24,50 €`, English `€24.50`. */
  locale: string
}

export default function DeliveryForm({
  cart,
  paymentMethods,
  shippingConfigured,
  locale,
}: Props) {
  const t = useTranslations('checkout')
  const [state, formAction, pending] = useActionState(submitCheckout, INITIAL)

  const [method, setMethod] = useState<DeliveryMethod>('office')
  const [courier, setCourier] = useState<Courier>('econt')

  const errors = state.fieldErrors ?? {}

  /** Field error text, or undefined. Codes are namespaced to avoid collisions. */
  const errorFor = (field: string): string | undefined => {
    const code = errors[field as keyof typeof errors]
    return code ? t(`error.${field}.${code}`) : undefined
  }

  /** Props every `Field` needs, so the translation calls stay in one place. */
  const fieldProps = (name: string) => ({
    name,
    label: t(`field.${name}`),
    error: errorFor(name),
    optionalLabel: t('optional'),
  })

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="cart" value={JSON.stringify(cart)} />

      {!shippingConfigured && (
        <p role="note" className="rounded-sm bg-cream-surface p-4 text-xs text-ink-secondary">
          {t('shippingNotConfigured')}
        </p>
      )}

      <fieldset className="space-y-4">
        <legend className="font-serif text-lg text-charcoal">{t('recipient')}</legend>
        <Field {...fieldProps('recipientName')} autoComplete="name" />
        <Field {...fieldProps('phone')} type="tel" inputMode="tel" autoComplete="tel" />
        <Field
          {...fieldProps('email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          required={false}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-serif text-lg text-charcoal">{t('delivery')}</legend>

        <div className="flex flex-col gap-2">
          <label htmlFor="delivery-courier" className="text-xs text-ink-secondary tracking-wide">
            {t('field.courier')}
          </label>
          <select
            id="delivery-courier"
            name="courier"
            value={courier}
            onChange={(e) => setCourier(e.target.value as Courier)}
            className={inputClass}
          >
            {COURIERS.map((option) => (
              <option key={option} value={option}>
                {t(`courier.${option}`)}
              </option>
            ))}
          </select>
        </div>

        {/*
          Radios rather than a select: three options, and the choice changes
          which fields appear below, so it should be visible at a glance.
        */}
        <div role="radiogroup" aria-labelledby="delivery-method-label" className="space-y-2">
          <span id="delivery-method-label" className="block text-xs text-ink-secondary tracking-wide">
            {t('field.method')}
          </span>
          {DELIVERY_METHODS.map((option) => (
            <label key={option} className="flex items-start gap-3 text-sm text-charcoal">
              <input
                type="radio"
                name="method"
                value={option}
                checked={method === option}
                onChange={() => setMethod(option)}
                className="mt-1"
              />
              <span>
                {t(`method.${option}`)}
                <span className="block text-xs text-ink-ghost">{t(`methodHint.${option}`)}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field {...fieldProps('city')} autoComplete="address-level2" />
          <Field {...fieldProps('postCode')} inputMode="numeric" autoComplete="postal-code" />
        </div>

        {method === 'door' ? (
          <Field {...fieldProps('street')} autoComplete="street-address" />
        ) : (
          <>
            <Field {...fieldProps('officeId')} />
            {/*
              A free-text office reference, because the courier nomenclature
              API needs credentials that do not exist yet (Q-22). When they do,
              this becomes a searchable picker fed by `courierClient()`. Asking
              the customer to type the office is worse than a picker but far
              better than a picker populated with invented offices.
            */}
            <p className="text-xs text-ink-ghost">{t('officeLookupPending')}</p>
          </>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="delivery-note" className="text-xs text-ink-secondary tracking-wide">
            {t('field.note')}
            <span className="ml-1 text-ink-ghost">{t('optional')}</span>
          </label>
          <textarea id="delivery-note" name="note" rows={3} className={`${inputClass} resize-none`} />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-serif text-lg text-charcoal">{t('payment')}</legend>
        {paymentMethods.map((option) => (
          <label key={option} className="flex items-start gap-3 text-sm text-charcoal">
            <input
              type="radio"
              name="paymentMethod"
              value={option}
              defaultChecked={option === paymentMethods[0]}
              className="mt-1"
            />
            <span>
              {t(`paymentMethod.${option}`)}
              <span className="block text-xs text-ink-ghost">{t(`paymentHint.${option}`)}</span>
            </span>
          </label>
        ))}
        {!paymentMethods.includes('card') && (
          <p className="text-xs text-ink-ghost">{t('cardNotConfigured')}</p>
        )}
      </fieldset>

      {/* The priced breakdown, shown only once the server has produced one. */}
      {state.summary && <OrderSummary summary={state.summary} locale={locale} />}

      {state.status !== 'idle' && state.messageKey && (
        <p
          role={state.status === 'readyToPay' ? 'status' : 'alert'}
          className={`text-xs ${state.status === 'readyToPay' ? 'text-ink-secondary' : 'text-red-700'}`}
        >
          {t(`message.${state.messageKey}`)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-sm bg-charcoal px-6 py-3 text-xs font-medium uppercase tracking-wide text-cream-base transition-opacity duration-200 hover:opacity-80 disabled:opacity-50"
      >
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
