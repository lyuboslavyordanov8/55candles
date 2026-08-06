import '@testing-library/jest-dom'

// jsdom implements neither IntersectionObserver nor ResizeObserver, but
// framer-motion reaches for both (`whileInView`, layout animations). Without
// these stubs every component that animates on scroll throws at render time.
//
// The stubs deliberately never fire their callbacks: elements stay at their
// `initial` style, which keeps them in the DOM and in the accessibility tree,
// so queries still resolve. Assert on content, not on animated style.
class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = ''
  readonly thresholds: ReadonlyArray<number> = []

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.IntersectionObserver = IntersectionObserverStub
globalThis.ResizeObserver = ResizeObserverStub

// Used by framer-motion to honour `prefers-reduced-motion`.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
