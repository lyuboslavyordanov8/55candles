import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'
import StarRating from '@/components/products/StarRating'

/**
 * "Какво казват хората за нас" — three quotes on plain white columns.
 *
 * No card borders or shadows: the quotation itself is the object, and boxing
 * it added chrome without adding meaning.
 *
 * The quotes are placeholders. They live in `messages/bg.json` and
 * `messages/en.json` under `testimonials`, marked with a TODO — replace them
 * with real, attributable reviews before launch. Invented testimonials on a
 * live shop are a consumer-protection problem, not just a copy one.
 *
 * Server Component (AUDIT.md S-14).
 */
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
    <section className="bg-paper-white px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal
          as="h2"
          y={20}
          className="mb-14 text-center font-serif text-3xl font-normal italic text-ink-primary md:mb-20 md:text-4xl"
        >
          {t('title')}
        </Reveal>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-10">
          {reviews.map((review, i) => (
            <Reveal
              key={review.nameKey}
              y={20}
              delay={i * 0.08}
              className="flex flex-col items-center gap-4 text-center"
            >
              <StarRating rating={5} label={t('starsLabel')} />

              <p className="max-w-xs text-base leading-relaxed text-ink-secondary">
                &ldquo;{t(review.textKey)}&rdquo;
              </p>

              <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-primary">
                {t(review.nameKey)}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
