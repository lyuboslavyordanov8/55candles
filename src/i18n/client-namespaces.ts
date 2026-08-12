import type { Locale } from './locales'

/**
 * Namespaces that Client Components actually read.
 *
 * `NextIntlClientProvider` serialises whatever it is handed into the RSC
 * payload, so passing the whole catalogue shipped every string on every route
 * — including the entire product, story and care copy for both locales'
 * worth of pages a visitor never opens (AUDIT.md S-14).
 *
 * After the server/client split the only components that call
 * `useTranslations` on the client are:
 *
 * | namespace  | consumer                                 |
 * |------------|------------------------------------------|
 * | `contact`  | ContactContent — the form has real state |
 * | `notFound` | [locale]/not-found.tsx                   |
 * | `error`    | [locale]/error.tsx                       |
 * | `checkout` | DeliveryForm — fields depend on method   |
 *
 * Everything else is rendered on the server and arrives as HTML. Note that
 * `nav` is deliberately absent: `MobileMenu` is a Client Component but receives
 * its labels already translated, as props from the server-rendered `Navbar`.
 *
 * **When you make a component a Client Component, add its namespace here** or
 * `useTranslations` will throw `MISSING_MESSAGE` at runtime.
 * `src/i18n/__tests__/client-namespaces.test.ts` scans for that mistake.
 */
export const CLIENT_NAMESPACES = ['contact', 'notFound', 'error', 'checkout', 'cart'] as const

type Messages = Record<string, unknown>

/** Narrow a full catalogue down to the namespaces the client needs. */
export function pickClientMessages(messages: Messages): Messages {
  const picked: Messages = {}

  for (const namespace of CLIENT_NAMESPACES) {
    if (namespace in messages) {
      picked[namespace] = messages[namespace]
    }
  }

  return picked
}

export type { Locale }
