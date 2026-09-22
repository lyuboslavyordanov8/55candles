import { describe, it, expect, afterEach, vi } from 'vitest'

import {
  ACCOUNTANT_REQUIREMENTS,
  availableRequirements,
  COMPLIANCE_RULES,
  upcomingCompliance,
  vatMonitor,
  vatState,
  vatThresholdConfig,
} from '../config'
import { company } from '../../company'

/**
 * The module that holds every legal number in the system.
 *
 * Two things are being guarded. That the ДДС state has exactly one source — a
 * second flag is how a shop charges tax on one screen and not on another — and
 * that the threshold monitor **stays silent until somebody configures it**,
 * because a made-up figure either cries wolf or, far worse, says nothing while
 * the shop crosses the line.
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ДДС state', () => {
  it('comes from the company, not from a second flag here', () => {
    expect(vatState()).toEqual({
      registered: company.isVatRegistered,
      number: company.vatNumber,
    })
  })

  it('is currently not registered, which is what the whole module assumes', () => {
    expect(vatState().registered).toBe(false)
  })
})

describe('the registration threshold monitor', () => {
  it('is unconfigured until a figure is set, and says so rather than guessing', () => {
    const monitor = vatMonitor(9_000_00)

    expect(monitor.level).toBe('unconfigured')
    expect(monitor.thresholdMinor).toBeNull()
    expect(monitor.progress).toBeNull()
  })

  it('still reports the turnover it can see while unconfigured', () => {
    expect(vatMonitor(9_000_00).turnoverMinor).toBe(900000)
  })

  it('reads the configured threshold in euro and works in minor units', () => {
    vi.stubEnv('ACCOUNTING_VAT_THRESHOLD_EUR', '51129.19')

    expect(vatThresholdConfig().thresholdMinor).toBe(5112919)
  })

  it('is normal well below, approaching at 80%, exceeded at 100%', () => {
    vi.stubEnv('ACCOUNTING_VAT_THRESHOLD_EUR', '50000')

    expect(vatMonitor(10_000_00).level).toBe('normal')
    expect(vatMonitor(39_999_00).level).toBe('normal')
    expect(vatMonitor(40_000_00).level).toBe('approaching')
    expect(vatMonitor(50_000_00).level).toBe('exceeded')
    expect(vatMonitor(70_000_00).level).toBe('exceeded')
  })

  it('ignores a threshold that is not a positive number', () => {
    for (const value of ['0', '-100', 'сто хиляди', '']) {
      vi.stubEnv('ACCOUNTING_VAT_THRESHOLD_EUR', value)
      expect(vatThresholdConfig().thresholdMinor).toBeNull()
    }
  })

  it('defaults the window to twelve months and refuses a silly one', () => {
    expect(vatThresholdConfig().windowMonths).toBe(12)

    vi.stubEnv('ACCOUNTING_VAT_WINDOW_MONTHS', '6')
    expect(vatThresholdConfig().windowMonths).toBe(6)

    vi.stubEnv('ACCOUNTING_VAT_WINDOW_MONTHS', '600')
    expect(vatThresholdConfig().windowMonths).toBe(12)
  })

  it('names the act to read rather than stating the rule itself', () => {
    expect(vatThresholdConfig().legalSource).toContain('ЗДДС')
  })
})

describe('the compliance calendar', () => {
  it('puts the soonest deadline first', () => {
    const occurrences = upcomingCompliance(new Date('2026-06-20T09:00:00Z'))

    expect(occurrences.length).toBeGreaterThan(0)
    for (let index = 1; index < occurrences.length; index += 1) {
      expect(occurrences[index].daysAway).toBeGreaterThanOrEqual(occurrences[index - 1].daysAway)
    }
  })

  it('counts the days to a yearly deadline from today in Sofia', () => {
    const tax = upcomingCompliance(new Date('2026-06-20T09:00:00Z')).find(
      (occurrence) => occurrence.rule.key === 'annual-corporate-tax'
    )

    expect(tax?.daysAway).toBe(10)
    expect(tax?.reminding).toBe(true)
  })

  it('keeps a just-missed deadline visible instead of jumping a year', () => {
    // A filing missed three days ago is exactly what the shop needs to see. The
    // same date twelve months away is not the same information.
    const tax = upcomingCompliance(new Date('2026-07-03T09:00:00Z')).find(
      (occurrence) => occurrence.rule.key === 'annual-corporate-tax'
    )

    expect(tax?.overdue).toBe(true)
    expect(tax?.daysAway).toBe(-3)
  })

  it('moves on once a missed deadline is past its reminder window', () => {
    const tax = upcomingCompliance(new Date('2026-09-01T09:00:00Z')).find(
      (occurrence) => occurrence.rule.key === 'annual-corporate-tax'
    )

    expect(tax?.overdue).toBe(false)
    expect(tax?.dueOn.getUTCFullYear()).toBe(2027)
  })

  it('rolls the monthly reminder to next month once this month’s has passed', () => {
    const monthly = upcomingCompliance(new Date('2026-09-20T09:00:00Z')).find(
      (occurrence) => occurrence.rule.key === 'monthly-package'
    )

    expect(monthly?.dueOn.toISOString().slice(0, 10)).toBe('2026-10-05')
  })

  it('marks every legal rule unverified until a human has checked it', () => {
    // The calendar organises and reminds. A date this code invented and then
    // presented as confirmed law would be the one thing it must never do.
    for (const rule of COMPLIANCE_RULES.filter((entry) => entry.legalSource)) {
      expect(rule.lastVerifiedOn).toBeNull()
    }
  })

  it('leaves the shop’s own routines without a legal source', () => {
    const housekeeping = COMPLIANCE_RULES.find((rule) => rule.key === 'monthly-package')

    expect(housekeeping?.legalSource).toBeNull()
  })
})

describe('what the accountant can be given', () => {
  it('offers only what the shop can actually produce', () => {
    const available = availableRequirements().map((entry) => entry.key)

    expect(available).toContain('sales')
    expect(available).toContain('expenses')
    // No blob store, so the documents themselves are not among them.
    expect(available).not.toContain('expense-documents')
    // Наложен платеж is the only payment method there is.
    expect(available).not.toContain('payment-provider')
  })

  it('explains every unavailable one rather than hiding it', () => {
    for (const requirement of ACCOUNTANT_REQUIREMENTS.filter((entry) => !entry.available)) {
      expect(requirement.unavailableReason).toBeTruthy()
    }
  })
})
