# 55candles — Creamy Minimal Redesign Spec
_Date: 2026-04-02_

## Goal
Replace the existing dark theme (`bg-[#0a0a0a]`, white text, orange glows, glassmorphism) with a warm, editorial cream aesthetic that elevates the brand to premium lifestyle territory.

## Design Decisions (locked in via visual brainstorming)

| Decision | Choice |
|---|---|
| Overall direction | Pure Editorial — typography-first, no photo hero |
| Heading serif | Playfair Display |
| Body / nav | Montserrat (already loaded) |
| Product cards | Warm Float — borderless, soft off-white surface, clay CTA |
| Accent color | Clay brown `#8B6F4E` |
| Implementation | Clean break — delete all dark values, no theme toggle |

## Design Token System

### Colors
| Token | Value | Usage |
|---|---|---|
| `bg-base` | `#F6F1EB` | Body background, hero, main sections |
| `bg-surface` | `#FAF7F3` | Card surfaces, slightly lighter cream |
| `bg-muted` | `#EDE5DC` | Story teaser, deeper cream sections |
| `bg-dark` | `#2B2B2B` | CTA banner, intentional dark rhythm break |
| `text-primary` | `#2B2B2B` | Headings, body text |
| `text-secondary` | `#7A7065` | Descriptors, body prose |
| `text-ghost` | `#9B8E82` | Labels, metadata, eyebrows |
| `accent` | `#8B6F4E` | Clay brown — CTAs, links, hover underlines |
| `border-subtle` | `#DDD4C8` | Hairline dividers, card borders |

### Typography
- **Serif**: Playfair Display — headings (`h1`–`h3`), product names, hero headline
- **Sans**: Montserrat — nav, body, labels, CTAs, eyebrows
- **Line height**: `leading-relaxed` (1.625) for body prose; `leading-snug` for large headings
- **Letter spacing**: `tracking-widest` on nav/labels; `tracking-tight` on large serif headings

## Component Specifications

### Global Layout (`layout.tsx`, `globals.css`)
- Body: `bg-[#F6F1EB] text-[#2B2B2B]`
- Load Playfair Display from Google Fonts alongside Montserrat
- Remove `GlowingCursor` (dark-theme artifact)
- `font-serif` CSS variable added to Tailwind config

### Navbar
- Background: `bg-[#F6F1EB]` with `border-b border-[#DDD4C8]` when scrolled (replaces `bg-black/40 backdrop-blur-xl`)
- On home before scroll: `bg-transparent` (cream page shows through naturally)
- Logo: `text-[#2B2B2B]`
- Nav links: `text-[#7A7065]` → `text-[#2B2B2B]` on hover; underline in `#8B6F4E`
- Mobile menu: `bg-[#F6F1EB]` full screen, dark charcoal links (replaces `bg-black/90`)
- Burger lines: `bg-[#2B2B2B]`

### Hero (`Hero.tsx`)
- Remove: background image, dark gradient overlay, orange glow orb, animated motion glow
- Add: pure cream background, large Playfair Display italic headline
- Eyebrow line: small caps Montserrat, `text-[#9B8E82]`, flanked by `#DDD4C8` hairline rules
- Headline: `font-serif text-5xl md:text-7xl font-normal leading-snug text-[#2B2B2B]`; `<em>` in `#8B6F4E`
- Subtext: Montserrat, `text-[#7A7065]`
- CTA primary: `bg-[#2B2B2B] text-[#F6F1EB]` rounded-sm; CTA secondary: clay underline link
- Remove `whileHover scale` spring animation on CTA; replace with gentle `opacity` transition

### BrandValues (`BrandValues.tsx`)
- Background: `bg-[#FAF7F3]` with `border-y border-[#DDD4C8]`
- Remove dark ambient glow radial gradient
- Icons: `text-[#8B6F4E]` (clay, uniform — remove per-item color overrides)
- Labels: `text-[#7A7065]`
- Hover: remove `y: -6` lift; replace with subtle `opacity` increase on label

### ScentGrid (`ScentGrid.tsx`)
- Background: `bg-[#F6F1EB]`
- Section heading: Playfair Display, `text-[#2B2B2B]`
- Remove dark radial glow
- Grid gap stays at `gap-10`

### ProductCard (`ProductCard.tsx`)
- Remove: `bg-white/[0.04] backdrop-blur-xl border border-white/10` glassmorphism card
- Remove: ambient glow div (`product.glowColor`)
- Remove: dark gradient overlay on image (`bg-gradient-to-t from-black/40`)
- Add: `bg-[#FAF7F3]` card, no border, `rounded-sm`
- Image hover: keep `scale-[1.04]` but remove `group-hover:opacity-20` cross-fade (too dark-theme)
- Hover image swap: keep logic, just remove opacity transition to near-invisible
- Highlight badge: `bg-[#F6F1EB] text-[#2B2B2B]` (already close, remove `text-black`)
- Seasonal overlay: `bg-[#F6F1EB]/80` with `text-[#7A7065]`
- Product name: Playfair Display, `text-[#2B2B2B]`
- Descriptor: `text-[#7A7065]`
- Mood label: `text-[#9B8E82]`
- Divider: `bg-[#DDD4C8]` (replaces `product.accentColor` colored divider)
- CTA link: `text-[#8B6F4E]` with underline (replaces `product.accentColor`)
- Hover lift: keep `whileHover y: -4` (reduce from -6), `transition duration-300`

