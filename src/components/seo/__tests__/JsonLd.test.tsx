import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BreadcrumbJsonLd, OrganizationJsonLd, ProductJsonLd, __serialise } from '../JsonLd'
import { company } from '@/lib/company'
import { getProductBySlug } from '@/data/products'
import type { Product } from '@/types/product'

function parseScripts(container: HTMLElement) {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
    (node) => JSON.parse(node.innerHTML)
  )
}

describe('serialise', () => {
  it('escapes < so an interpolated string cannot close the script tag', () => {
    const output = __serialise({ name: '</script><img onerror=alert(1)>' })

    expect(output).not.toContain('</script>')
    expect(output).toContain('\\u003c')
  })

  it('still produces valid JSON after escaping', () => {
    const value = { name: 'a < b' }

    expect(JSON.parse(__serialise(value))).toEqual(value)
  })
})

describe('OrganizationJsonLd', () => {
  it('identifies the legal entity and its ЕИК', () => {
    const { container } = render(<OrganizationJsonLd locale="bg" />)
    const [data] = parseScripts(container)

    expect(data['@type']).toBe('Organization')
    expect(data.legalName).toBe('ВиреонЛабс ЕООД')
    expect(data.taxID).toBe('208907603')
    // The brand must still be discoverable as the name customers search for.
    expect(data.name).toBe('55° candles')
  })

  it('uses the transliterated name in English but keeps the Bulgarian one', () => {
    const { container } = render(<OrganizationJsonLd locale="en" />)
    const [data] = parseScripts(container)

    expect(data.legalName).toBe('VireonLabs EOOD')
    expect(data.alternateName).toBe('ВиреонЛабс ЕООД')
  })

  it('does not repeat the same name as its own alternate', () => {
    for (const locale of ['bg', 'en']) {
      const { container } = render(<OrganizationJsonLd locale={locale} />)
      const [data] = parseScripts(container)

      expect(data.alternateName, `${locale}: alternateName duplicates legalName`).not.toBe(
        data.legalName
      )
    }
  })

  it('omits unresolved fields rather than emitting [TODO] to crawlers', () => {
    const { container } = render(<OrganizationJsonLd locale="bg" />)
    const [data] = parseScripts(container)

    expect(JSON.stringify(data)).not.toContain('[TODO')

    // The address object exists for the country, but placeholder parts are gone.
    expect(data.address.addressCountry).toBe('BG')
    if (company.address.street.startsWith('[TODO:')) {
      expect(data.address.streetAddress).toBeUndefined()
    }
  })

  it('emits exactly one script', () => {
    const { container } = render(<OrganizationJsonLd locale="bg" />)

    expect(parseScripts(container)).toHaveLength(1)
  })
})

describe('ProductJsonLd', () => {
  const cherry = getProductBySlug('cherry')!
  const winterWonderland = getProductBySlug('winter-wonderland')!

  it('emits an Offer in the catalogue currency, in major units, for a purchasable product', () => {
    const { container } = render(
      <ProductJsonLd locale="en" product={cherry} description="A cherry candle." />
    )
    const [data] = parseScripts(container)

    expect(data['@type']).toBe('Product')
    expect(data.name).toBe(cherry.name)
    expect(data.description).toBe('A cherry candle.')
    expect(data.offers['@type']).toBe('Offer')
    expect(data.offers.priceCurrency).toBe('EUR')
    expect(data.offers.price).toBe('19.99')
    expect(data.offers.availability).toBe('https://schema.org/InStock')
  })

  it('makes the image and url absolute', () => {
    const { container } = render(
      <ProductJsonLd locale="en" product={cherry} description="A cherry candle." />
    )
    const [data] = parseScripts(container)

    expect(data.image).toMatch(/^https?:\/\/.+\.webp$/)
    expect(data.url).toMatch(/^https?:\/\/.+\/en\/products\/cherry$/)
  })

  it('reports OutOfStock, not InStock, for a priced but out-of-season product', () => {
    // winter-wonderland has a price but isPurchasable() is false — the season
    // check, not the pricing table, is what must decide this.
    const { container } = render(
      <ProductJsonLd locale="en" product={winterWonderland} description="A winter candle." />
    )
    const [data] = parseScripts(container)

    expect(data.offers.availability).toBe('https://schema.org/OutOfStock')
  })

  it('omits offers entirely for a product with no price, rather than inventing one', () => {
    const unpriced: Product = { ...cherry, slug: 'not-a-real-product' }

    const { container } = render(
      <ProductJsonLd locale="en" product={unpriced} description="Unpriced." />
    )
    const [data] = parseScripts(container)

    expect(data.offers).toBeUndefined()
  })

  it('never emits aggregateRating, because product.rating/reviewCount are documented placeholders', () => {
    // cherry carries a rating in src/data/products.ts — asserting on it directly
    // (rather than skipping if absent) is what would catch this coming back.
    expect(cherry.rating).toBeDefined()

    const { container } = render(
      <ProductJsonLd locale="en" product={cherry} description="A cherry candle." />
    )
    const [data] = parseScripts(container)

    expect(data.aggregateRating).toBeUndefined()
    expect(data.review).toBeUndefined()
  })
})

describe('BreadcrumbJsonLd', () => {
  it('numbers positions from 1, contiguously', () => {
    const { container } = render(
      <BreadcrumbJsonLd
        items={[
          { href: '/en', name: 'Home' },
          { href: '/en/legal/terms', name: 'Terms' },
        ]}
      />
    )
    const [data] = parseScripts(container)

    expect(data['@type']).toBe('BreadcrumbList')
    expect(data.itemListElement.map((i: { position: number }) => i.position)).toEqual([1, 2])
  })

  it('makes item URLs absolute', () => {
    const { container } = render(
      <BreadcrumbJsonLd items={[{ href: '/en/legal/terms', name: 'Terms' }]} />
    )
    const [data] = parseScripts(container)

    expect(data.itemListElement[0].item).toMatch(/^https?:\/\/.+\/en\/legal\/terms$/)
  })

  it('renders nothing for an empty trail', () => {
    const { container } = render(<BreadcrumbJsonLd items={[]} />)

    expect(parseScripts(container)).toHaveLength(0)
  })
})
