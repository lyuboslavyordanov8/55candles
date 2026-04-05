'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

const InstagramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
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

        {/* Instagram */}
        <div className="text-center mt-10">
          <p className="text-xs text-ink-ghost mb-3 tracking-wide">
            {t('instagramCta')}
          </p>
          <a
            href="https://www.instagram.com/55candles.bg/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-charcoal hover:text-clay transition-colors duration-200"
          >
            <InstagramIcon />
            <span className="border-b border-charcoal/30 hover:border-clay pb-px transition-colors duration-200">
              @55candles.bg
            </span>
          </a>
        </div>

      </div>
    </div>
  )
}
