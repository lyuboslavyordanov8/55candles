import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'

const StarIcon = () => (
  <svg className="w-4 h-4 fill-clay text-clay" viewBox="0 0 24 24">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
  </svg>
)

const Stars = () => (
  <div className="flex gap-0.5">
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

// Server Component (AUDIT.md S-14).
// NOTE: "Verified buyer" is hardcoded English and the reviews are hardcoded
// names — both still open, see AUDIT.md N-05 / Q-19.
export default function Testimonials() {
  const t = useTranslations('testimonials')

  return (
    <section className="py-28 px-6 bg-cream-surface">
      <div className="max-w-7xl mx-auto">

        {/* Title */}
        <Reveal
          as="h2"
          y={24}
          className="font-serif text-3xl md:text-5xl font-normal text-center text-charcoal mb-16"
        >
          {t('title')}
        </Reveal>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {reviews.map((review, i) => (
            <Reveal
              key={review.nameKey}
              y={24}
              delay={i * 0.08}
              className="p-8 bg-cream-base border border-border rounded-sm flex flex-col gap-5"
            >
              <Stars />

              <p className="text-base text-ink-secondary leading-relaxed italic flex-1 font-serif">
                &ldquo;{t(review.textKey)}&rdquo;
              </p>

              <p className="text-sm font-medium tracking-wide text-charcoal">
                {t(review.nameKey)}
                <span className="font-normal text-ink-ghost ml-2 tracking-normal">
                  · Verified buyer
                </span>
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
