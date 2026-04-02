'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'

export default function ContactPage() {
  const t = useTranslations('contact')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="relative pt-32 pb-24 bg-[#0a0a0a] text-white min-h-screen overflow-hidden">

      {/* 🔥 Ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_60%)]" />

      <div className="relative max-w-md mx-auto px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl font-medium tracking-tight text-white/90 mb-3">
            {t('title')}
          </h1>

          <p className="text-white/50 text-sm leading-relaxed max-w-xs mx-auto">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Success */}
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <p className="text-white/90 text-lg font-medium mb-2">
              {t('success')}
            </p>

            <p className="text-white/50 text-sm">
              We’ll get back to you shortly.
            </p>
          </motion.div>
        ) : (

          /* Form */
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="flex flex-col gap-6"
          >

            {/* Inputs */}
            {[
              { name: 'name', type: 'text' },
              { name: 'email', type: 'email' }
            ].map((field) => (
              <div key={field.name} className="relative">
                <input
                  type={field.type}
                  required
                  placeholder=" "
                  aria-label={t(field.name)}
                  className="peer w-full border border-white/10 rounded-xl px-4 pt-6 pb-2 text-sm bg-white/5 backdrop-blur-xl text-white placeholder-transparent focus:outline-none focus:border-white/30 transition-all duration-200"
                />
                <label className="absolute left-4 top-3 text-xs text-white/40 transition-all 
                  peer-placeholder-shown:top-4 
                  peer-placeholder-shown:text-sm 
                  peer-placeholder-shown:text-white/30
                  peer-focus:top-3 
                  peer-focus:text-xs 
                  peer-focus:text-white/60">
                  {t(field.name)}
                </label>
              </div>
            ))}

            {/* Message */}
            <div className="relative">
              <textarea
                required
                rows={5}
                placeholder=" "
                aria-label={t('message')}
                className="peer w-full border border-white/10 rounded-xl px-4 pt-6 pb-3 text-sm bg-white/5 backdrop-blur-xl text-white placeholder-transparent focus:outline-none focus:border-white/30 transition-all duration-200 resize-none"
              />
              <label className="absolute left-4 top-3 text-xs text-white/40 transition-all 
                peer-placeholder-shown:top-4 
                peer-placeholder-shown:text-sm 
                peer-placeholder-shown:text-white/30
                peer-focus:top-3 
                peer-focus:text-xs 
                peer-focus:text-white/60">
                {t('message')}
              </label>
            </div>

            {/* CTA */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.01 }}
              type="submit"
              className="mt-2 w-full py-4 text-sm font-medium rounded-xl transition-all duration-300 bg-white/10 text-white hover:bg-white/20 border border-white/10"
            >
              {t('send')}
            </motion.button>
          </motion.form>
        )}

        {/* Instagram */}
        <div className="text-center mt-16">
          <a
            href="https://instagram.com/55candles"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs tracking-wide text-white/40 hover:text-white transition-colors"
          >
            {t('instagramCta')} →
          </a>
        </div>
      </div>
    </div>
  )
}