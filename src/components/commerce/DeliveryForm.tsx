'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { submitCheckout, type CheckoutState } from '@/app/[locale]/checkout/actions'
import { phoneProblem, PHONE_EXAMPLE, type PhoneProblem } from '@/lib/phone'
import { sameBasket } from '@/lib/cart-params'
import { COURIERS, DELIVERY_METHODS, type Courier, type DeliveryMethod } from '@/lib/shipping'
import CourierMark from './CourierMark'
import OfficePicker from './OfficePicker'
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
  placeholder,
  defaultValue,
  value,
  onChange,
  onEdit,
  onBlur,
}: {
  name: string
  label: string
  error?: string
  type?: string
  autoComplete?: string
  required?: boolean
  inputMode?: 'text' | 'tel' | 'email' | 'numeric'
  optionalLabel?: string
  placeholder?: string
  /**
   * What the field falls back to — which is also what React restores it to when
   * it resets the form after a submission. See `restore` in `DeliveryForm`.
   */
  defaultValue?: string
  /**
   * Supply both to make the field controlled. Only `city` and `postCode` are,
   * because the office picker fills them from the courier's own record; the
   * rest stay uncontrolled so React is not re-rendering the form on every
   * keystroke of an address.
   */
  value?: string
  onChange?: (value: string) => void
  /** Every edit, controlled or not. Used to clear a stale message while retyping. */
  onEdit?: (value: string) => void
  /** On leaving the field — where a format check belongs, not mid-word. */
  onBlur?: (value: string) => void
}) {
  const id = `delivery-${name}`
  const controlled = value !== undefined && onChange !== undefined

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
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
        onChange={(event) => {
          onEdit?.(event.target.value)
          if (controlled) onChange(event.target.value)
        }}
        onBlur={onBlur ? (event) => onBlur(event.target.value) : undefined}
        {...(controlled ? { value } : { defaultValue })}
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
  /**
   * Couriers whose office list can actually be searched. Anything not listed
   * falls back to the free-text office field, so a courier without credentials
   * costs the customer some typing rather than the order.
   */
  officeLookup?: readonly Courier[]
  /** True when the office list comes from a courier's demo environment. */
  officeDataIsDemo?: boolean
  /** For currency formatting — Bulgarian writes `24,50 €`, English `€24.50`. */
  locale: string
}

