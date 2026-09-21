import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'
import StarRating from '@/components/products/StarRating'

/**
 * "Какво казват хората за нас" — three quotes on plain white columns.
 *
 * No card borders or shadows: the quotation itself is the object, and boxing
 * it added chrome without adding meaning.
 *
 * The quotes are the owner's own — customer reviews she supplied, in
 * `messages/bg.json` and `messages/en.json` under `testimonials`. They are no
 * longer placeholders, so do not edit them for tone: a testimonial on a live
 * shop has to be something the customer actually said, which is a
 * consumer-protection matter rather than a copy one. The Bulgarian is the
 * original; the English is a translation of it.
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
