'use client'

// Last-resort boundary: catches errors thrown by the root layout itself, and
// replaces it when active — so it must define its own <html> and <body>.
//
// It deliberately depends on nothing but React and global CSS. next-intl,
// fonts and the layout are all things that could be the cause of the error we
// are rendering, so none of them are used here. Copy is hardcoded bilingual.
//
// `metadata` exports are unsupported in Client Components; React's <title>
// element is the documented alternative.
import './globals.css'

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="en">
      <body className="bg-cream-base text-charcoal antialiased">
        <title>Error — 55° candles</title>

        <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          {/*
            A plain <img>, not next/image and not the shared Logo component.
            This boundary catches failures in the root layout itself, so it
            depends on nothing but React and global CSS — see the note at the
            top of the file. An <img> to a static file in public/ holds that
            line; the image component does not.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-ink.png"
            alt="55° candles"
            width={161}
            height={20}
            className="mb-16"
          />

          <h1 className="text-3xl md:text-4xl font-normal text-charcoal mb-3">
            Нещо се обърка
          </h1>
          <p className="text-base text-ink-secondary mb-10">Something went wrong</p>

          <button
            onClick={() => unstable_retry()}
            className="inline-flex items-center justify-center px-8 py-3 bg-charcoal text-cream-base text-xs font-medium tracking-widest uppercase rounded-sm hover:bg-clay transition-colors duration-300"
          >
            Опитай отново / Try again
          </button>

          {error.digest && (
            <p className="mt-12 text-[10px] tracking-widest uppercase text-ink-ghost">
              Ref: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
