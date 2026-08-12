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