### Products Page (`products/page.tsx`)
- Background: `bg-[#F6F1EB]`
- Remove dark radial glow
- Page title: Playfair Display
- Scent count text: `text-[#9B8E82]`

### Product Detail Page (`products/[slug]/page.tsx`)
- Background: `bg-[#F6F1EB]`
- Remove per-product `glowColor` ambient glow
- Image container: `bg-[#FAF7F3] border border-[#DDD4C8]` (remove `bg-white/5 border-white/10`)
- Back link: `text-[#9B8E82]` → `text-[#8B6F4E]` hover
- Product name: Playfair Display
- Scent notes section: `border-t border-[#DDD4C8]`
- Ingredient tags: `bg-[#FAF7F3] border border-[#DDD4C8] text-[#7A7065]`
- Add to cart button (disabled): `bg-[#EDE5DC] text-[#9B8E82]`
- Related products header: `text-[#9B8E82]`

### StoryTeaser (`StoryTeaser.tsx`)
- Background: `bg-[#EDE5DC]` (deeper cream for visual rhythm)
- Heading: Playfair Display
- Link: clay underline

### Testimonials (`Testimonials.tsx`)
- Background: `bg-[#FAF7F3]`
- Quote text: Playfair Display italic
- Attribution: Montserrat, `text-[#9B8E82]`

### CandleCareTeaser (`CandleCareTeaser.tsx`)
- Background: `bg-[#F6F1EB]`

### CtaBanner (`CtaBanner.tsx`)
- Background: `bg-[#2B2B2B]` — intentional dark break in cream rhythm
- Headline: Playfair Display, `text-[#F6F1EB]`
- Subtext: `text-[#F6F1EB]/55`
- Remove orange glow orb and moving animation
- CTA button: `bg-[#8B6F4E] text-[#FAF7F3]` rounded-sm

### Footer (`Footer.tsx`)
- Background: `bg-[#F6F1EB] border-t border-[#DDD4C8]`
- Logo: `text-[#2B2B2B]`
- Links: `text-[#9B8E82]` → `text-[#2B2B2B]` hover
- Remove orange radial glow
- Divider: `bg-[#DDD4C8]`
- Copyright: `text-[#9B8E82]`

### GlowingCursor (`ui/GlowingCursor.tsx`)
- Remove from layout entirely — dark-theme artifact, no equivalent in cream aesthetic

## Tailwind Config Changes
```ts
// Add to theme.extend:
fontFamily: {
  sans: ['var(--font-montserrat)', 'sans-serif'],
  serif: ['var(--font-playfair)', 'Georgia', 'serif'],  // new
},
colors: {
  // Replace existing cream/sand/sage/espresso/terracotta/amber tokens:
  cream: {
    base: '#F6F1EB',
    surface: '#FAF7F3',
    muted: '#EDE5DC',
  },
  charcoal: '#2B2B2B',
  clay: '#8B6F4E',
  border: '#DDD4C8',
  ink: {
    primary: '#2B2B2B',
    secondary: '#7A7065',
    ghost: '#9B8E82',
  },
}
```

## Micro-interactions
- All transitions: `duration-300 ease-out` (remove spring physics on hover)
- Hover states: opacity shifts, subtle translate-y (-2px max), underline grows
- No scale-up on CTA buttons (removes "bouncy" feel)
- Image hover: keep scale-[1.04] on product images only
- Page entry animations: keep `initial opacity-0 y-30` reveals via Framer Motion — they read as editorial pacing, not flashy

## Files to Change
1. `tailwind.config.ts`
2. `src/app/[locale]/layout.tsx`
3. `src/app/globals.css`
4. `src/components/layout/Navbar.tsx`
5. `src/components/home/Hero.tsx`
6. `src/components/home/BrandValues.tsx`
7. `src/components/home/ScentGrid.tsx`
8. `src/components/home/StoryTeaser.tsx`
9. `src/components/home/Testimonials.tsx`
10. `src/components/home/CandleCareTeaser.tsx`
11. `src/components/home/CtaBanner.tsx`
12. `src/components/products/ProductCard.tsx`
13. `src/app/[locale]/products/page.tsx`
14. `src/app/[locale]/products/[slug]/page.tsx`
15. `src/components/layout/Footer.tsx`
16. `src/components/ui/GlowingCursor.tsx` (delete import from layout)
