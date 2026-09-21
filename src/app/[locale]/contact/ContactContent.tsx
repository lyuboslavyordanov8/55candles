'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

import { company } from '@/lib/company'

const InstagramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
)

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </svg>
)

/** Maps a server-side field error code to a message key. */
const FIELD_ERROR_KEYS: Record<string, Record<string, string>> = {
  name: { tooShort: 'errorNameTooShort', tooLong: 'errorNameTooLong' },
  email: {
    required: 'errorEmailRequired',
    invalid: 'errorEmailInvalid',
    tooLong: 'errorEmailTooLong',
  },
  message: { tooShort: 'errorMessageTooShort', tooLong: 'errorMessageTooLong' },
}

export default function ContactContent() {
  const t = useTranslations('contact')

  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  // Stays empty for every real user; see the hidden field below.
  const [honeypot, setHoneypot] = useState('')

  /**
   * Real submission (AUDIT.md B-20). This used to await a 1000 ms timeout and
   * then claim success unconditionally, destroying every enquiry. It now
   * reports what actually happened — including that delivery is not yet
   * configured (B-17), in which case the customer is pointed at the phone
   * number rather than being told a lie.
   */
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, website: honeypot }),
      })

      if (response.ok) {
        setSubmitted(true)
        return
      }

      const body = await response.json().catch(() => ({}))

      if (response.status === 400 && body.fields) {
        const mapped: Record<string, string> = {}
        for (const [field, code] of Object.entries(body.fields as Record<string, string>)) {
          const key = FIELD_ERROR_KEYS[field]?.[code]
          if (key) mapped[field] = t(key)
        }
        setFieldErrors(mapped)
        setError(t('errorSummary'))
        return
      }

      if (response.status === 429) {
        setError(t('errorRateLimited'))
        return
      }

      // Both fallbacks name the mailbox, because this is the moment the form has
      // failed and a channel the customer can reach by hand is the only thing
      // standing between them and giving up.
      setError(
        response.status === 503
          ? t('errorUnconfigured', { email: company.contact.email })
          : t('errorFailed', { email: company.contact.email })
      )
    } catch {
      // Network-level failure: the request never reached the server.
      setError(t('errorNetwork'))
    } finally {
      setLoading(false)
    }
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen pt-36 pb-24 bg-cream-base">
      <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-start">

        {/* Left — contact info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-serif text-4xl font-normal text-charcoal mb-4">
            {t('title')}
          </h1>

          <p className="text-base text-ink-secondary leading-relaxed mb-12">
            {t('subtitle')}
          </p>

          {/* Contact details */}
          <div className="flex flex-col gap-6">

            {/* The published address, read from `company.ts` rather than written
                here: the number that used to sit in this spot was hardcoded, so
                removing it from the company record would have left it on screen. */}
            <a
              href={`mailto:${company.contact.email}`}
              className="flex items-center gap-3 group"
            >
              <span className="text-clay">
                <MailIcon />
              </span>
              <span className="text-sm text-charcoal group-hover:text-clay transition-colors duration-200">
                {company.contact.email}
              </span>
            </a>

            <a
              href="https://www.instagram.com/55candles.bg/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram — @55candles.bg"
              className="flex items-center gap-3 group"
            >
              <span className="text-clay">
                <InstagramIcon />
              </span>
              <span className="text-sm text-charcoal group-hover:text-clay transition-colors duration-200">
                @55candles.bg
              </span>
            </a>

          </div>
        </motion.div>

        {/* Right — form */}
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            role="status"
            aria-live="polite"
            className="text-center bg-cream-surface border border-border rounded-sm p-10 flex flex-col items-center justify-center gap-3"
          >
            <div className="text-2xl text-clay">✓</div>
            <p className="text-charcoal text-lg font-medium">{t('success')}</p>
            <p className="text-ink-ghost text-sm">{t('successDetail')}</p>
          </motion.div>
        ) : (
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="contact-name" className="text-xs text-ink-secondary tracking-wide">
                {t('name')}
              </label>
              <input
                id="contact-name"
                type="text"
                required
                autoComplete="name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? 'contact-name-error' : undefined}
                className="w-full rounded-sm px-4 py-3 text-sm bg-cream-base border border-border focus:border-clay focus:outline-none transition-colors duration-200 text-charcoal"
              />
              {fieldErrors.name && (
                <p id="contact-name-error" className="text-xs text-red-700">
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="contact-email" className="text-xs text-ink-secondary tracking-wide">
                {t('email')}
              </label>
              <input
                id="contact-email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? 'contact-email-error' : undefined}
                className="w-full rounded-sm px-4 py-3 text-sm bg-cream-base border border-border focus:border-clay focus:outline-none transition-colors duration-200 text-charcoal"
              />
              {fieldErrors.email && (
                <p id="contact-email-error" className="text-xs text-red-700">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="contact-message" className="text-xs text-ink-secondary tracking-wide">
                {t('message')}
              </label>
              <textarea
                id="contact-message"
                required
                rows={5}
                value={form.message}
                onChange={(e) => updateField('message', e.target.value)}
                aria-invalid={fieldErrors.message ? true : undefined}
                aria-describedby={fieldErrors.message ? 'contact-message-error' : undefined}
                className="w-full rounded-sm px-4 py-3 text-sm bg-cream-base border border-border focus:border-clay focus:outline-none transition-colors duration-200 text-charcoal resize-none"
              />
              {fieldErrors.message && (
                <p id="contact-message-error" className="text-xs text-red-700">
                  {fieldErrors.message}
                </p>
              )}
            </div>

            {/*
              Honeypot. Hidden from sight and from assistive technology, and
              skipped by keyboard navigation, so no real user can fill it —
              which is what makes a populated value a reliable bot signal.
            */}
            <div aria-hidden="true" className="hidden">
              <label htmlFor="contact-website">Website</label>
              <input
                id="contact-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-red-700">
                {error}
              </p>
            )}

            <button
              disabled={loading}
              type="submit"
              className="mt-2 w-full py-4 rounded-sm text-sm font-medium tracking-widest uppercase bg-charcoal text-cream-base hover:bg-clay transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('sending') : t('send')}
            </button>
          </motion.form>
        )}

      </div>
    </div>
  )
}
