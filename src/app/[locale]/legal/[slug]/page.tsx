import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'

import Reveal from '@/components/motion/Reveal'
import Impressum from '@/components/legal/Impressum'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import { locales } from '@/i18n/locales'
import { LEGAL_DOCS, LEGAL_IS_DRAFT, isLegalSlug, legalDoc, legalPath } from '@/lib/legal'
import type { LegalSlug } from '@/lib/legal'

export async function generateStaticParams() {
  return locales.flatMap((locale) => LEGAL_DOCS.map((doc) => ({ locale, slug: doc.slug })))
}

/** Shape of one document in the `legal.docs` namespace. */
interface Section {
  heading: string
  body: string
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params

  if (!isLegalSlug(slug)) return {}

  const t = await getTranslations({ locale, namespace: `legal.docs.${slug}` })
  const path = `/legal/${slug}`

  return {
    title: t('title'),
    description: t('summary'),
    alternates: {
      canonical: `/${locale}${path}`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}${path}`])),
    },
    // Draft legal text should not be indexed or shared as though it were
    // final; the pages are reachable, just not advertised.
    robots: LEGAL_IS_DRAFT ? { index: false, follow: true } : { index: true, follow: true },
  }
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params

  if (!isLegalSlug(slug)) {
    notFound()
  }

  return <LegalDocument locale={locale} slug={slug} />
}

/**
 * Split out so the `useTranslations` hook runs in a component whose props are
 * already resolved — the page itself must be async to await `params`, and hooks
 * cannot be called in an async component.
 */
function LegalDocument({ locale, slug }: { locale: string; slug: LegalSlug }) {
  const t = useTranslations(`legal.docs.${slug}`)
  const tl = useTranslations('legal')
  const tn = useTranslations('nav')

  const doc = legalDoc(slug)
  // `t.raw` returns the array as authored rather than a formatted string.
  const sections = t.raw('sections') as Section[]

  return (
    <div className="pt-32 pb-28 bg-cream-base min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { href: `/${locale}`, name: tn('home') },
          { href: legalPath(locale, slug), name: t('title') },
        ]}
      />

      <article className="max-w-3xl mx-auto px-6">
        {/* HEADER */}
        <Reveal as="div" trigger="mount" y={24} className="mb-12">
          <p className="text-xs tracking-[0.25em] uppercase text-clay mb-4">{tl('eyebrow')}</p>

          <h1 className="font-serif text-4xl md:text-5xl font-normal text-charcoal mb-5">
            {t('title')}
          </h1>

          <p className="text-base text-ink-secondary leading-relaxed mb-6">{t('summary')}</p>

          <p className="text-xs text-ink-ghost">
            {tl('lastUpdatedLabel')}: <time dateTime={doc.lastUpdated}>{doc.lastUpdated}</time>
          </p>
        </Reveal>

        {/*
          Draft warning. Deliberately loud and impossible to miss: unreviewed
          legal text that looks final is worse than no legal text, because a
          customer may rely on it.
        */}
        {LEGAL_IS_DRAFT && (
          <div
            role="note"
            className="mb-14 rounded-sm border border-clay/40 bg-clay/5 p-6 flex flex-col gap-2"
          >
            <p className="text-sm font-medium text-charcoal">{tl('draftNoticeTitle')}</p>
            <p className="text-sm text-ink-secondary leading-relaxed">{tl('draftNoticeBody')}</p>
          </div>
        )}

        {/* BODY */}
        <div className="flex flex-col gap-10">
          {sections.map((section, i) => (
            <Reveal key={section.heading} y={16} delay={Math.min(i, 6) * 0.04}>
              <h2 className="text-sm font-medium tracking-widest uppercase text-charcoal mb-3">
                {section.heading}
              </h2>

              <p className="text-base text-ink-secondary leading-relaxed whitespace-pre-line">
                {section.body}
              </p>
            </Reveal>
          ))}
        </div>

        {/* TRADER IDENTIFICATION (B-16) */}
        <section className="mt-20 pt-10 border-t border-border">
          <h2 className="text-sm font-medium tracking-widest uppercase text-charcoal mb-6">
            {locale === 'bg' ? 'Данни за търговеца' : 'Trader identification'}
          </h2>

          <Impressum variant="full" locale={locale} />
        </section>

        {/* SIBLING DOCUMENTS */}
        <nav
          aria-label={locale === 'bg' ? 'Правни документи' : 'Legal documents'}
          className="mt-16 pt-10 border-t border-border flex flex-wrap gap-x-6 gap-y-3"
        >
          {LEGAL_DOCS.filter((other) => other.slug !== slug).map((other) => (
            <Link
              key={other.slug}
              href={legalPath(locale, other.slug)}
              className="text-xs tracking-widest uppercase text-ink-ghost hover:text-charcoal transition-colors duration-200"
            >
              {tl(`docs.${other.key}.title`)}
            </Link>
          ))}
        </nav>
      </article>
    </div>
  )
}
