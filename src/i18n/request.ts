import { getRequestConfig } from 'next-intl/server'

const LOCALES = ['en', 'bg'] as const
type Locale = typeof LOCALES[number]

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale: Locale = LOCALES.includes(requested as Locale)
    ? (requested as Locale)
    : 'en'

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
