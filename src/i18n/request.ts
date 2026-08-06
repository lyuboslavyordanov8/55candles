import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, isLocale, type Locale } from './locales'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale: Locale = isLocale(requested) ? requested : defaultLocale

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
