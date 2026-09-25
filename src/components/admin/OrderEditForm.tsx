'use client'

import { useActionState, useState } from 'react'
import { NextIntlClientProvider, useTranslations, type AbstractIntlMessages } from 'next-intl'

import { editOrder, type OrderEditState } from '@/app/admin/actions'
import type { DeliveryDetails } from '@/lib/delivery-schema'
import {
  BOOKABLE_COURIERS,
  COURIER_LABELS,
  DELIVERY_METHODS,
  type Courier,
  type DeliveryMethod,
} from '@/lib/shipping'
import OfficePicker from '@/components/commerce/OfficePicker'
import { button, fieldLabel, input, Notice, select, textarea } from './ui'

/**
 * Correcting the customer's name, phone, email or delivery point from the order
 * page — for the customer who rang to say they would rather collect from an
 * office, or who typed their own phone wrong.
 *
 * The office is chosen with the checkout's own `OfficePicker`, so an admin picks
 * from the courier's real list exactly as the customer did. The picker speaks
 * next-intl and the admin has no provider (it lives outside `[locale]`), so this
 * component brings its own, with just the checkout's Bulgarian messages.
 *
 * Every text field is controlled: a form action resets uncontrolled inputs when
 * it returns, and a rejected phone should not cost the admin the rest of what
 * they typed.
 */

const METHOD_LABELS: Record<DeliveryMethod, string> = {
  door: 'до адрес',
  office: 'до офис',
  locker: 'до автомат',
}

interface Props {
  orderId: string
  current: DeliveryDetails
  /** `{ checkout: … }` from `messages/bg.json`, for the picker and the error texts. */
  messages: AbstractIntlMessages
}

export default function OrderEditForm(props: Props) {
  return (
    <NextIntlClientProvider locale="bg" timeZone="Europe/Sofia" messages={props.messages}>
      <EditForm {...props} />
    </NextIntlClientProvider>
  )
}

