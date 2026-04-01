import { useTranslations } from 'next-intl'

const StarIcon = () => (
  <svg className="w-4 h-4 fill-amber text-amber" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
  </svg>
)

const Stars = () => (
  <div className="flex gap-0.5" aria-label="5 out of 5 stars">
    {Array.from({ length: 5 }).map((_, i) => <StarIcon key={i} />)}
  </div>
)

interface Review {
  nameKey: '1name' | '2name' | '3name'
  textKey: '1text' | '2text' | '3text'
}

const reviews: Review[] = [
  { nameKey: '1name', textKey: '1text' },
  { nameKey: '2name', textKey: '2text' },
  { nameKey: '3name', textKey: '3text' },
]

export default function Testimonials() {
  const t = useTranslations('testimonials')
  return (
    <section className="py-24 px-6 bg-cream">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold tracking-widest uppercase text-espresso text-center mb-16">
          {t('title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reviews.map((review) => (
            <div
              key={review.nameKey}
              className="bg-white rounded-2xl p-8 shadow-sm flex flex-col gap-5"
            >
              <Stars />
              <p className="text-base text-espresso/80 leading-relaxed italic flex-1">
                &ldquo;{t(review.textKey)}&rdquo;
              </p>
              <p className="text-sm font-bold tracking-wide text-espresso">
                {t(review.nameKey)}
                <span className="font-normal text-espresso/40 ml-2 tracking-normal">· Verified buyer</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
