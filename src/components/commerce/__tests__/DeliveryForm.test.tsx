import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import { PHONE_EXAMPLE } from '@/lib/phone'
import { submitCheckout } from '@/app/[locale]/checkout/actions'
import DeliveryForm from '../DeliveryForm'

// The action is a server function; the form's own behaviour is what's under
// test here, so it is stubbed. `actions.test.ts` covers the real one.
vi.mock('@/app/[locale]/checkout/actions', () => ({
  submitCheckout: vi.fn(async () => ({ status: 'idle' as const })),
}))

function renderForm(props: Partial<Parameters<typeof DeliveryForm>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeliveryForm
        cart={[{ slug: 'cherry', quantity: 1 }]}
        // Stands in for the token the page mints per render; the form only
        // forwards it, so any stable string exercises the same path.
        intentToken="intent-under-test"
        shippingConfigured={false}
        locale="en"
        {...props}
      />
    </NextIntlClientProvider>
  )
}

/**
 * The form's one submit button, whatever it currently says.
 *
 * Its label is a state, not a name: "Calculate the final price" before there is
 * a price, "Confirm the order" once the customer has seen the bill, "Order
 * placed" afterwards. Matching on the words would tie every test that merely
 * needs to press the button to whichever step it happens to be on — and, worse,
 * a test could go green against a button that says something else entirely.
 */
function submitButton(): HTMLButtonElement {
  const buttons = document.querySelectorAll('form button[type="submit"]')

  // Exactly one, asserted rather than assumed: a second submit button would make
  // "press the button" ambiguous, and picking the first silently would hide it.
  if (buttons.length !== 1 || !(buttons[0] instanceof HTMLButtonElement)) {
    throw new Error(`expected one submit button in the form, found ${buttons.length}`)
  }

  return buttons[0]
}

/** The form itself, for assertions about the payload rather than the page. */
function checkoutForm(): HTMLFormElement {
  const form = submitButton().closest('form')

  if (!form) throw new Error('the submit button is not inside a form')

  return form
}

