import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import enMessages from '../../../messages/en.json'
import bgMessages from '../../../messages/bg.json'
import { CLIENT_NAMESPACES, pickClientMessages } from '../client-namespaces'

const SRC = join(__dirname, '..', '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)

    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(full)
    }

    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

/**
 * The layout narrows the client catalogue to CLIENT_NAMESPACES, so a Client
 * Component reading a namespace outside that list throws MISSING_MESSAGE at
 * runtime — in the browser, on a route nobody may have opened yet.
 *
 * This scans the source instead of waiting for that.
 */
describe('client message namespaces', () => {
  const files = sourceFiles(SRC)

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('covers every namespace a Client Component reads', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')

      // Only the directive at the very top of a file makes it a Client
      // Component; a mention inside a comment or string does not.
      const isClient = /^\s*(['"])use client\1/.test(source)
      if (!isClient) continue

      for (const [, namespace] of source.matchAll(
        /useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g
      )) {
        if (!(CLIENT_NAMESPACES as readonly string[]).includes(namespace)) {
          offenders.push(`${file.replace(SRC, 'src')} reads "${namespace}"`)
        }
      }
    }

    expect(
      offenders,
      `Client Components read namespaces missing from CLIENT_NAMESPACES.\n` +
        `Add them to src/i18n/client-namespaces.ts, or make the component a ` +
        `Server Component:\n  ${offenders.join('\n  ')}`
    ).toEqual([])
  })

  it('lists only namespaces that exist in both catalogues', () => {
    for (const namespace of CLIENT_NAMESPACES) {
      expect(enMessages, `en.json is missing "${namespace}"`).toHaveProperty(namespace)
      expect(bgMessages, `bg.json is missing "${namespace}"`).toHaveProperty(namespace)
    }
  })

  it('drops server-only namespaces from the client payload', () => {
    const picked = pickClientMessages(enMessages)

    expect(Object.keys(picked).sort()).toEqual([...CLIENT_NAMESPACES].sort())
    // Spot-check the largest server-only namespaces.
    expect(picked).not.toHaveProperty('candleCarePage')
    expect(picked).not.toHaveProperty('ourStory')
    expect(picked).not.toHaveProperty('testimonials')
  })

  it('is smaller than the full catalogue', () => {
    const full = JSON.stringify(enMessages).length
    const scoped = JSON.stringify(pickClientMessages(enMessages)).length

    expect(scoped).toBeLessThan(full)
  })
})
