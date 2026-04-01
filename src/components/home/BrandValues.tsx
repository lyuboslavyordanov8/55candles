import { useTranslations } from 'next-intl'

export default function BrandValues() {
  const t = useTranslations('values')
  const values = [
    { icon: '🌱', label: t('eco') },
    { icon: '🕯️', label: t('nonToxic') },
    { icon: '🍒', label: t('fruit') },
  ]
  return (
    <section className="py-20 px-6 bg-sand">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
        {values.map((v) => (
          <div key={v.label} className="flex flex-col items-center text-center gap-3">
            <span className="text-4xl" aria-hidden="true">{v.icon}</span>
            <p className="text-sm font-semibold tracking-widest uppercase text-espresso">{v.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
