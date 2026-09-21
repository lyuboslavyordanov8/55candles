import { notFound } from 'next/navigation'
import { isLocale } from '@/i18n/locales'
import Hero from '@/components/home/Hero'
import ScentGrid from '@/components/home/ScentGrid'
import StoryTeaser from '@/components/home/StoryTeaser'
import DiscoverOurWorld from '@/components/home/DiscoverOurWorld'
import CandleCareTeaser from '@/components/home/CandleCareTeaser'
import Testimonials from '@/components/home/Testimonials'

/**
 * The homepage, in six sections.
 *
 * Backgrounds alternate white and a pastel tint so the page has rhythm without
 * borders: banner (blush) → products (white) → story (blush) → discover
 * (white) → care (sage) → testimonials (white).
 *
 * `DiscoverOurWorld` sits after the story rather than directly under the
 * banner, which is where the reference site puts its equivalent grid. Two
 * whites would otherwise touch, and by this point the visitor has seen the
 * candles and read who makes them — which is the moment "there is more here"
 * is worth saying. Moving it is one line if that reads wrong.
 *
 * `BrandValues` and `CtaBanner` used to sit in this list and were removed in
 * the redesign. Both components still exist under `src/components/home/` and
 * work — re-adding either is a line here plus its import.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  /*
    The same guard as the locale layout, repeated here on purpose.
    `app/[locale]` is one dynamic segment and the proxy skips paths containing a
    dot, so a request for a static file that is not there — `/site.webmanifest`,
    `/apple-touch-icon.png` — routes *here* with that filename as the locale.
    The layout's `notFound()` gives the right 404, but layouts and pages render
    in parallel (`fetching-data` guide, "layouts and pages are rendered in
    parallel"), so it cannot stop this page from rendering the whole homepage
    with a locale that is not a locale. That is what produced five
    `RangeError: Incorrect locale information provided` per missing-icon request.

    Bailing out here means no section runs at all. `formatMoney` also tolerates a
    malformed tag, for the routes that have no guard of their own.
  */
  if (!isLocale(locale)) {
    notFound()
  }

  return (
    <>
      <Hero locale={locale} />
      <ScentGrid locale={locale} />
      <StoryTeaser locale={locale} />
      <DiscoverOurWorld locale={locale} />
      <CandleCareTeaser locale={locale} />
      <Testimonials />
    </>
  )
}
