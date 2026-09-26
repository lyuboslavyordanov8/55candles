import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import AnnouncementBar from './AnnouncementBar'
import LanguageSwitcher from './LanguageSwitcher'
import Logo from './Logo'
import MobileMenu from './MobileMenu'
import SearchOverlay, { type SearchableProduct } from './SearchOverlay'
import CartButton from '@/components/cart/CartButton'
import { navLinks } from './nav-links'
import { products } from '@/data/products'

/**
 * The header: announcement bar, then a white bar in three zones — menu and
 * search on the left, the wordmark centred, language and cart on the right.
 *
 * The nav links no longer sit along the bar at desktop width. They live in the
 * menu panel at every breakpoint, which is what puts the wordmark in the true
 * centre; a row of links on one side would push it off. It also means one
 * navigation to maintain rather than a desktop copy and a mobile copy.
 *
 * The header used to go transparent over the homepage hero and invert its text
 * to cream. Both are gone: the bar is white everywhere now, so there is no
 * scroll state and no pathname to check, which is what let this become a Server
 * Component. Only the menu, the search panel and the language switcher ship
 * any JavaScript.
 *
 * It is `fixed`, and roughly 100px tall. Pages clear it with `pt-36`; the
 * homepage hero does its own thing — see `Hero.tsx`.
 */
export default function Navbar() {
  const t = useTranslations('nav')
  const tSearch = useTranslations('search')
  const tProduct = useTranslations('product')
  const locale = useLocale()

  const links = navLinks(locale, t)

  // Built here rather than in the client component so the matching text — scent
  // notes, descriptors, mood — never has to cross into the browser bundle as
  // whole product objects.
  //
  // The matching text is the *translated* copy, so a Bulgarian visitor searching
  // „череша“ finds the cherry candle. It came from the data before, which held
  // English only, so on the Bulgarian site the words on screen and the words the
  // search matched were different languages (AUDIT.md B-22).
  // Not a `comingSoon` candle: a result has to lead to a page.
  const searchable: SearchableProduct[] = products
    .filter((product) => !product.comingSoon)
    .map((product) => ({
      slug: product.slug,
      name: product.name,
      href: `/${locale}/products/${product.slug}`,
      imagePath: product.imagePath,
      haystack: [
        product.name,
        tProduct(`copy.${product.slug}.descriptor`),
        tProduct(`copy.${product.slug}.mood`),
        tProduct(`copy.${product.slug}.notes.top`),
        tProduct(`copy.${product.slug}.notes.heart`),
        tProduct(`copy.${product.slug}.notes.base`),
      ]
        .join(' ')
        .toLowerCase(),
    }))

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <AnnouncementBar />

      <div className="border-b border-border bg-paper-white">
        {/*
          `minmax(0,1fr)` rather than plain `1fr` for the side tracks. A bare
          `1fr` is `minmax(auto,1fr)`, so a track refuses to shrink below its
          content: on a phone the right-hand group (language pill plus cart)
          was wider than its share, overflowed the track and pushed the cart
          off the edge. `minmax(0,…)` lets the tracks shrink instead.
        */}
        {/*
          Vertical padding sets the height of the white bar. It was raised a
          step (py-3/4 -> py-5/6) at the owner's request to give the logo, menu
          and cart more room to breathe. The `pt-36` clearance every page uses
          was raised in the same change — the two must move together or the
          first line of content slides under the fixed header.
        */}
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-5 md:gap-4 md:px-6 md:py-6">
          {/* Left: menu + search */}
          <div className="flex items-center gap-1 justify-self-start">
            <MobileMenu
              links={links}
              languageSwitcher={<LanguageSwitcher />}
              labels={{
                open: t('openMenu'),
                close: t('closeMenu'),
                menu: t('menuLabel'),
              }}
            />

            <SearchOverlay
              products={searchable}
              labels={{
                open: tSearch('open'),
                close: tSearch('close'),
                placeholder: tSearch('placeholder'),
                empty: tSearch('empty'),
                // One string per possible result count, 0 through the whole
                // catalogue — see the prop's comment for why it is not a
                // template.
                resultCounts: Array.from({ length: searchable.length + 1 }, (_, count) =>
                  tSearch('resultCount', { count })
                ),
              }}
            />
          </div>

          {/* Centre: wordmark */}
          <Link
            href={`/${locale}`}
            className="justify-self-center transition-opacity duration-200 hover:opacity-70"
          >
            <Logo priority className="h-4 w-auto md:h-5" />
          </Link>

          {/* Right: language + cart */}
          <div className="flex items-center gap-2 justify-self-end md:gap-3">
            {/*
              Renders its own compact form on phones — see LanguageSwitcher.
              It is deliberately here at every width rather than only in the
              menu panel: this is a Bulgarian-first site with an English
              translation, so switching language is a top-level action, not
              something to hide behind a hamburger.
            */}
            <LanguageSwitcher />

            {/* Opens the cart drawer and carries the item count. */}
            <CartButton />
          </div>
        </div>
      </div>
    </header>
  )
}