export default function DeliveryForm({
  cart,
  paymentMethods,
  shippingConfigured,
  officeLookup = [],
  officeDataIsDemo = false,
  locale,
}: Props) {
  const t = useTranslations('checkout')
  const [state, formAction, pending] = useActionState(submitCheckout, INITIAL)

  const [method, setMethod] = useState<DeliveryMethod>('office')
  const [courier, setCourier] = useState<Courier>('econt')

  // Controlled so the office picker can fill them from the courier's own city
  // record. A post code that disagrees with the city is one of the few things
  // both couriers reject outright.
  const [city, setCity] = useState('')
  const [postCode, setPostCode] = useState('')

  /**
   * What is wrong with the phone number, checked in the browser as the customer
   * leaves the field. Worth doing here as well as on the server, unlike every
   * other field: an unreachable number is the one mistake that survives
   * checkout, and it costs an undelivered parcel rather than a form error.
   */
  const [phoneIssue, setPhoneIssue] = useState<PhoneProblem | null>(null)

  const errors = state.fieldErrors ?? {}

  /**
   * The summary, but only while it still belongs to this basket.
   *
   * `useActionState` keeps its state across re-renders, and the basket editor
   * above re-renders this page by rewriting `?items=`. Without this check, a
   * customer who priced two candles and then pressed − would be looking at a
   * total for two while their basket held one — a wrong number presented as a
   * confirmed one, which is worse than no number. Dropping it puts them back to
   * "press the button to get a price", which is true.
   */
  const summary =
    state.summary && sameBasket(state.summary.lines, cart) ? state.summary : undefined

  /** Field error text, or undefined. Codes are namespaced to avoid collisions. */
  const errorFor = (field: string): string | undefined => {
    const code = errors[field as keyof typeof errors]
    return code ? t(`error.${field}.${code}`) : undefined
  }

  /**
   * The browser's own verdict on the phone number, which takes precedence: it
   * describes what is in the box now, while the server's error describes what
   * was submitted.
   */
  const phoneError = phoneIssue ? t(`error.phone.${phoneIssue}`) : undefined

  /**
   * What the customer last submitted for a field.
   *
   * React resets an uncontrolled form once its action completes — so without
   * this, one missing street cost the customer their name, phone, email and
   * note, and they had to type all of it again to find out whether the street
   * was now right. The action echoes the submitted values back and they become
   * the fields' `defaultValue`, which is precisely what the reset restores to,
   * so a rejected submission leaves everything except the mistake untouched.
   *
   * The state survives until the next submission, so this also covers the
   * re-render the basket editor above causes when a quantity changes.
   */
  const restore = (field: string): string | undefined =>
    state.values?.[field as keyof typeof state.values]

  /** Props every `Field` needs, so the translation calls stay in one place. */
  const fieldProps = (name: string) => ({
    name,
    label: t(`field.${name}`),
    error: errorFor(name),
    optionalLabel: t('optional'),
    defaultValue: restore(name),
  })

  /**
   * Whether the courier's own office list is doing the asking.
   *
   * This decides who owns the city. The picker's first step *is* a city search,
   * so showing the form's own City and Post code fields as well asked for the
   * same thing twice — and invited the customer to type a city that disagrees
   * with the office they then chose. When the picker is on, the pair becomes
   * hidden inputs that only it fills.
   */
  const usesPicker = method !== 'door' && officeLookup.includes(courier)

  /**
   * A city or post-code error, which can only be seen when the pair is hidden.
   *
   * Not reachable in an ordinary submission — the picker fills both from one
   * record, and the office select is `required`. But an empty hidden input that
   * silently fails validation is exactly the kind of dead end this form exists
   * to avoid, so if the server ever complains, the customer is told.
   */
  const hiddenLocationError = errorFor('city') ?? errorFor('postCode')

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
        {/*
          The phone number is checked here as well as on the server, which is the
          one field where that duplication earns its keep: a customer who
          mistypes a digit finds out on the spot, not after the summary has been
          priced. Both sides call the same `phone.ts`, so they cannot disagree.

          Checked on blur rather than per keystroke — "that is too short" while
          someone is still halfway through typing their own number is nagging,
          not helping. Editing clears the message so it never contradicts what is
          currently in the box.
        */}
        <Field
          {...fieldProps('phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={PHONE_EXAMPLE}
          error={phoneError ?? errorFor('phone')}
          onEdit={() => setPhoneIssue(null)}
          onBlur={(entered) => setPhoneIssue(entered ? phoneProblem(entered) : null)}
        />
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

        {/*
          Radios rather than a select, for the same reason as the method below:
          there are two couriers, and which one is chosen decides whether the
          office field is a searchable list or a text box. A closed menu hides
          both the choice and the consequence.

          Each option is the courier's own logo — see `CourierMark`, which
          explains why the mark replaces the name rather than sitting beside it.
          Laid out in a row because the marks are small; the methods below stack
          because each carries a hint line.
        */}
        <div className="flex flex-col gap-2">
          <span id="delivery-courier-label" className="text-xs text-ink-secondary tracking-wide">
            {t('field.courier')}
          </span>
          <div
            role="radiogroup"
            aria-labelledby="delivery-courier-label"
            className="flex flex-wrap gap-x-6 gap-y-3"
          >
            {COURIERS.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-3 rounded-sm border border-border bg-cream-base px-4 py-3 transition-colors duration-200 has-[:checked]:border-clay"
              >
                {/*
                  `defaultChecked`, not `checked`. React clears the form when the
                  action completes and restores controlled *text* inputs
                  afterwards, but not radios: a controlled one came back visibly
                  unselected while the state behind it still said Speedy, so the
                  customer would be looking at Econt and submitting Speedy.
                  Deriving the default from the state makes the reset restore
                  exactly what is chosen. `onChange` still keeps the state, which
                  is what decides whether the office field is a picker.
                */}
                <input
                  type="radio"
                  name="courier"
                  value={option}
                  defaultChecked={courier === option}
                  onChange={() => setCourier(option)}
                />
                <CourierMark
                  courier={option}
                  locale={locale}
                  name={t(`courier.${option}`)}
                />
              </label>
            ))}
          </div>
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
                // See the courier radios above for why this is not `checked`.
                defaultChecked={method === option}
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

        {/*
          Asked here only when nothing else is asking. With the picker on, its
          city search covers this and these become hidden inputs below.
        */}
        {!usesPicker && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              {...fieldProps('city')}
              autoComplete="address-level2"
              value={city}
              onChange={setCity}
            />
            <Field
              {...fieldProps('postCode')}
              inputMode="numeric"
              autoComplete="postal-code"
              value={postCode}
              onChange={setPostCode}
            />
          </div>
        )}

        {method === 'door' ? (
          <Field {...fieldProps('street')} autoComplete="street-address" />
        ) : usesPicker ? (
          <>
            {/*
              The city as the courier records it, submitted but not asked for:
              the customer chose an office, and its city and post code come from
              the same record, so they cannot contradict each other.
            */}
            <input type="hidden" name="city" value={city} />
            <input type="hidden" name="postCode" value={postCode} />

            {/*
              Keyed on courier and method so switching either mounts a fresh
              picker. Without the key, a Speedy office code would survive a switch
              to Econt and be submitted against the wrong courier's nomenclature.
            */}
            <OfficePicker
              key={`${courier}-${method}`}
              courier={courier}
              kind={method}
              error={errorFor('officeId')}
              demoData={officeDataIsDemo}
              onCityChosen={(chosen) => {
                setCity(chosen.name)
                setPostCode(chosen.postCode)
              }}
            />

            {hiddenLocationError && (
              <p className="text-xs text-red-700">{hiddenLocationError}</p>
            )}
          </>
        ) : (
          <>
            {/*
              Free-text fallback, for a courier whose nomenclature API has no
              credentials yet (Q-22). Worse than a picker, far better than a
              picker populated with invented offices.
            */}
            <Field {...fieldProps('officeId')} />
            <p className="text-xs text-ink-ghost">{t('officeLookupPending')}</p>
          </>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="delivery-note" className="text-xs text-ink-secondary tracking-wide">
            {t('field.note')}
            <span className="ml-1 text-ink-ghost">{t('optional')}</span>
          </label>
          <textarea
            id="delivery-note"
            name="note"
            rows={3}
            defaultValue={restore('note')}
            className={`${inputClass} resize-none`}
          />
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
              defaultChecked={option === (restore('paymentMethod') ?? paymentMethods[0])}
              className="mt-1"
            />
            <span>
              {t(`paymentMethod.${option}`)}
              <span className="block text-xs text-ink-ghost">{t(`paymentHint.${option}`)}</span>
            </span>
          </label>
        ))}
        {/*
          No note about card payment being "not connected yet". The shop takes
          cash on delivery, by decision and not for want of a Stripe key, so
          promising a card option would be advertising something that is not
          coming. `availablePaymentMethods()` still drives this list, so if that
          decision ever changes the option appears on its own.
        */}
      </fieldset>

      {/*
        The priced breakdown, shown only once the server has produced one — and
        only while it still describes the basket in front of the customer.
      */}
      {summary && <OrderSummary summary={summary} locale={locale} />}

      {/*
        The collection point as the courier describes it, not as the form does.
        Worth showing: it is the customer's last chance to notice they picked the
        office two streets from the one they meant.
      */}
      {state.collectionPoint && (
        <p className="rounded-sm border border-border bg-cream-surface p-4 text-xs leading-relaxed text-ink-secondary">
          {t('office.confirmed')}
          <span className="mt-1 block text-charcoal">
            {state.collectionPoint.name}
            {state.collectionPoint.address && `, ${state.collectionPoint.address}`}
          </span>
        </p>
      )}

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
