import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BreadcrumbJsonLd, OrganizationJsonLd, __serialise } from '../JsonLd'
import { company } from '@/lib/company'

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
    expect(data.name).toBe('55candles')
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
