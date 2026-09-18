import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import OfficePicker from '../OfficePicker'
import type { CourierCity, CourierOffice } from '@/lib/couriers/types'

/**
 * Office picker (AUDIT.md Q-22, Q-25, B-13 step 3).
 *
 * Two things are worth testing here and they are not the happy path. One: the
 * hidden inputs must carry the courier's **office code** plus a readable
 * snapshot, because that is what the waybill and the order record need. Two: all
 * three availability outcomes must render differently — a picker that silently
 * shows nothing costs the order.
 *
 * Real timers rather than fake ones: the debounce is 250 ms, well inside
 * `waitFor`'s window, and `userEvent` with fake timers needs plumbing that would
 * be the most fragile part of the file.
 */

const SOFIA: CourierCity = { id: '41', name: 'София', nameEn: 'Sofia', postCode: '1000' }
const SOZOPOL: CourierCity = { id: '9', name: 'Созопол', postCode: '8130' }

const OFFICES: CourierOffice[] = [
  {
    id: '1012',
    courier: 'econt',
    kind: 'office',
    name: 'София Гладстон',
    address: 'ул. Цар Самуил №3',
    cityId: '41',
    cityName: 'София',
    postCode: '1000',
    hours: '09:00–18:00',
  },
  {
    id: '1107',
    courier: 'econt',
    kind: 'office',
    name: 'София Аксаков',
    address: 'ул. Аксаков №8',
    cityId: '41',
    cityName: 'София',
    postCode: '1000',
  },
]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Handler = (url: URL, signal: AbortSignal | null) => Promise<Response>

/** Answers both query shapes. Overridden per test for the failure cases. */
const happyPath: Handler = async (url) =>
  url.searchParams.has('city')
    ? json({ cities: [SOFIA, SOZOPOL] })
    : json({ offices: OFFICES })

let handler: Handler
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  handler = happyPath
  fetchMock = vi.fn((path: string, init?: RequestInit) =>
    handler(new URL(path, 'http://localhost'), init?.signal ?? null)
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderPicker(props: Partial<Parameters<typeof OfficePicker>[0]> = {}) {
  const onCityChosen = vi.fn()

  const utils = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OfficePicker courier="econt" kind="office" onCityChosen={onCityChosen} {...props} />
    </NextIntlClientProvider>
  )

  return { ...utils, onCityChosen }
}

/** The hidden snapshot the form will submit. */
function submitted(container: HTMLElement) {
  const value = (name: string) =>
    container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value

  return {
    officeId: value('officeId'),
    officeName: value('officeName'),
    officeAddress: value('officeAddress'),
  }
}

/** Type a city, wait past the debounce, and choose the first result. */
async function chooseSofia(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/city or post code/i), 'Соф')
  await user.click(await screen.findByRole('button', { name: /София/ }))
}