function EditForm({ orderId, current }: Props) {
  const t = useTranslations('checkout')
  const [state, submit, pending] = useActionState<OrderEditState, FormData>(editOrder, {
    status: 'idle',
  })

  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({
    recipientName: current.recipientName,
    phone: current.phone,
    email: current.email,
    street: current.street,
    note: current.note,
    city: current.city,
    postCode: current.postCode,
  })
  const [courier, setCourier] = useState<Courier>(
    BOOKABLE_COURIERS.includes(current.courier) ? current.courier : BOOKABLE_COURIERS[0]
  )
  const [method, setMethod] = useState<DeliveryMethod>(current.method)
  const [changingOffice, setChangingOffice] = useState(false)

  // The same courier and kind of point as before, and nobody asked to change
  // it: the stored office goes back unchanged. Anything else needs a new one.
  const keepsOffice =
    method !== 'door' &&
    !changingOffice &&
    courier === current.courier &&
    method === current.method &&
    Boolean(current.officeId)

  const errors = state.status === 'invalid' ? (state.errors ?? {}) : {}
  const errorFor = (field: keyof DeliveryDetails) => {
    const code = errors[field]
    return code ? t(`error.${field}.${code}`) : undefined
  }

  const set = (field: keyof typeof values) => (value: string) =>
    setValues((previous) => ({ ...previous, [field]: value }))

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={button('secondary')}>
        Редактирай клиента и доставката
      </button>
    )
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />

      {state.status === 'unchanged' && <Notice>Нищо не е променено.</Notice>}
      {state.status === 'blocked' && (
        <Notice>
          Поръчката вече не може да се редактира — междувременно е получила товарителница или е
          сменила статуса си. Презареди страницата.
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          name="recipientName"
          label="Име"
          value={values.recipientName}
          onChange={set('recipientName')}
          error={errorFor('recipientName')}
        />
        <TextField
          name="phone"
          label="Телефон"
          value={values.phone}
          onChange={set('phone')}
          error={errorFor('phone')}
          inputMode="tel"
        />
        <TextField
          name="email"
          label="Имейл (по желание)"
          value={values.email}
          onChange={set('email')}
          error={errorFor('email')}
          inputMode="email"
        />
        <label className="block">
          <span className={fieldLabel}>Куриер</span>
          <select
            name="courier"
            value={courier}
            onChange={(event) => setCourier(event.target.value as Courier)}
            className={select}
          >
            {BOOKABLE_COURIERS.map((option) => (
              <option key={option} value={option}>
                {COURIER_LABELS[option]}
              </option>
            ))}
          </select>
          <FieldError text={errorFor('courier')} />
        </label>
      </div>

      <fieldset>
        <legend className={fieldLabel}>Доставка</legend>
        <div className="flex flex-wrap gap-4 text-xs text-ink-primary">
          {DELIVERY_METHODS.map((option) => (
            <label key={option} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="method"
                value={option}
                checked={method === option}
                onChange={() => setMethod(option)}
              />
              {METHOD_LABELS[option]}
            </label>
          ))}
        </div>
        <FieldError text={errorFor('method')} />
      </fieldset>

      {method === 'door' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            name="city"
            label="Град"
            value={values.city}
            onChange={set('city')}
            error={errorFor('city')}
          />
          <TextField
            name="postCode"
            label="Пощенски код"
            value={values.postCode}
            onChange={set('postCode')}
            error={errorFor('postCode')}
            inputMode="numeric"
          />
          <TextField
            name="street"
            label="Адрес"
            value={values.street}
            onChange={set('street')}
            error={errorFor('street')}
          />
        </div>
      ) : keepsOffice ? (
        <div className="space-y-1.5 text-xs text-ink-secondary">
          <input type="hidden" name="officeId" value={current.officeId} />
          <input type="hidden" name="officeName" value={current.officeName} />
          <input type="hidden" name="officeAddress" value={current.officeAddress} />
          <input type="hidden" name="city" value={current.city} />
          <input type="hidden" name="postCode" value={current.postCode} />
          <p>
            {current.officeName || `офис ${current.officeId}`}
            {current.officeAddress ? `, ${current.officeAddress}` : ''}
            <span className="block text-ink-ghost">
              код {current.officeId} · {current.postCode} {current.city}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setChangingOffice(true)}
            className={button('secondary', 'sm')}
          >
            Смени офиса
          </button>
          <FieldError text={errorFor('officeId')} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <input type="hidden" name="city" value={values.city} />
          <input type="hidden" name="postCode" value={values.postCode} />
          {/*
            Keyed like the checkout's: a new courier or kind of point mounts a
            fresh picker, so an office code from one courier's list can never be
            submitted against the other's.
          */}
          <OfficePicker
            key={`${courier}-${method}`}
            courier={courier}
            kind={method}
            error={errorFor('officeId')}
            onCityChosen={(chosen) =>
              setValues((previous) => ({
                ...previous,
                city: chosen.name,
                postCode: chosen.postCode,
              }))
            }
          />
          <FieldError text={errorFor('city') ?? errorFor('postCode')} />
        </div>
      )}

      <label className="block">
        <span className={fieldLabel}>Бележка към куриера</span>
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          value={values.note}
          onChange={(event) => set('note')(event.target.value)}
          className={textarea}
        />
        <FieldError text={errorFor('note')} />
      </label>

      <p className="text-xs text-ink-ghost">
        Сумата не се преизчислява: доставката и наложеният платеж остават същите, каквито клиентът е
        приел при поръчката.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={button('primary')}>
          {pending ? 'Записва се…' : 'Запази промените'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={button('ghost')}>
          Откажи
        </button>
      </div>
    </form>
  )
}

function TextField({
  name,
  label,
  value,
  onChange,
  error,
  inputMode,
}: {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  inputMode?: 'tel' | 'email' | 'numeric'
}) {
  return (
    <label className="block">
      <span className={fieldLabel}>{label}</span>
      <input
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        maxLength={200}
        className={`${input} ${error ? 'border-red-400' : ''}`}
      />
      <FieldError text={error} />
    </label>
  )
}

function FieldError({ text }: { text?: string }) {
  return text ? <span className="mt-1 block text-xs text-red-700">{text}</span> : null
}
