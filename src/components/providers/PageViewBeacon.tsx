'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Tells `/api/visit` that a storefront page was opened.
 *
 * On every change of path, because client-side navigation between pages never
 * reloads the document. Only the path is sent — no query string, no cookie, no
 * identifier of any kind — plus, on the first page of the visit, the referrer:
 * `document.referrer` keeps naming the original site for the whole client-side
 * visit, so sending it again on later pages would credit Google with pages the
 * visitor reached by clicking around the shop.
 *
 * Silent outside production — `.env.local` points at the live database, and a
 * developer's own clicking is not traffic — and for automated browsers, which
 * is what the end-to-end tests are.
 */
export default function PageViewBeacon() {
  const pathname = usePathname()
  const first = useRef(true)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || navigator.webdriver || !pathname) return

    const entry = first.current
    first.current = false

    const body = JSON.stringify({
      path: pathname,
      entry,
      referrer: entry ? document.referrer : '',
    })

    // `sendBeacon` survives the page being closed straight after, which is the
    // one moment a plain fetch would be cancelled.
    if (navigator.sendBeacon?.('/api/visit', new Blob([body], { type: 'text/plain' }))) return
    void fetch('/api/visit', { method: 'POST', body, keepalive: true }).catch(() => {})
  }, [pathname])

  return null
}