describe('searching for a city', () => {
  it('does not search on a single character', async () => {
    // One letter matches most of the country, so it is not a search.
    const user = userEvent.setup()
    renderPicker()

    await user.type(screen.getByLabelText(/city or post code/i), 'с')
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('debounces, so typing a city name is one request and not five', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.type(screen.getByLabelText(/city or post code/i), 'София')
    await screen.findByRole('button', { name: /София/ })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks the route for its own courier', async () => {
    const user = userEvent.setup()
    renderPicker({ courier: 'speedy' })

    await user.type(screen.getByLabelText(/city or post code/i), 'Соф')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/couriers/speedy/offices?city=${encodeURIComponent('Соф')}`
    )
  })

  it('announces the number of matches instead of only rendering them', async () => {
    // A list appearing below the input is no signal at all to a screen reader.
    const user = userEvent.setup()
    renderPicker()

    await user.type(screen.getByLabelText(/city or post code/i), 'Соф')

    expect(await screen.findByText(/2 cities found/i)).toBeInTheDocument()
  })

  it('says so when nothing matches, and suggests the post code', async () => {
    handler = async () => json({ cities: [] })
    const user = userEvent.setup()
    renderPicker()

    await user.type(screen.getByLabelText(/city or post code/i), 'Нexpress')

    expect(await screen.findByText(/no city with a collection point/i)).toBeInTheDocument()
  })

  it('lets a later search win over an earlier slow one', async () => {
    // Otherwise a slow response for "со" lands after the fast one for "софия"
    // and repopulates the list with a query the customer has moved past.
    let releaseFirst: (() => void) | undefined

    handler = async (url, signal) => {
      if (url.searchParams.get('city') === 'Со') {
        return new Promise<Response>((resolve, reject) => {
          releaseFirst = () => resolve(json({ cities: [SOZOPOL] }))
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          )
        })
      }
      return json({ cities: [SOFIA] })
    }

    const user = userEvent.setup()
    renderPicker()
    const input = screen.getByLabelText(/city or post code/i)

    await user.type(input, 'Со')
    await waitFor(() => expect(releaseFirst).toBeDefined())

    // Second search supersedes the first, which is still in flight.
    await user.clear(input)
    await user.type(input, 'София')
    expect(await screen.findByRole('button', { name: /София/ })).toBeInTheDocument()

    // The stale response arrives now; the picker must ignore it.
    releaseFirst?.()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(screen.queryByRole('button', { name: /Созопол/ })).not.toBeInTheDocument()
  })
})

describe('choosing a city', () => {
  it('hands the courier city record back to the form', async () => {
    // The form fills its own city and post code from this. A post code that
    // disagrees with the city is one of the few things both couriers reject.
    const user = userEvent.setup()
    const { onCityChosen } = renderPicker()

    await chooseSofia(user)

    expect(onCityChosen).toHaveBeenCalledWith(SOFIA)
  })

  it('loads the offices in that city, for the requested kind', async () => {
    const user = userEvent.setup()
    renderPicker({ kind: 'locker' })

    await chooseSofia(user)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/couriers/econt/offices?cityId=41&kind=locker',
        expect.anything()
      )
    )
  })

  it('replaces the search box with the chosen city and a way back', async () => {
    const user = userEvent.setup()
    renderPicker()

    await chooseSofia(user)

    expect(screen.queryByLabelText(/city or post code/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change city/i })).toBeInTheDocument()
  })

  it('explains an empty list rather than showing an empty dropdown', async () => {
    // Plenty of Bulgarian settlements have an office and no locker.
    handler = async (url) =>
      url.searchParams.has('city') ? json({ cities: [SOFIA] }) : json({ offices: [] })

    const user = userEvent.setup()
    renderPicker({ kind: 'locker' })

    await chooseSofia(user)

    expect(await screen.findByText(/no parcel locker in София/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('what the form submits', () => {
  it('is empty until an office is chosen', async () => {
    // Which keeps the server's `officeId: 'required'` check the single source of
    // truth about whether the customer actually picked one.
    const user = userEvent.setup()
    const { container } = renderPicker()

    await chooseSofia(user)
    await screen.findByRole('combobox')

    expect(submitted(container)).toEqual({
      officeId: '',
      officeName: '',
      officeAddress: '',
    })
  })

  it('is the office code plus a readable snapshot', async () => {
    // The code is what goes on the waybill; the name and address travel with the
    // order because an office can close before the label is printed.
    const user = userEvent.setup()
    const { container } = renderPicker()

    await chooseSofia(user)
    await user.selectOptions(await screen.findByRole('combobox'), '1012')

    expect(submitted(container)).toEqual({
      officeId: '1012',
      officeName: 'София Гладстон',
      officeAddress: 'ул. Цар Самуил №3',
    })
  })

  it('shows the opening hours of the chosen office, when known', async () => {
    const user = userEvent.setup()
    renderPicker()

    await chooseSofia(user)
    const select = await screen.findByRole('combobox')

    await user.selectOptions(select, '1012')
    expect(screen.getByText(/open 09:00–18:00/i)).toBeInTheDocument()

    // The second fixture has none, and inventing them would send someone to a
    // shut office.
    await user.selectOptions(select, '1107')
    expect(screen.queryByText(/^open /i)).not.toBeInTheDocument()
  })

  it('clears the chosen office when the city changes', async () => {
    // An office code from the previous city would otherwise be submitted,
    // addressed to a place the customer is not going.
    const user = userEvent.setup()
    const { container } = renderPicker()

    await chooseSofia(user)
    await user.selectOptions(await screen.findByRole('combobox'), '1012')
    expect(submitted(container).officeId).toBe('1012')

    await user.click(screen.getByRole('button', { name: /change city/i }))

    expect(submitted(container)).toEqual({
      officeId: '',
      officeName: '',
      officeAddress: '',
    })
  })
})

describe('when the courier cannot be reached', () => {
  it('falls back to a free-text field on 503, with the same input name', async () => {
    // 503 is "no credentials yet": permanent, so no retry is offered, and the
    // customer types the office name as they did before this component existed.
    handler = async () => json({ error: 'unconfigured' }, 503)
    const user = userEvent.setup()
    const { container } = renderPicker()

    await user.type(screen.getByLabelText(/city or post code/i), 'Соф')

    const manual = await screen.findByLabelText(/office or locker/i)
    expect(manual).toBeRequired()
    expect(manual).toHaveAttribute('name', 'officeId')
    expect(container.querySelectorAll('input[name="officeId"]')).toHaveLength(1)
    expect(screen.getByText(/a searchable list will appear here/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try the list again/i })).not.toBeInTheDocument()
  })

  it('offers a retry on 502, because an outage is temporary', async () => {
    handler = async () => json({ error: 'failed' }, 502)
    const user = userEvent.setup()
    renderPicker()

    await user.type(screen.getByLabelText(/city or post code/i), 'Соф')

    expect(await screen.findByText(/couldn't reach the courier/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/office or locker/i)).toHaveAttribute('name', 'officeId')

    // Retrying re-runs the search that failed, without the customer retyping.
    handler = happyPath
    await user.click(screen.getByRole('button', { name: /try the list again/i }))

    expect(await screen.findByRole('button', { name: /София/ })).toBeInTheDocument()
  })

  it('treats a network error as a failed lookup, not a crash', async () => {
    handler = async () => {
      throw new TypeError('Failed to fetch')
    }
    const user = userEvent.setup()
    renderPicker()

    await user.type(screen.getByLabelText(/city or post code/i), 'Соф')

    expect(await screen.findByText(/couldn't reach the courier/i)).toBeInTheDocument()
  })

  it('shows a server-side officeId error on the fallback field too', async () => {
    // A rejected submission must explain itself in whichever field the customer
    // is looking at.
    handler = async () => json({ error: 'unconfigured' }, 503)
    const user = userEvent.setup()
    renderPicker({ error: 'The courier does not recognise that office.' })

    await user.type(screen.getByLabelText(/city or post code/i), 'Соф')

    const manual = await screen.findByLabelText(/office or locker/i)
    expect(manual).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/does not recognise that office/i)).toBeInTheDocument()
  })
})

describe('demo data', () => {
  it('warns whoever is clicking through that the offices are not real', async () => {
    // Only ever rendered outside production — `econtEnvironment()` refuses the
    // demo environment there — but the notice is what makes that visible.
    renderPicker({ demoData: true })

    expect(await screen.findByRole('note')).toHaveTextContent(/test system/i)
  })

  it('says nothing when the data is real', () => {
    renderPicker()

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
