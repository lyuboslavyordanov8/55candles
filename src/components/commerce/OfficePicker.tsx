'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CourierCity, CourierOffice } from '@/lib/couriers/types'
import type { Courier, DeliveryMethod } from '@/lib/shipping'

/**
 * Courier office / locker picker (AUDIT.md Q-22, Q-25, B-13 step 3).
 *
 * Replaces the free-text "type the office name" field with the courier's real
 * nomenclature. It never talks to the courier directly — merchant credentials
 * are server-side, so it calls `/api/couriers/[courier]/offices`, which is the
 * only reason that route exists.
 *
 * Two steps, in this order, because that is how the courier data is shaped and
 * how a customer thinks: find the settlement, then pick a point in it.
 *
 * ## What it puts in the form
 *
 * `officeId` — the courier's office **code**, which is what goes on the waybill
 * — plus `officeName` and `officeAddress`. The last two are a snapshot, not
 * decoration: offices close, and a bare id resolves to nothing when the label is
 * printed weeks later, so the human-readable version travels with the order.
 * `src/db/schema.ts` has the columns waiting.
 *
 * ## Degrading
 *
 * A picker that silently shows nothing is worse than no picker. Three outcomes
 * are rendered differently on purpose:
 *
 * | outcome           | HTTP | what the customer gets                     |
 * |-------------------|------|--------------------------------------------|
 * | offices found     | 200  | a list                                     |
 * | not connected yet | 503  | the free-text field and an explanation     |
 * | lookup failed     | 502  | the free-text field, and a retry button    |
 *
 * The fallback is the *same input name*, so a courier outage costs the customer
 * some typing rather than the order.
 */

/** Typing pause before a search fires. Long enough not to search per keystroke. */
const DEBOUNCE_MS = 250

/** Matches `MIN_QUERY_LENGTH` in the Econt client; one letter matches the country. */
const MIN_QUERY_LENGTH = 2

type Availability = 'ok' | 'unconfigured' | 'failed'

const inputClass =
  'w-full rounded-sm px-4 py-3 text-sm bg-cream-base border border-border focus:border-clay focus:outline-none transition-colors duration-200 text-charcoal'

interface Props {
  courier: Courier
  /** `office` or `locker`. `door` never renders this component. */
  kind: Extract<DeliveryMethod, 'office' | 'locker'>
  /** Server-side field error for `officeId`, if the submission came back invalid. */
  error?: string
  /**
   * Called when a city is chosen, so the form can fill its own `city` and
   * `postCode` inputs. A post code that disagrees with the city is one of the
   * few things both couriers reject outright, so taking both from the courier's
   * own record removes a whole class of failed labels.
   */
  onCityChosen: (city: CourierCity) => void
  /**
   * Called when an office is chosen, with its id — so the form can react to a
   * price-relevant change (see the auto-requote effect in `DeliveryForm`)
   * without needing to know this component picks it via a `<select>` rather
   * than, say, a text field.
   */
  onOfficeChosen?: (officeId: string) => void
  /** True when the office list comes from the courier's demo environment. */
  demoData?: boolean
}

