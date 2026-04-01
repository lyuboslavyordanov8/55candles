import Hero from '@/components/home/Hero'
import ScentsStrip from '@/components/home/ScentsStrip'
import BrandValues from '@/components/home/BrandValues'
import ScentGrid from '@/components/home/ScentGrid'
import StoryTeaser from '@/components/home/StoryTeaser'
import CandleCareTeaser from '@/components/home/CandleCareTeaser'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return (
    <>
      <Hero locale={locale} />
      <ScentsStrip locale={locale} />
      <BrandValues />
      <ScentGrid locale={locale} />
      <StoryTeaser locale={locale} />
      <CandleCareTeaser locale={locale} />
    </>
  )
}
