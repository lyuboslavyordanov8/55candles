import Hero from '@/components/home/Hero'
import BrandValues from '@/components/home/BrandValues'
import ScentGrid from '@/components/home/ScentGrid'
import StoryTeaser from '@/components/home/StoryTeaser'
import Testimonials from '@/components/home/Testimonials'
import CandleCareTeaser from '@/components/home/CandleCareTeaser'
import CtaBanner from '@/components/home/CtaBanner'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return (
    <>
      <Hero locale={locale} />
      <BrandValues />
      <ScentGrid locale={locale} />
      <StoryTeaser locale={locale} />
      <Testimonials />
      <CandleCareTeaser locale={locale} />
      <CtaBanner locale={locale} />
    </>
  )
}
