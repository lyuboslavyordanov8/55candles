import Link from 'next/link'

/**
 * The admin's design system, in one file.
 *
 * Two kinds of export, and the split is deliberate:
 *
 * - **Class-string builders** (`button`, `input`, `table`) for the places that
 *   already have working markup. A restyle must not rewire a form, so the
 *   `<button type="submit">` inside a server action's `<form>` keeps its element
 *   and gains a class, rather than being replaced by a component that would have
 *   to re-implement it.
 * - **Components** (`PageHeader`, `Section`, `Badge`, `EmptyState`) for the
 *   patterns that repeat identically on every page, where a component removes
 *   real duplication.
 *
 * ## The palette is the shop's own
 *
 * `charcoal`, `ink-*`, `clay`, `border`, `cream-*` and `paper-*` come from
 * `tailwind.config.ts` — the same tokens the storefront uses, and the ones
 * `src/__tests__/contrast.test.ts` guards. The admin used to be built from
 * Tailwind's `stone` scale, a cold grey that read as a different product from
 * the shop it administers. Nothing is added to those scales here: a new tint
 * would enter the contrast matrix, and this file has no business changing what
 * the storefront may paint with.
 *
 * Status colours are the one exception, and they are semantic rather than brand:
 * emerald, amber and red at low saturation, dark enough on their own tint to
 * clear AA at the sizes used here.
 *
 * ## The scale
 *
 * Radius `rounded-md`, hairline borders, no shadow heavier than a ring, `4`-step
 * spacing, `text-xs` for data and `text-sm` for prose. Serif italic — the
 * brand's display face — appears exactly twice: the wordmark and the page title.
 * Everywhere else is Montserrat, with `tabular-nums` wherever figures stack,
 * because columns of money and order numbers that do not line up are the one
 * thing this interface cannot afford.
 */

// ---------------------------------------------------------------------------
// Class builders
// ---------------------------------------------------------------------------

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45'

const BUTTON_VARIANTS = {
  /** One per screen. The action the page exists for. */
  primary: 'bg-charcoal text-cream-surface hover:bg-ink-secondary',
  secondary: 'border border-border bg-paper-white text-ink-primary hover:bg-cream-surface',
  ghost: 'text-ink-secondary hover:bg-cream-muted hover:text-ink-primary',
  danger: 'border border-red-300 bg-red-50 text-red-900 hover:bg-red-100',
} as const

const BUTTON_SIZES = {
  sm: 'h-7 px-2.5',
  md: 'h-8 px-3',
  lg: 'h-9 px-4 text-sm',
} as const

export function button(
  variant: keyof typeof BUTTON_VARIANTS = 'secondary',
  size: keyof typeof BUTTON_SIZES = 'md'
): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`
}

/** One input height for every control, so a filter row lines up without effort. */
export const input =
  'h-8 w-full rounded-md border border-border bg-paper-white px-2.5 text-xs text-ink-primary placeholder:text-ink-ghost focus:border-clay'

export const select = `${input} pr-7`

export const textarea =
  'w-full rounded-md border border-border bg-paper-white px-2.5 py-2 text-xs text-ink-primary placeholder:text-ink-ghost focus:border-clay'

/** Surfaces. `panel` is the card; `ground` is what it sits on. */
export const panel = 'rounded-lg border border-border bg-paper-white'

export const tableWrap = `${panel} overflow-hidden`

export const table = 'w-full border-collapse text-xs'

export const th =
  'px-3 py-2.5 text-left text-[11px] font-medium tracking-wide text-ink-ghost uppercase'

export const td = 'px-3 py-2.5 align-top text-ink-primary'

export const tr = 'border-t border-border/60 transition-colors hover:bg-cream-surface/70'

/** A label above a control, the only field layout this admin uses. */
export const fieldLabel = 'mb-1 block text-[11px] font-medium tracking-wide text-ink-ghost uppercase'

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * The top of every page: where you are, what it is, what you can do about it.
 *
 * `actions` sits on the right at every width above `sm`, so the primary action
 * is in the same place on every screen and nobody has to scan for it.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
  meta,
}: {
  title: string
  description?: React.ReactNode
  /** Where "up" is, when the page has a parent. */
  back?: { href: string; label: string }
  /** Buttons. Nothing else — see `meta`. */
  actions?: React.ReactNode
  /** A figure or a status for this page, when the corner holds information rather than an action. */
  meta?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-1">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-1 inline-flex items-center gap-1 text-xs text-ink-ghost transition-colors hover:text-ink-primary"
          >
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        )}
        <h1 className="font-serif text-2xl leading-tight text-charcoal">{title}</h1>
        {description && <p className="mt-1 text-xs text-ink-secondary">{description}</p>}
      </div>
      {(actions || meta) && (
        <div className="flex flex-wrap items-center gap-4">
          {meta}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </header>
  )
}

/**
 * A titled block of a page.
 *
 * `title` is optional: some blocks are a table that speaks for itself, and a
 * heading over every single thing is how a dashboard starts to read as a pile of
 * cards rather than a page.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`${panel} ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[11px] font-medium tracking-wide text-ink-ghost uppercase">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 text-xs text-ink-secondary">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

const TONES = {
  neutral: 'border-border bg-cream-muted text-ink-secondary',
  /** Something is done and nothing is owed. */
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  /** Needs a human today. */
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  /** Money or goods went the wrong way. */
  danger: 'border-red-200 bg-red-50 text-red-900',
  /** In motion, nothing wrong. */
  info: 'border-clay/25 bg-pastel-blush text-clay',
} as const

export type Tone = keyof typeof TONES

/**
 * One badge, one system.
 *
 * Bordered tints rather than solid fills: a table of fifteen saturated pills is
 * harder to read than the text it decorates, and the border is what keeps a pale
 * tint legible on a cream ground.
 */
export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: Tone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * What a page says when it has nothing to show.
 *
 * Always a next step, never just an absence: an empty screen is the one place a
 * new admin is most likely to be stuck, and "нищо няма" is not help.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className={`${panel} px-6 py-10 text-center`}>
      <p className="text-sm font-medium text-ink-primary">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-xs text-ink-secondary">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/**
 * A row of label-and-value, which is most of what an order page is.
 *
 * `dl` rather than a table: these are pairs, not a grid, and a screen reader
 * announcing them as pairs is the accurate reading.
 */
export function DetailRow({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex gap-3 py-1.5 text-xs ${className}`}>
      <dt className="w-28 shrink-0 text-ink-ghost">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink-primary">{children}</dd>
    </div>
  )
}

/**
 * A notice about the page, not about a field.
 *
 * `role="alert"` only for the tones that report a problem — an "issued" banner
 * interrupting a screen reader mid-sentence is noise, a failure is not.
 */
export function Notice({
  tone = 'warning',
  children,
}: {
  tone?: Extract<Tone, 'warning' | 'danger' | 'success' | 'info'>
  children: React.ReactNode
}) {
  const alerts = tone === 'warning' || tone === 'danger'

  return (
    <p
      {...(alerts ? { role: 'alert' } : {})}
      className={`rounded-md border px-3 py-2.5 text-xs ${TONES[tone]}`}
    >
      {children}
    </p>
  )
}
