import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'
import MaterialIcon, { type IconName } from '@/components/icons/MaterialIcon'

interface Props { locale: string }

/**
 * "Грижа за свещите" — four tips, in a row on desktop, stacked on mobile.
 *
 * Each tip gets a Material Symbol in a circle of the pastel drawn from that
 * step's meaning: butter for the flame, blue for the cooling limit, and so on.
 * The circles give the row a rhythm that a bare icon does not, and they carry
 * the palette into a section that would otherwise be type only.
 *
 * The icons are inlined path data, not the Material icon font — see
 * `MaterialIcon.tsx` for why that is not optional here.
 *
 * Server Component (AUDIT.md S-14).
 */
const tips: ReadonlyArray<{
  icon: IconName
  ring: string
  titleKey: string
  bodyKey: string
}> = [
  { icon: 'contentCut', ring: 'bg-pastel-pink', titleKey: 'tip1Title', bodyKey: 'tip1Body' },
  { icon: 'flame', ring: 'bg-pastel-butter', titleKey: 'tip2Title', bodyKey: 'tip2Body' },
  { icon: 'schedule', ring: 'bg-pastel-blue', titleKey: 'tip3Title', bodyKey: 'tip3Body' },
  { icon: 'air', ring: 'bg-pastel-lilac', titleKey: 'tip4Title', bodyKey: 'tip4Body' },
]

export default function CandleCareTeaser({ locale }: Props) {
  const t = useTranslations('candleCareSection')

  return (
    <section className="bg-pastel-sage px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal y={20} className="mb-14 text-center md:mb-16">
          <h2 className="font-serif text-3xl font-normal italic text-ink-primary md:text-4xl">
            {t('title')}
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {tips.map((tip, i) => (
            <Reveal
              key={tip.titleKey}
              y={20}
              delay={i * 0.08}
              className="flex flex-col items-center gap-4 text-center"
            >
              <span
                className={`flex h-16 w-16 items-center justify-center rounded-full ${tip.ring}`}
              >
                <MaterialIcon name={tip.icon} className="h-7 w-7 text-ink-primary" />
              </span>

              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-primary">
                {t(tip.titleKey)}
              </h3>

              <p className="max-w-xs text-sm leading-relaxed text-ink-secondary">
                {t(tip.bodyKey)}
              </p>
            </Reveal>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link
            href={`/${locale}/candle-care`}
            className="inline-flex items-center gap-2 border-b border-clay pb-0.5 text-xs font-medium uppercase tracking-[0.18em] text-clay transition-opacity duration-200 hover:opacity-70"
          >
            {t('cta')} <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
