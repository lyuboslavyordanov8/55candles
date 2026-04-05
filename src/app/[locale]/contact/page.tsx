'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const InstagramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
)

const ViberIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.398.002C9.473.028 5.331.344 3.014 2.467 1.294 4.177.693 6.698.623 9.82c-.07 3.12-.154 8.972 5.5 10.574h.005l-.005 2.425s-.037.968.602 1.164c.768.24 1.222-.495 1.956-1.287.403-.436.959-1.075 1.378-1.564 3.795.32 6.713-.41 7.047-.52.767-.248 5.107-.804 5.812-6.559.728-5.926-.353-9.67-2.357-11.363C18.918.625 16.148-.03 11.398.002zm.064 1.97s3.87-.056 6.07 1.727c1.817 1.547 2.555 4.71 1.944 9.766-.586 4.773-4.06 5.088-4.712 5.298-.273.088-2.82.718-6.078.508 0 0-2.41 2.904-3.164 3.66-.12.12-.261.169-.356.146-.133-.034-.17-.194-.168-.418l.02-3.7C4.96 17.24 2.05 16.194 2.11 9.888c.057-6.306 4.004-7.824 7.115-7.871h.001c.703-.01 1.462-.019 2.236-.045zm-.168 2.45c-.283.003-2.45.198-3.684 1.288-.973.866-1.471 2.15-1.488 3.814-.017 1.664.436 3.047 1.363 4.133.79.927 1.944 1.46 3.176 1.46.058 0 .117-.001.176-.004a4.555 4.555 0 0 0 1.994-.566 7.95 7.95 0 0 0 1.11-.841l.04-.037.025.01a3.63 3.63 0 0 0 .697.183l.013.003c.23.04.463.06.697.06a3.62 3.62 0 0 0 2.478-.97 3.605 3.605 0 0 0 .015-5.094 3.598 3.598 0 0 0-2.493-1.065c-.123 0-.247.006-.369.02a4.595 4.595 0 0 0-1.228-1.956c-.899-.8-2.048-1.248-3.317-1.33a4.37 4.37 0 0 0-.205-.005zm.024 1.357c1.04.064 1.946.43 2.65 1.062.61.547.995 1.27 1.098 2.076a3.603 3.603 0 0 0-.74-.077c-1.995 0-3.618 1.625-3.618 3.62 0 .33.046.649.13.952a2.64 2.64 0 0 1-.933.227 2.685 2.685 0 0 1-.11.003c-.9 0-1.736-.381-2.336-1.074-.735-.862-1.094-1.994-1.08-3.363.014-1.382.42-2.432 1.203-3.123.97-.86 2.64-1.283 3.736-1.303zm3.008 2.617c1.228 0 2.226.999 2.226 2.228s-.998 2.228-2.226 2.228c-.124 0-.247-.011-.366-.031a2.19 2.19 0 0 1-.435-.126 2.198 2.198 0 0 1-.74-.494 2.215 2.215 0 0 1-.553-.913 2.218 2.218 0 0 1-.132-.664 2.228 2.228 0 0 1 2.226-2.228z"/>
  </svg>
)

export default function ContactPage() {
  const t = useTranslations('contact')

  const [form, setForm] = useState({
    name: '',
    email: '',
    message: ''
  })

  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await new Promise((res) => setTimeout(res, 1000))
      setSubmitted(true)
    } catch {
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen pt-32 pb-24 bg-cream-base">

      <div className="max-w-lg mx-auto px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h1 className="font-serif text-4xl font-normal text-charcoal mb-4">
            {t('title')}
          </h1>

          <p className="text-base text-ink-secondary max-w-sm mx-auto leading-relaxed">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Success State */}
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="text-center bg-cream-surface border border-border rounded-sm p-8"
          >
            <div className="text-2xl mb-2 text-clay">✓</div>

            <p className="text-charcoal text-lg font-medium mb-2">
              {t('success')}
            </p>

            <p className="text-ink-ghost text-sm">
              We&apos;ll get back to you shortly.
            </p>
          </motion.div>
        ) : (

          /* Form Card */
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="bg-cream-surface border border-border rounded-sm p-6 flex flex-col gap-5"
          >

            {/* Name */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-ink-secondary tracking-wide">
                {t('name')}
              </label>
              <input
                type="text"
                required
                autoComplete="name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full rounded-sm px-4 py-3 text-sm bg-cream-base border border-border focus:border-clay focus:outline-none transition-colors duration-200 text-charcoal"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-ink-secondary tracking-wide">
                {t('email')}
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full rounded-sm px-4 py-3 text-sm bg-cream-base border border-border focus:border-clay focus:outline-none transition-colors duration-200 text-charcoal"
              />
            </div>

            {/* Message */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-ink-secondary tracking-wide">
                {t('message')}
              </label>
              <textarea
                required
                rows={5}
                value={form.message}
                onChange={(e) => updateField('message', e.target.value)}
                className="w-full rounded-sm px-4 py-3 text-sm bg-cream-base border border-border focus:border-clay focus:outline-none transition-colors duration-200 text-charcoal resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-500">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              disabled={loading}
              type="submit"
              className="mt-2 w-full py-4 rounded-sm text-sm font-medium tracking-widest uppercase bg-charcoal text-cream-base hover:bg-clay transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : t('send')}
            </button>
          </motion.form>
        )}

        {/* Contact links */}
        <div className="flex flex-col items-center gap-4 mt-12">
          <a
            href="https://www.instagram.com/55candles.bg/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs tracking-wide text-ink-ghost hover:text-charcoal transition-colors duration-200"
          >
            <InstagramIcon />
            {t('instagramCta')}
          </a>

          <a
            href="viber://chat?number=%2B359887115957"
            className="flex items-center gap-2 text-xs tracking-wide text-ink-ghost hover:text-charcoal transition-colors duration-200"
          >
            <ViberIcon />
            Contact us on Viber
          </a>
        </div>

      </div>
    </div>
  )
}
