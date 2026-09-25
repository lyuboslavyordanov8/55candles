import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductGallery from '../ProductGallery'

/**
 * The gallery's multi-photo behaviour, tested on the component directly.
 *
 * Tested with its own images rather than through the catalogue, so the picker,
 * the arrow keys and the aria-hidden panels stay covered whatever photos the
 * products in `src/data/products.ts` happen to carry.
 */

vi.mock('next/image', () => ({
  // `aria-hidden` is forwarded on purpose — the real next/image passes it to the
  // `<img>`, and the hidden-panel test below reads it. `fill`, `sizes` and
  // `priority` are dropped instead of spread: React warns about them on a plain
  // `<img>`.
  default: (props: { src: string; alt: string; 'aria-hidden'?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} aria-hidden={props['aria-hidden']} />
  ),
}))

const IMAGES = ['/images/products/a.webp', '/images/products/b.webp', '/images/products/c.webp']
const LABELS = ['Photo 1 of 3', 'Photo 2 of 3', 'Photo 3 of 3']

function renderGallery(images = IMAGES, labels = LABELS) {
  return render(<ProductGallery images={images} alt="Electric Cherry" imageLabels={labels} />)
}

describe('ProductGallery', () => {
  it('offers one thumbnail per photo, the first selected', () => {
    renderGallery()

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(LABELS)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('omits the picker for a single photo', () => {
    renderGallery([IMAGES[0]], [LABELS[0]])
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('selects a photo when its thumbnail is clicked', async () => {
    renderGallery()

    await userEvent.click(screen.getByRole('tab', { name: 'Photo 3 of 3' }))

    expect(screen.getByRole('tab', { name: 'Photo 3 of 3' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: 'Photo 1 of 3' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  // `tablist` semantics promise arrow keys, and wrapping at both ends.
  it('moves selection with the arrow keys, wrapping round', async () => {
    renderGallery()
    const selected = () =>
      screen.getAllByRole('tab').findIndex((t) => t.getAttribute('aria-selected') === 'true')

    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(selected()).toBe(1)

    await userEvent.keyboard('{End}')
    expect(selected()).toBe(2)

    await userEvent.keyboard('{ArrowRight}')
    expect(selected()).toBe(0)

    await userEvent.keyboard('{ArrowLeft}')
    expect(selected()).toBe(2)
  })

  /**
   * Only the shown photo is in the accessibility tree. All three are rendered
   * so switching never waits on a request, which is exactly what makes this
   * easy to get wrong: without `aria-hidden` a screen reader reads three
   * descriptions of one product.
   */
  it('hides the photos that are not showing from screen readers', async () => {
    const { container } = renderGallery()
    const panel = (src: string) => container.querySelector(`div.aspect-square img[src="${src}"]`)

    expect(panel(IMAGES[0])).not.toHaveAttribute('aria-hidden', 'true')
    expect(panel(IMAGES[1])).toHaveAttribute('aria-hidden', 'true')

    await userEvent.click(screen.getByRole('tab', { name: 'Photo 2 of 3' }))

    expect(panel(IMAGES[0])).toHaveAttribute('aria-hidden', 'true')
    expect(panel(IMAGES[1])).not.toHaveAttribute('aria-hidden', 'true')
  })

  // The number is part of each photo's description only when there is more than
  // one: "Electric Cherry — Photo 1 of 1" is noise.
  it('numbers the photos in their alt text only when there are several', () => {
    const { unmount } = renderGallery()
    expect(screen.getByAltText('Electric Cherry — Photo 1 of 3')).toBeInTheDocument()
    unmount()

    renderGallery([IMAGES[0]], [LABELS[0]])
    expect(screen.getByAltText('Electric Cherry')).toBeInTheDocument()
  })
})
