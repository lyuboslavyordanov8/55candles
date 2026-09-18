import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { products } from '@/data/products'
import { homeBanner } from '@/content/home-banner'

/**
 * Every local image referenced from code must exist AND be non-empty.
 *
 * `public/images/hero.jpg` was committed as a 0-byte file and stayed that way
 * for months. A zero-byte file is worse than a missing one: the dev server
 * happily returns `200 image/jpeg` with no body, so nothing 404s, and
 * next/image answers 400 for the optimized URL. The homepage hero is
 * `h-screen`, so the result was an entire viewport of blank grey — the site
 * looked completely broken on a phone while every automated check passed.
 *
 * Existence alone is not enough. Assert the bytes.
 */

const publicDir = resolve(__dirname, '../../public')

function assetPath(webPath: string): string {
  return join(publicDir, webPath.replace(/^\//, ''))
}

/**
 * Local image paths hardcoded in components, which no data test would reach.
 *
 * The homepage banner is not hardcoded — it comes from
 * `src/content/home-banner.ts` — so it is pulled from there instead of being
 * repeated here. Point that file at a new banner and this test follows it.
 */
const componentImages = [
  homeBanner.image,
  '/images/story-chair-closeup.webp',
  '/images/collection-group.webp',
  '/images/care-tools.webp',
  '/images/contact-telephone.webp',
  '/images/logo-ink.png',
  // The couriers' own logos, on the checkout's courier choice. A missing one
  // would drop a customer back to reading two words in a language they may not
  // read — see `CourierMark`.
  '/images/couriers/econt-blue-bg.svg',
  '/images/couriers/econt-blue-en.svg',
  '/images/couriers/speedy.webp',
]

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      collectSourceFiles(full, acc)
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

describe('image assets', () => {
  const productImages = [
    ...products.map((p) => p.imagePath),
    ...products.map((p) => p.hoverImagePath).filter((p): p is string => Boolean(p)),
    // Gallery photos beyond the primary image.
    ...products.flatMap((p) => p.extraImages ?? []),
  ]

  const referenced = [...new Set([...productImages, ...componentImages])]

  for (const webPath of referenced) {
    it(`${webPath} exists and is not empty`, () => {
      const file = assetPath(webPath)

      let size: number
      try {
        size = statSync(file).size
      } catch {
        throw new Error(`${webPath} is referenced in code but missing from public/`)
      }

      expect(size, `${webPath} exists but is 0 bytes — it will serve an empty 200`).toBeGreaterThan(
        0
      )
    })
  }

  it('no zero-byte files anywhere under public/', () => {
    const empties: string[] = []

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (statSync(full).size === 0) empties.push(full.replace(publicDir, ''))
      }
    }
    walk(publicDir)

    expect(empties, `zero-byte files serve an empty 200 and break next/image`).toEqual([])
  })

  // Catches a new hardcoded /images/... path that nothing else knows about.
  it('every /images/ path hardcoded in src/ is covered by this test', () => {
    const sources = collectSourceFiles(resolve(__dirname, '..'))
    const found = new Set<string>()

    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/['"`](\/images\/[^'"`]+)['"`]/g)) {
        found.add(match[1])
      }
    }

    const uncovered = [...found].filter((p) => !referenced.includes(p))
    expect(uncovered, 'add these to the image asset test').toEqual([])
  })
})