export default function OfficePicker({
  courier,
  kind,
  error,
  onCityChosen,
  onOfficeChosen,
  demoData = false,
}: Props) {
  const t = useTranslations('checkout')
  const domId = useId()

  const [query, setQuery] = useState('')
  const [cities, setCities] = useState<CourierCity[]>([])
  const [chosenCity, setChosenCity] = useState<CourierCity | null>(null)
  const [offices, setOffices] = useState<CourierOffice[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState('')
  const [availability, setAvailability] = useState<Availability>('ok')
  const [searching, setSearching] = useState(false)
  /** Bumped by the retry button to re-run the effect that last failed. */
  const [attempt, setAttempt] = useState(0)

  /**
   * Aborts the previous request when a new one starts.
   *
   * Without this, a slow response for "со" can land after the fast one for
   * "софия" and overwrite the list with results for a query the customer has
   * already moved past.
   */
  const inFlight = useRef<AbortController | null>(null)

  /**
   * Keeps the chosen office through the checkout form's submission.
   *
   * React clears the form when its action completes, and a *reset* restores each
   * option's `defaultSelected` — which React writes only for an uncontrolled
   * select, at mount. A controlled one like this therefore came back reading
   * "choose an office" while `selectedOfficeId` still held the office and the
   * hidden input below went on submitting it: the customer could no longer see
   * where their parcel was going. Mirroring the choice into `defaultSelected`
   * makes the reset restore it instead of clearing it, without remounting the
   * select and taking the keyboard focus with it.
   */
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    for (const option of selectRef.current?.options ?? []) {
      option.defaultSelected = option.value === selectedOfficeId
    }
  }, [selectedOfficeId, offices])

  async function lookup(path: string): Promise<Response | null> {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller

    try {
      return await fetch(path, { signal: controller.signal })
    } catch {
      // An abort is the expected path when the customer keeps typing, and is not
      // a failure to report. A genuine network error is reported by the caller
      // seeing `null`.
      return controller.signal.aborted ? null : new Response(null, { status: 502 })
    }
  }

  /** Map a response to the availability the UI renders. */
  function availabilityOf(response: Response): Availability {
    if (response.ok) return 'ok'
    return response.status === 503 ? 'unconfigured' : 'failed'
  }

  // --- City search -------------------------------------------------------

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setCities([])
      setSearching(false)
      return
    }

    setSearching(true)

    const timer = setTimeout(async () => {
      const response = await lookup(
        `/api/couriers/${courier}/offices?city=${encodeURIComponent(trimmed)}`
      )

      // Superseded by a newer keystroke; the newer run owns the state.
      if (!response) return

      const state = availabilityOf(response)
      setAvailability(state)
      setSearching(false)

      if (state !== 'ok') {
        setCities([])
        return
      }

      const body = (await response.json()) as { cities?: CourierCity[] }
      setCities(body.cities ?? [])
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, courier, attempt])

  // --- Office list for the chosen city -----------------------------------

  useEffect(() => {
    if (!chosenCity) {
      setOffices([])
      return
    }

    let current = true

    void (async () => {
      const response = await lookup(
        `/api/couriers/${courier}/offices?cityId=${encodeURIComponent(chosenCity.id)}&kind=${kind}`
      )

      if (!response || !current) return

      const state = availabilityOf(response)
      setAvailability(state)

      if (state !== 'ok') {
        setOffices([])
        return
      }

      const body = (await response.json()) as { offices?: CourierOffice[] }
      setOffices(body.offices ?? [])
    })()

    return () => {
      current = false
    }
  }, [chosenCity, courier, kind, attempt])

  function chooseCity(city: CourierCity) {
    setChosenCity(city)
    setCities([])
    setQuery('')
    // Clear any previous choice: an office code from the old city would still be
    // submitted otherwise, addressed to a place the customer is not going.
    setSelectedOfficeId('')
    onCityChosen(city)
  }

  function reset() {
    setChosenCity(null)
    setOffices([])
    setSelectedOfficeId('')
    setQuery('')
  }

  const selected = offices.find((office) => office.id === selectedOfficeId)

  // --- Fallback ----------------------------------------------------------

  /**
   * The free-text field, used when the lookup is unavailable.
   *
   * Same `name` as the picker's hidden input, so the server action and its
   * validation do not need to know which one the customer saw.
   */
  if (availability !== 'ok') {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={`${domId}-manual`} className="text-xs text-ink-secondary tracking-wide">
          {t('field.officeId')}
        </label>
        <input
          id={`${domId}-manual`}
          name="officeId"
          type="text"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${domId}-error` : undefined}
          className={inputClass}
        />
        {error && (
          <p id={`${domId}-error`} className="text-xs text-red-700">
            {error}
          </p>
        )}
        <p className="text-xs text-ink-ghost">
          {availability === 'unconfigured' ? t('officeLookupPending') : t('office.lookupFailed')}
        </p>
        {availability === 'failed' && (
          <button
            type="button"
            onClick={() => {
              setAvailability('ok')
              setAttempt((n) => n + 1)
            }}
            className="self-start text-[11px] font-medium uppercase tracking-wide text-clay border-b border-clay pb-0.5"
          >
            {t('office.retry')}
          </button>
        )}
      </div>
    )
  }

  // --- Picker ------------------------------------------------------------

  return (
    <div className="space-y-4">
      {demoData && (
        <p role="note" className="rounded-sm bg-cream-surface p-3 text-xs text-ink-secondary">
          {t('office.demoData')}
        </p>
      )}

      {chosenCity ? (
        <p className="flex flex-wrap items-baseline gap-2 text-sm text-charcoal">
          <span>
            {chosenCity.name}
            <span className="ml-1 text-ink-ghost">{chosenCity.postCode}</span>
          </span>
          <button
            type="button"
            onClick={reset}
            className="text-[11px] font-medium uppercase tracking-wide text-clay border-b border-clay pb-0.5"
          >
            {t('office.changeCity')}
          </button>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${domId}-city`} className="text-xs text-ink-secondary tracking-wide">
            {t('office.cityLabel')}
          </label>
          <input
            id={`${domId}-city`}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            placeholder={t('office.cityPlaceholder')}
            className={inputClass}
          />

          {/*
            Announced rather than merely rendered: a customer using a screen
            reader gets no signal from a list appearing below the input.
          */}
          <p aria-live="polite" className="text-xs text-ink-ghost">
            {searching
              ? t('office.searching')
              : query.trim().length >= MIN_QUERY_LENGTH && cities.length === 0
                ? t('office.noCities')
                : cities.length > 0
                  ? t('office.cityResults', { count: cities.length })
                  : ''}
          </p>

          {cities.length > 0 && (
            <ul className="divide-y divide-border rounded-sm border border-border">
              {cities.map((city) => (
                <li key={city.id}>
                  {/*
                    A button, not a fabricated ARIA combobox. Choosing a city is
                    one activation of one control, which is exactly what a button
                    is, and it is keyboard-operable without any roving-tabindex
                    machinery to get wrong.
                  */}
                  <button
                    type="button"
                    onClick={() => chooseCity(city)}
                    className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left text-sm text-charcoal hover:bg-cream-surface transition-colors duration-150"
                  >
                    <span>{city.name}</span>
                    <span className="text-xs text-ink-ghost">{city.postCode}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {chosenCity && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${domId}-office`} className="text-xs text-ink-secondary tracking-wide">
            {t(`office.label.${kind}`)}
          </label>

          {offices.length === 0 ? (
            // Not an error: plenty of Bulgarian settlements have an office but no
            // locker. Saying so, and why, beats an empty dropdown.
            <p className="text-xs text-ink-secondary">
              {t(`office.none.${kind}`, { city: chosenCity.name })}
            </p>
          ) : (
            <>
              {/*
                A native select: keyboard- and screen-reader-correct with no ARIA,
                and on a phone it opens the platform picker, which beats anything
                hand-rolled. Sofia has around sixty offices, well within what a
                select handles.
              */}
              <select
                id={`${domId}-office`}
                ref={selectRef}
                value={selectedOfficeId}
                onChange={(event) => {
                  setSelectedOfficeId(event.target.value)
                  onOfficeChosen?.(event.target.value)
                }}
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${domId}-error` : undefined}
                className={inputClass}
              >
                <option value="">{t('office.choose')}</option>
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                    {office.address ? ` — ${office.address}` : ''}
                  </option>
                ))}
              </select>

              {selected?.hours && (
                <p className="text-xs text-ink-ghost">
                  {t('office.hours', { hours: selected.hours })}
                </p>
              )}
            </>
          )}

          {error && (
            <p id={`${domId}-error`} className="text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      {/*
        The snapshot. Empty until an office is chosen, which keeps the server's
        `officeId: 'required'` check as the single source of truth about whether
        the customer actually picked one.
      */}
      <input type="hidden" name="officeId" value={selected?.id ?? ''} />
      <input type="hidden" name="officeName" value={selected?.name ?? ''} />
      <input type="hidden" name="officeAddress" value={selected?.address ?? ''} />
    </div>
  )
}
