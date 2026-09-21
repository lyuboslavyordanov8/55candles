import type { Metadata } from 'next'
import React from 'react'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import Reveal from '@/components/motion/Reveal'
import { localeAlternates } from '@/i18n/locales'

const LeafIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </svg>
)

const ShieldCheckIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)

const TagIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
)

const brandValues = [
  { Icon: LeafIcon, titleKey: 'value1Title', bodyKey: 'value1Body' },
  { Icon: ShieldCheckIcon, titleKey: 'value2Title', bodyKey: 'value2Body' },
  { Icon: TagIcon, titleKey: 'value3Title', bodyKey: 'value3Body' },
] as const

function ValueCard({
  Icon,
  title,
  body,
}: {
  Icon: () => React.ReactElement
  title: string
  body: string
}) {
  return (
    <Reveal
      y={16}
      once
      duration={0.4}
      className="flex flex-col items-center text-center gap-4 p-7 rounded-sm bg-cream-surface border border-border"
    >
      <div className="text-clay">
        <Icon />
      </div>

      <h3 className="font-serif text-base font-normal text-charcoal">
        {title}
      </h3>

      <p className="text-[15px] text-ink-secondary leading-relaxed max-w-xs">
        {body}
      </p>
    </Reveal>
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'ourStory' })

  return {
    title: t('title'),
    description: t('intro'),
    alternates: {
      canonical: `/${locale}/our-story`,
      languages: localeAlternates('/our-story'),
    },
  }
}

// Server Component. This page used to be a `'use client'` component behind a
// thin server wrapper, purely because of its entrance animations. Hoisting
// those into Reveal let the two files collapse back into one (AUDIT.md S-14).
export default function OurStoryPage() {
  const t = useTranslations('ourStory')

  return (
    <div className="min-h-screen pt-36 pb-28 bg-cream-base">

      {/* HERO */}
      <Reveal
        trigger="mount"
        y={20}
        duration={0.6}
        className="max-w-3xl mx-auto px-6 text-center mb-24"
      >
        <h1 className="font-serif text-5xl md:text-6xl font-normal text-charcoal leading-tight mb-6">
          {t('title')}
        </h1>

        <p className="text-lg text-ink-secondary max-w-xl mx-auto leading-relaxed">
          {t('intro')}
        </p>
      </Reveal>

      {/* Divider */}
      <div className="h-px bg-border max-w-3xl mx-auto mb-24" />

      {/* STORY BLOCK */}
      <div className="px-6 mb-24">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-20 items-center">

          {/* Image */}
          <Reveal
            scale={0.97}
            once
            duration={0.6}
            className="relative aspect-[4/5] rounded-sm overflow-hidden border border-border bg-cream-surface"
          >
            {/* Near-square photograph in a 4:5 frame — see StoryTeaser for why
                the centre crop and the raised quality. */}
            <Image
              src="/images/story-chair-closeup.webp"
              alt="An Espresso Martini candle beside a takeaway coffee and a laptop on a walnut chair, with a tweed coat draped over its back"
              fill
              quality={90}
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </Reveal>

          {/* Text */}
          <Reveal y={24} once duration={0.6}>
            <h2 className="font-serif text-2xl md:text-3xl font-normal text-charcoal mb-6">
              {t('edibleTitle')}
            </h2>

            <p className="text-[15px] text-ink-secondary leading-relaxed">
              {t('edibleBody')}
            </p>
          </Reveal>

        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border max-w-3xl mx-auto mb-20" />

      {/* VALUES */}
      <div className="max-w-5xl mx-auto px-6">

        <p className="text-xs text-ink-ghost text-center mb-14 tracking-widest uppercase">
          {t('valuesTitle')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {brandValues.map((v) => (
            <ValueCard
              key={v.titleKey}
              Icon={v.Icon}
              title={t(v.titleKey)}
              body={t(v.bodyKey)}
            />
          ))}
        </div>

      </div>
    </div>
  )
}