describe('DeliveryForm', () => {
  it('asks for the recipient and a mobile number the courier can reach', () => {
    renderForm()

    expect(screen.getByLabelText(/full name/i)).toBeRequired()
    expect(screen.getByLabelText(/mobile number/i)).toBeRequired()
  })

  describe('the phone number, which the courier notifies by SMS', () => {
    // The rules live in `phone.ts` and are tested there. What matters here is
    // that the customer hears about a bad number while they are still looking at
    // the field, rather than after the server has priced the order.

    it('shows an example of the format it wants', () => {
      // From `phone.ts`, not the message catalogues: the same nine digits in
      // either language, so translating it only bought a key to forget.
      renderForm()

      expect(screen.getByLabelText(/mobile number/i)).toHaveAttribute(
        'placeholder',
        PHONE_EXAMPLE
      )
    })

    it('says why a landline will not do, as soon as the field is left', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByLabelText(/mobile number/i), '02 123 4567')
      await user.tab()

      expect(screen.getByText(/notifies you by SMS/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/mobile number/i)).toHaveAttribute('aria-invalid', 'true')
    })

    it('points out a number that is a digit short', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByLabelText(/mobile number/i), '0887 115 95')
      await user.tab()

      expect(screen.getByText(/nine digits after the zero/i)).toBeInTheDocument()
    })

    it('says nothing about a number it can dial', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByLabelText(/mobile number/i), '+359 887 115 957')
      await user.tab()

      expect(screen.getByLabelText(/mobile number/i)).not.toHaveAttribute('aria-invalid')
    })

    it('does not scold an untouched field on the way past', async () => {
      // Tabbing through the form before filling it in is not a mistake yet, and
      // the `required` attribute already covers an empty submission.
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getByLabelText(/mobile number/i))
      await user.tab()

      expect(screen.getByLabelText(/mobile number/i)).not.toHaveAttribute('aria-invalid')
    })

    it('takes the message away while the number is being corrected', async () => {
      // Leaving it up would mean showing a complaint about a value that is no
      // longer in the box.
      const user = userEvent.setup()
      renderForm()

      const field = screen.getByLabelText(/mobile number/i)
      await user.type(field, '0887 115 95')
      await user.tab()
      expect(screen.getByText(/nine digits after the zero/i)).toBeInTheDocument()

      await user.type(field, '7')

      expect(screen.queryByText(/nine digits after the zero/i)).not.toBeInTheDocument()
    })
  })

  describe('what a rejected submission does to the details already typed', () => {
    /**
     * React clears an uncontrolled form once its action completes. The real
     * action guards against that by echoing the submitted values back — see
     * `values` in `actions.ts` — and this stands in for it, deriving the echo
     * from the FormData exactly as the real one does.
     */
    function echoingAction(fieldErrors: Record<string, string>) {
      return async (_previous: unknown, data: FormData) => ({
        status: 'invalid' as const,
        messageKey: 'fixTheFields',
        fieldErrors,
        values: Object.fromEntries(
          ['recipientName', 'phone', 'email', 'street', 'officeId', 'note']
            .map((field) => [field, String(data.get(field) ?? '')])
            .filter(([, submitted]) => submitted)
        ),
      })
    }

    /** Everything a valid office order needs, so the submit is not blocked. */
    async function fillIn(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText(/full name/i), 'Мария Иванова')
      await user.type(screen.getByLabelText(/mobile number/i), '0887115957')
      await user.type(screen.getByLabelText(/email address/i), 'maria@example.com')
      await user.type(screen.getByLabelText(/^city$/i), 'София')
      await user.type(screen.getByLabelText(/post code/i), '1000')
      await user.type(screen.getByLabelText(/office or locker/i), 'ECONT-1234')
      await user.type(screen.getByLabelText(/note for the courier/i), 'Обадете се преди доставка')
    }

    const valueOf = (label: RegExp) =>
      (screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement).value

    it('keeps the fields that were right when one of them is wrong', async () => {
      // The bug this exists for: submitting with one field missing wiped the
      // name, phone, email and note too, so the customer had to retype all of it
      // to find out whether the one mistake was now fixed.
      const user = userEvent.setup()
      vi.mocked(submitCheckout).mockImplementationOnce(
        echoingAction({ officeId: 'required' }) as typeof submitCheckout
      )
      renderForm()
      await fillIn(user)

      await user.click(submitButton())

      // Gated on the rejection message, so the assertions below cannot run
      // against a render that has not received the action's state yet. The
      // generous timeout is for the full-suite run, where jsdom is contended.
      expect(await screen.findByRole('alert', {}, { timeout: 5_000 })).toBeInTheDocument()
      expect(valueOf(/full name/i)).toBe('Мария Иванова')
      expect(valueOf(/email address/i)).toBe('maria@example.com')
      expect(valueOf(/note for the courier/i)).toBe('Обадете се преди доставка')
      expect(valueOf(/office or locker/i)).toBe('ECONT-1234')
    })

    it('keeps the city and post code, which the picker may have filled in', async () => {
      const user = userEvent.setup()
      vi.mocked(submitCheckout).mockImplementationOnce(
        echoingAction({ officeId: 'required' }) as typeof submitCheckout
      )
      renderForm()
      await fillIn(user)

      await user.click(submitButton())
      await screen.findByRole('alert', {}, { timeout: 5_000 })

      expect(valueOf(/^city$/i)).toBe('София')
      expect(valueOf(/post code/i)).toBe('1000')
    })

    it('keeps the phone number, in the form the courier will be given', async () => {
      // Echoed back canonicalised rather than as typed, so what the customer
      // confirms is the same string that goes on the waybill.
      const user = userEvent.setup()
      vi.mocked(submitCheckout).mockImplementationOnce(async (_previous, data) => ({
        status: 'invalid' as const,
        messageKey: 'fixTheFields',
        fieldErrors: { officeId: 'required' },
        values: { phone: `+359${String(data.get('phone')).replace(/\D/g, '').slice(1)}` },
      }))
      renderForm()
      await fillIn(user)

      await user.click(submitButton())
      await screen.findByRole('alert', {}, { timeout: 5_000 })

      expect(valueOf(/mobile number/i)).toBe('+359887115957')
    })

    it('keeps the delivery method and courier that were chosen', async () => {
      const user = userEvent.setup()
      vi.mocked(submitCheckout).mockImplementationOnce(
        echoingAction({ street: 'required' }) as typeof submitCheckout
      )
      renderForm()
      await user.click(screen.getByRole('radio', { name: /to my address/i }))
      await user.type(screen.getByLabelText(/full name/i), 'Мария Иванова')
      await user.type(screen.getByLabelText(/mobile number/i), '0887115957')
      await user.type(screen.getByLabelText(/^city$/i), 'София')
      await user.type(screen.getByLabelText(/post code/i), '1000')
      await user.type(screen.getByLabelText(/street/i), 'ул. Цар Самуил 3')

      await user.click(submitButton())
      await screen.findByRole('alert', {}, { timeout: 5_000 })

      // Losing the courier on the way back would send the parcel through a
      // different contract than the one the price was quoted against. Econt is
      // the only bookable courier today, so this asserts the value survives
      // rather than that it changed — the state it lives in is the same either
      // way, and a second courier is expected (see `BOOKABLE_COURIERS`).
      expect(screen.getByRole('radio', { name: 'Econt' })).toBeChecked()
      expect(screen.getByRole('radio', { name: /to my address/i })).toBeChecked()
      expect(valueOf(/street/i)).toBe('ул. Цар Самуил 3')
    })

    it('names the courier when the server refuses the one submitted', async () => {
      // The radio for an unbookable courier is disabled, so this arrives only
      // from a stale page or a hand-built POST — and the group-level alert
      // names no field, which would leave nothing marked as wrong.
      const user = userEvent.setup()
      vi.mocked(submitCheckout).mockImplementationOnce(
        echoingAction({ courier: 'unavailable' }) as typeof submitCheckout
      )
      renderForm()
      await fillIn(user)

      await user.click(submitButton())
      await screen.findByRole('alert', {}, { timeout: 5_000 })

      expect(screen.getByText(/for now we ship with Econt/i)).toBeInTheDocument()
    })

    it('leaves a field the customer never filled in empty', async () => {
      // The echo drops blanks, so an absent value must not become the string
      // `undefined` in the box.
      const user = userEvent.setup()
      vi.mocked(submitCheckout).mockImplementationOnce(
        echoingAction({ officeId: 'required' }) as typeof submitCheckout
      )
      renderForm()
      await user.type(screen.getByLabelText(/full name/i), 'Мария Иванова')
      await user.type(screen.getByLabelText(/mobile number/i), '0887115957')
      await user.type(screen.getByLabelText(/^city$/i), 'София')
      await user.type(screen.getByLabelText(/post code/i), '1000')
      await user.type(screen.getByLabelText(/office or locker/i), 'ECONT-1234')

      await user.click(submitButton())
      await screen.findByRole('alert', {}, { timeout: 5_000 })

      expect(valueOf(/email address/i)).toBe('')
      expect(valueOf(/note for the courier/i)).toBe('')
    })
  })

  it('leaves email optional, since a COD customer may not have one', () => {
    renderForm()

    expect(screen.getByLabelText(/email address/i)).not.toBeRequired()
  })

  it('starts on the courier it can actually book, and offers all three delivery methods', () => {
    renderForm()

    expect(screen.getByRole('radio', { name: 'Econt' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Econt' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /to my address/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /courier office/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /parcel locker/i })).toBeInTheDocument()
  })

  it('shows Speedy as coming soon rather than as a choice or an absence', async () => {
    // Speedy has no contract and no credentials yet, so a parcel chosen for it
    // could not be labelled — but it was announced, and removing it outright
    // would read as "never". Disabled keeps it out of the tab order and out of
    // the submitted data; `delivery-schema.ts` refuses it server-side too.
    const user = userEvent.setup()
    renderForm()

    const speedy = screen.getByRole('radio', { name: /speedy/i })
    expect(speedy).toBeDisabled()
    expect(speedy).not.toBeChecked()
    expect(speedy).toHaveAccessibleName(/coming soon/i)

    await user.click(speedy)

    expect(screen.getByRole('radio', { name: 'Econt' })).toBeChecked()
  })

  it('labels each courier with its own logo, named for a screen reader', () => {
    // The mark replaces the name rather than sitting beside it, so an empty
    // `alt` would leave the radio with no accessible name at all.
    renderForm()

    expect(screen.getByRole('img', { name: 'Econt' })).toHaveAttribute(
      'src',
      '/images/couriers/econt-blue-en.svg'
    )
    expect(screen.getByRole('img', { name: 'Speedy' })).toHaveAttribute(
      'src',
      '/images/couriers/speedy.webp'
    )
  })

  it('uses the Cyrillic Econt wordmark on the Bulgarian page', () => {
    // Econt publishes ЕКОНТ and ECONT separately; the Latin mark on a Bulgarian
    // page reads as a different company.
    renderForm({ locale: 'bg' })

    expect(screen.getByRole('img', { name: 'Econt' })).toHaveAttribute(
      'src',
      '/images/couriers/econt-blue-bg.svg'
    )
  })

  describe('the method decides which location field is shown', () => {
    it('shows an office field by default, not a street', () => {
      renderForm()

      expect(screen.getByLabelText(/office or locker/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/street/i)).not.toBeInTheDocument()
    })

    it('swaps to a street field for door delivery', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getByRole('radio', { name: /to my address/i }))

      expect(screen.getByLabelText(/street/i)).toBeInTheDocument()
      // Asking for both would block every order.
      expect(screen.queryByLabelText(/office or locker/i)).not.toBeInTheDocument()
    })

    it('keeps typed details when the method changes', async () => {
      // `Field` is defined at module scope for exactly this reason: a
      // nested component would remount and wipe the inputs on every switch.
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByLabelText(/full name/i), 'Мария Иванова')
      await user.type(screen.getByLabelText(/city/i), 'София')
      await user.click(screen.getByRole('radio', { name: /to my address/i }))

      expect(screen.getByLabelText(/full name/i)).toHaveValue('Мария Иванова')
      expect(screen.getByLabelText(/city/i)).toHaveValue('София')
    })
  })

  describe('how it presents payment', () => {
    it('states cash on delivery rather than asking the customer to choose it', () => {
      renderForm()

      expect(screen.getByRole('heading', { name: /payment/i })).toBeInTheDocument()
      expect(screen.getByText(/cash on delivery/i)).toBeInTheDocument()
      expect(screen.getByText(/pay the courier/i)).toBeInTheDocument()
    })

    it('offers no payment choice at all, and mentions no card option', () => {
      // One method, so a radio group would be a question with one answer — and
      // naming cards, even to say they are unavailable, would advertise something
      // that is not coming.
      renderForm()

      expect(screen.queryByRole('radio', { name: /cash on delivery/i })).not.toBeInTheDocument()
      expect(screen.queryByText(/card/i)).not.toBeInTheDocument()
    })

    it('sends no payment method in the payload, so the server decides', () => {
      renderForm()

      expect(checkoutForm().querySelector('[name="paymentMethod"]')).toBeNull()
    })
  })

  it('warns that delivery prices are unset rather than implying free shipping', () => {
    renderForm({ shippingConfigured: false })

    expect(screen.getByRole('note')).toHaveTextContent(/delivery prices are not set yet/i)
  })

  it('drops the warning once a rate card exists', () => {
    renderForm({ shippingConfigured: true })

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('carries the cart in the payload so the server can re-price it', () => {
    const { container } = renderForm({ cart: [{ slug: 'cherry', quantity: 2 }] })
    const hidden = container.querySelector('input[name="cart"]')

    expect(JSON.parse(hidden!.getAttribute('value')!)).toEqual([
      { slug: 'cherry', quantity: 2 },
    ])
  })

  it('shows no order breakdown before the server has priced anything', () => {
    // The breakdown itself is covered in `OrderSummary.test.tsx`; what matters
    // here is that it does not appear until the server has produced one.
    renderForm()

    expect(screen.queryByRole('heading', { name: /order summary/i })).not.toBeInTheDocument()
  })

  it('tells the customer the office list is not connected yet', () => {
    // Better than a picker populated with invented offices, which produces a
    // parcel addressed somewhere that does not exist.
    renderForm()

    expect(screen.getByText(/searchable list will appear/i)).toBeInTheDocument()
  })

  describe('the office picker, where a courier can be searched', () => {
    // The picker's own behaviour is `OfficePicker.test.tsx`. What matters here is
    // which couriers get one, and that it and the form agree about the address.
    const SOFIA = { id: '41', name: 'София', postCode: '1000' }

    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (path: string) =>
          new Response(
            JSON.stringify(
              path.includes('city=') ? { cities: [SOFIA] } : { offices: [] }
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      )
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('replaces the free-text field with a search for a courier that has one', () => {
      renderForm({ officeLookup: ['econt'] })

      expect(screen.getByLabelText(/city or post code/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/office or locker/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/searchable list will appear/i)).not.toBeInTheDocument()
    })

    it('keeps the free-text field for a courier that has none', async () => {
      // A lookup belongs to one courier, not to the checkout: Speedy's office
      // list being searchable says nothing about Econt's, which is the courier
      // the order is actually going out with.
      renderForm({ officeLookup: ['speedy'] })

      expect(screen.getByLabelText(/office or locker/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/city or post code/i)).not.toBeInTheDocument()
    })

    it('leaves the picker in place for door delivery, which needs a street', async () => {
      const user = userEvent.setup()
      renderForm({ officeLookup: ['econt'] })

      await user.click(screen.getByRole('radio', { name: /to my address/i }))

      expect(screen.getByLabelText(/street/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/city or post code/i)).not.toBeInTheDocument()
    })

    it('asks for the city once, not twice', async () => {
      // The picker's first step is a city search, so showing the form's own City
      // and Post code fields as well asked the same question twice — and let the
      // customer type a city that disagreed with the office they then chose.
      renderForm({ officeLookup: ['econt'] })

      expect(screen.getByLabelText(/city or post code/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/^city$/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^post code$/i)).not.toBeInTheDocument()
    })

    it('asks for the city itself when there is no picker to do it', async () => {
      // Door delivery needs an address the courier drives to, and the free-text
      // fallback has no city search of its own.
      const user = userEvent.setup()
      renderForm({ officeLookup: ['econt'] })

      await user.click(screen.getByRole('radio', { name: /to my address/i }))

      expect(screen.getByLabelText(/^city$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^post code$/i)).toBeInTheDocument()
    })

    it('submits the city and post code from the courier record', async () => {
      // A post code that disagrees with the city is one of the few things both
      // couriers reject outright, so both are taken from the courier's own entry
      // and travel as hidden inputs.
      const user = userEvent.setup()
      const { container } = renderForm({ officeLookup: ['econt'] })

      await user.type(screen.getByLabelText(/city or post code/i), 'Соф')
      await user.click(await screen.findByRole('button', { name: /София/ }))

      expect(container.querySelector('input[name="city"]')).toHaveValue('София')
      expect(container.querySelector('input[name="postCode"]')).toHaveValue('1000')
    })

    it('carries the chosen city over to the address fields for door delivery', async () => {
      // Switching to door after picking a city should not make the customer type
      // it again.
      const user = userEvent.setup()
      renderForm({ officeLookup: ['econt'] })

      await user.type(screen.getByLabelText(/city or post code/i), 'Соф')
      await user.click(await screen.findByRole('button', { name: /София/ }))
      await user.click(screen.getByRole('radio', { name: /to my address/i }))

      expect(screen.getByLabelText(/^city$/i)).toHaveValue('София')
      expect(screen.getByLabelText(/^post code$/i)).toHaveValue('1000')
    })

    it('starts a fresh picker when the delivery point changes', async () => {
      // The picker is keyed on courier *and* method, so a chosen office cannot
      // survive into a list it does not belong to: an office code submitted for
      // a locker — or, once Speedy is bookable, an Econt code submitted against
      // Speedy's nomenclature — is a parcel addressed nowhere.
      const user = userEvent.setup()
      renderForm({ officeLookup: ['econt'] })

      await user.type(screen.getByLabelText(/city or post code/i), 'Соф')
      await user.click(await screen.findByRole('button', { name: /София/ }))
      expect(screen.getByRole('button', { name: /change city/i })).toBeInTheDocument()

      await user.click(screen.getByRole('radio', { name: /parcel locker/i }))

      expect(screen.getByLabelText(/city or post code/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /change city/i })).not.toBeInTheDocument()
    })

    it('keeps the chosen city and office when the submission comes back rejected', async () => {
      // The reset that clears the text fields hits the picker too, and its city
      // and office live in React state. If the DOM came back to "search for a
      // city" while the state still held the office, the hidden `officeId` would
      // keep submitting a choice the customer could no longer see.
      const user = userEvent.setup()
      const office = {
        id: 'ECONT-1234',
        courier: 'econt',
        kind: 'office',
        name: 'София Гладстон',
        address: 'ул. Цар Самуил №3',
        cityId: '41',
        cityName: 'София',
        postCode: '1000',
      }
      vi.stubGlobal(
        'fetch',
        vi.fn(async (path: string) =>
          new Response(
            JSON.stringify(path.includes('city=') ? { cities: [SOFIA] } : { offices: [office] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      )
      vi.mocked(submitCheckout).mockImplementationOnce(async () => ({
        status: 'invalid' as const,
        messageKey: 'fixTheFields',
        fieldErrors: { recipientName: 'tooShort' },
      }))
      const { container } = renderForm({ officeLookup: ['econt'] })

      await user.type(screen.getByLabelText(/city or post code/i), 'Соф')
      await user.click(await screen.findByRole('button', { name: /София/ }))
      await user.selectOptions(await screen.findByRole('combobox'), office.id)
      await user.type(screen.getByLabelText(/full name/i), 'Мария Иванова')
      await user.type(screen.getByLabelText(/mobile number/i), '0887115957')

      await user.click(submitButton())
      await screen.findByRole('alert', {}, { timeout: 5_000 })

      expect(screen.getByRole('button', { name: /change city/i })).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toHaveValue(office.id)
      expect(container.querySelector('input[name="officeId"]')).toHaveValue(office.id)
      expect(container.querySelector('input[name="city"]')).toHaveValue('София')
      expect(container.querySelector('input[name="postCode"]')).toHaveValue('1000')
    })

    it('passes the demo-data warning down to the picker', () => {
      renderForm({ officeLookup: ['econt'], officeDataIsDemo: true, shippingConfigured: true })

      expect(screen.getByRole('note')).toHaveTextContent(/test system/i)
    })
  })

  describe('once the order is stored', () => {
    /** Enough to get past the browser's own required-field check. */
    async function fillIn(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText(/full name/i), 'Мария Иванова')
      await user.type(screen.getByLabelText(/mobile number/i), '0887115957')
      await user.type(screen.getByLabelText(/^city$/i), 'София')
      await user.type(screen.getByLabelText(/post code/i), '1000')
      await user.type(screen.getByLabelText(/office or locker/i), 'ECONT-1234')
    }

    function placedAction() {
      return vi.mocked(submitCheckout).mockImplementationOnce(async () => ({
        status: 'placed' as const,
        order: { number: '55C-2026-000123' },
        messageKey: 'orderPlacedCod',
      }))
    }

    it('shows the order number, which is the only record the customer gets', async () => {
      // No confirmation email (B-17) and no confirmation page yet, so this is it.
      const user = userEvent.setup()
      placedAction()
      renderForm()
      await fillIn(user)

      await user.click(submitButton())

      expect(await screen.findByText('55C-2026-000123', {}, { timeout: 5_000 })).toBeInTheDocument()
      expect(screen.getByText(/order received/i)).toBeInTheDocument()
    })

    it('announces it as news rather than as an error', async () => {
      const user = userEvent.setup()
      placedAction()
      renderForm()
      await fillIn(user)

      await user.click(submitButton())
      await screen.findByText('55C-2026-000123', {}, { timeout: 5_000 })

      // A stored order read out as an `alert` would sound like a failure.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText(/pay the courier on delivery/i)).toBeInTheDocument()
    })

    it('stops offering to submit, since this form can no longer change the order', async () => {
      // Pressing again replays the same intent token and returns the same order,
      // so an edited address would go nowhere while looking accepted.
      const user = userEvent.setup()
      placedAction()
      renderForm()
      await fillIn(user)

      await user.click(submitButton())
      await screen.findByText('55C-2026-000123', {}, { timeout: 5_000 })

      expect(screen.getByRole('button', { name: /order placed/i })).toBeDisabled()
    })

    it('submits the intent token the page minted, unchanged', async () => {
      const user = userEvent.setup()
      let submitted: string | null = null
      vi.mocked(submitCheckout).mockImplementationOnce(async (_previous, data) => {
        submitted = String(data.get('intentToken'))
        return { status: 'placed' as const, order: { number: '55C-2026-000123' } }
      })
      const { container } = renderForm({ intentToken: 'minted-by-the-page' })
      await fillIn(user)

      expect(container.querySelector('input[name="intentToken"]')).toHaveValue(
        'minted-by-the-page'
      )

      await user.click(submitButton())
      await screen.findByText('55C-2026-000123', {}, { timeout: 5_000 })

      expect(submitted).toBe('minted-by-the-page')
    })
  })
})

describe('DeliveryForm, pricing before ordering', () => {
  /**
   * Everything a valid office order needs. Its own copy rather than the one in
   * the block above, which is scoped to those tests.
   */
  async function fillIn(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/full name/i), 'Мария Иванова')
    await user.type(screen.getByLabelText(/mobile number/i), '0887115957')
    await user.type(screen.getByLabelText(/email address/i), 'maria@example.com')
    await user.type(screen.getByLabelText(/^city$/i), 'София')
    await user.type(screen.getByLabelText(/post code/i), '1000')
    await user.type(screen.getByLabelText(/office or locker/i), 'ECONT-1234')
  }

  const QUOTE = {
    lines: [{ slug: 'cherry', quantity: 1, unitPriceMinor: 1999, lineTotalMinor: 1999 }],
    goodsMinor: 1999,
    discountMinor: null,
    promoCode: null,
    shippingMinor: 499,
    freeShipping: false,
    codFeeMinor: null,
    totalMinor: 2498,
    weightGrams: 400,
  }

  /**
   * The values the real action echoes back, derived from the submission exactly
   * as it does. Needed by any test that presses twice: React resets an
   * uncontrolled field when an action completes, so without the echo the second
   * press meets an empty `required` name and the browser never submits it.
   */
  function valuesFrom(data: FormData) {
    return Object.fromEntries(
      ['recipientName', 'phone', 'email', 'street', 'officeId', 'note']
        .map((field) => [field, String(data.get(field) ?? '')])
        .filter(([, submitted]) => submitted)
    )
  }

  /** The server's answer to the pricing press. */
  function quotingAction(summary: Partial<typeof QUOTE> = {}) {
    return vi.mocked(submitCheckout).mockImplementationOnce(async () => ({
      status: 'quoted' as const,
      summary: { ...QUOTE, ...summary },
      messageKey: 'reviewBeforeConfirming',
    }))
  }

  it('asks to be pressed for a price before it offers to place the order', () => {
    // The whole complaint this answers: the customer could not see what delivery
    // cost until the press that had already ordered the candles.
    renderForm()

    expect(submitButton()).toHaveTextContent(/calculate the final price/i)
    expect(screen.getByText(/you will see the full bill/i)).toBeInTheDocument()
  })

  it('sends step=quote on the first press and step=confirm on the second', async () => {
    const user = userEvent.setup()
    const steps: string[] = []
    vi.mocked(submitCheckout).mockImplementation(async (_previous, data) => {
      steps.push(String(data.get('step')))
      return {
        status: 'quoted' as const,
        summary: QUOTE,
        values: valuesFrom(data),
        messageKey: 'reviewBeforeConfirming',
      }
    })

    try {
      renderForm()
      await fillIn(user)

      await user.click(submitButton())
      await screen.findByRole('heading', { name: /order summary/i }, { timeout: 5_000 })
      await user.click(submitButton())

      // The second press is a different request, not a repeat: only `confirm`
      // may create an order, so the customer cannot order without having been
      // shown the bill.
      expect(steps).toEqual(['quote', 'confirm'])
    } finally {
      vi.mocked(submitCheckout).mockReset()
      vi.mocked(submitCheckout).mockImplementation(async () => ({ status: 'idle' as const }))
    }
  })

  it('shows the whole bill, and only then offers to confirm', async () => {
    const user = userEvent.setup()
    quotingAction()
    renderForm()
    await fillIn(user)

    await user.click(submitButton())

    expect(await screen.findByRole('heading', { name: /order summary/i }, { timeout: 5_000 }))
      .toBeInTheDocument()
    expect(document.body.querySelector('[data-amount="499"]')).toBeInTheDocument()
    expect(document.body.querySelector('[data-amount="2498"]')).toBeInTheDocument()
    expect(submitButton()).toHaveTextContent(/confirm the order/i)
    // And the hint about a second press is gone, because this *is* the second.
    expect(screen.queryByText(/you will see the full bill/i)).not.toBeInTheDocument()
  })

  it('reads the quote out as news, not as an error', async () => {
    // `reviewBeforeConfirming` is a normal step in the flow. As an `alert` it
    // would sound to a screen-reader user like the submission had failed.
    const user = userEvent.setup()
    quotingAction()
    renderForm()
    await fillIn(user)

    await user.click(submitButton())
    await screen.findByRole('heading', { name: /order summary/i }, { timeout: 5_000 })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/this is the final bill/i)
  })

  it('goes back to asking for a price when anything is edited after the quote', async () => {
    // Otherwise the customer could be shown a price for an office in Sofia and
    // confirm it for a street in Varna. Any change at all re-prices, because the
    // list of fields a price depends on is one that would fall out of date.
    const user = userEvent.setup()
    quotingAction()
    renderForm()
    await fillIn(user)

    await user.click(submitButton())
    await screen.findByRole('heading', { name: /order summary/i }, { timeout: 5_000 })
    expect(submitButton()).toHaveTextContent(/confirm the order/i)

    await user.type(screen.getByLabelText(/note for the courier/i), 'Друг адрес')

    expect(submitButton()).toHaveTextContent(/calculate the final price/i)
    expect(checkoutForm().querySelector('input[name="step"]')).toHaveValue('quote')
  })

  it('says which wait it is, while it waits', async () => {
    // "Placing your order…" under a press that is only fetching a price would be
    // a lie at the worst possible moment.
    const user = userEvent.setup()
    let release: () => void = () => {}
    vi.mocked(submitCheckout).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              status: 'quoted' as const,
              summary: QUOTE,
              messageKey: 'reviewBeforeConfirming',
            })
        })
    )
    renderForm()
    await fillIn(user)

    await user.click(submitButton())

    expect(submitButton()).toHaveTextContent(/calculating the price/i)
    release()
    await screen.findByRole('heading', { name: /order summary/i }, { timeout: 5_000 })
  })

  describe('the promo code field', () => {
    it('is not shown at all when the shop has no codes', () => {
      // A box that can only ever answer "not valid" is worse than no box.
      renderForm({ promoCodesEnabled: false })

      expect(screen.queryByRole('textbox', { name: /promo code/i })).not.toBeInTheDocument()
    })

    it('is optional, and says so', () => {
      // Most orders carry no code. An unmarked empty field reads as a missing
      // requirement.
      renderForm({ promoCodesEnabled: true })

      const field = screen.getByRole('textbox', { name: /promo code/i })
      expect(field).not.toBeRequired()
      // The label carries the marker, so it is read out with the field name.
      expect(document.querySelector(`label[for="${field.id}"]`)).toHaveTextContent(/optional/i)
    })

    it('sends what was typed, and keeps it in the box afterwards', async () => {
      // React clears an uncontrolled field when an action completes. A customer
      // told their code expired must not have to retype it to try another.
      const user = userEvent.setup()
      let sent: string | null = null
      vi.mocked(submitCheckout).mockImplementationOnce(async (_previous, data) => {
        sent = String(data.get('promoCode'))
        return {
          status: 'quoted' as const,
          summary: QUOTE,
          promo: { status: 'expired' as const, code: 'KOLEDA' },
          messageKey: 'reviewBeforeConfirming',
        }
      })
      renderForm({ promoCodesEnabled: true })
      await fillIn(user)
      await user.type(screen.getByRole('textbox', { name: /promo code/i }), 'koleda')

      await user.click(submitButton())
      await screen.findByText(/that code has expired/i, {}, { timeout: 5_000 })

      expect(sent).toBe('koleda')
      expect(screen.getByRole('textbox', { name: /promo code/i })).toHaveValue('koleda')
    })

    it('names an accepted code beside the field and its discount in the summary', async () => {
      const user = userEvent.setup()
      vi.mocked(submitCheckout).mockImplementationOnce(async () => ({
        status: 'quoted' as const,
        summary: { ...QUOTE, discountMinor: 200, promoCode: '55CANDLES10', totalMinor: 2298 },
        promo: { status: 'applied' as const, code: '55CANDLES10' },
        messageKey: 'reviewBeforeConfirming',
      }))
      renderForm({ promoCodesEnabled: true })
      await fillIn(user)
      await user.type(screen.getByRole('textbox', { name: /promo code/i }), '55CANDLES10')

      await user.click(submitButton())

      expect(await screen.findByText(/code 55CANDLES10 applied/i, {}, { timeout: 5_000 }))
        .toBeInTheDocument()
      expect(screen.getByText(/Discount \(55CANDLES10\)/)).toBeInTheDocument()
      expect(document.body.querySelector('[data-amount="-200"]')).toBeInTheDocument()
    })

    it('says what a code’s minimum is, in money', async () => {
      const user = userEvent.setup()
      vi.mocked(submitCheckout).mockImplementationOnce(async () => ({
        status: 'quoted' as const,
        summary: QUOTE,
        promo: { status: 'belowMinimum' as const, code: 'FROM40', minGoodsMinor: 4000 },
        messageKey: 'reviewBeforeConfirming',
      }))
      renderForm({ promoCodesEnabled: true })
      await fillIn(user)

      await user.click(submitButton())

      // "Not valid" would be a dead end; the amount is what the customer can act
      // on. Formatted for their locale, like every other figure on the page.
      expect(await screen.findByText(/from €40.00 up/i, {}, { timeout: 5_000 }))
        .toBeInTheDocument()
    })

    it('says nothing about a code nobody entered', async () => {
      const user = userEvent.setup()
      quotingAction()
      renderForm({ promoCodesEnabled: true })
      await fillIn(user)

      await user.click(submitButton())
      await screen.findByRole('heading', { name: /order summary/i }, { timeout: 5_000 })

      expect(screen.queryByText(/that code is not valid/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Discount/)).not.toBeInTheDocument()
    })
  })
})
