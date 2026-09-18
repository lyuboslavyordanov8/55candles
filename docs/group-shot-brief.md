# Collection group shot — art direction brief

For the five-candle "all products together" hero. Written against the actual
product mains in `public/images/products/` (`electric-cherry.webp`,
`strawberry-cake.webp`, `espresso-martini.webp`, `sweet-orange.webp`,
`vanilla-egg.webp`) and the high-res sources in `docs/*.png`.

Attach **all five mains as reference images** to whichever tool you use. The
prompt below is written to be pasted as-is.

## The product, as it actually is

Shared across all five — get this wrong and the shot is off-brand:

- Sardine-style round tin, ~85 mm across, ~40 mm tall, **gold/brass rolled rim**.
- The peel-back lid is **rolled open and standing upright at the back** like a
  half-dome shell, bare silver aluminium with concentric pressed ribs; the
  **pull-ring tab** sits at its top edge.
- **Two cotton wicks** per candle, side by side.
- Label: cream rectangular panel centred on the tin wall — `55° candles` small
  and light above, the product name in a **bold italic serif**, then
  `250G | 30H | SOY WAX`. The panel sits on a printed illustrated band that
  wraps the tin, different per scent.

Per scent — band artwork / wax fill:

| Candle | Printed band | Wax inside |
|---|---|---|
| Electric Cherry | pale sky blue, red cherries, olive-green leaves | cluster of deep crimson sculpted cherries |
| Strawberry Cake | soft pink, red strawberries, pale blue accents | cluster of pink-red sculpted strawberries, seed dimples |
| Espresso Martini | cream/beige, dark coffee beans, deep plum shapes, small white flower | smooth ivory wax, three sculpted coffee beans centred |
| Sweet Orange | blush peach, citrus blossom, dark green leaves | cluster of bright orange sculpted mandarin segments |
| Vanilla Egg | pale butter cream, burgundy accents | white wax with a single sculpted fried egg, yellow yolk |

## Staging

All five tins are the same height, so "height variation" has to come from depth,
not from stacking — risers would fight the reflection.

- **Back row (2):** Espresso Martini left of centre, Vanilla Egg right of centre.
- **Front row (3):** Sweet Orange left, Electric Cherry centre (hero, slightly
  forward of the other two), Strawberry Cake right.
- Rotate each tin a few degrees differently so every label stays readable but no
  two sit parallel. Vary the open lids' angles — one turned slightly outward.
- Stagger the front row's depth by 10–20 mm each; leave 15–25 mm of air between
  neighbours. Nothing should overlap a label.
- Generous negative space: the group occupies the middle ~60 % of frame.

## Camera, light, surface

- 100 mm macro equivalent, f/8–f/11 so all five stay sharp front to back.
- Camera ~15° above the tabletop — high enough to see the wax fills, low enough
  that the tins still read as standing objects.
- 1:1 square (matches the existing mains) or 4:5 for the site hero.
- Seamless white sweep, **white acrylic base** so each tin gets the soft mirror
  reflection the current mains have.
- One large softbox upper-right at ~45°, white bounce card opposite to open the
  shadows, short soft shadows falling left-forward.
- Wicks: unlit, trimmed. Five lit flames in one frame reads as a fire hazard, not
  a product shot.

## Complementary element — pick one

**Recommended: a single pair of fresh dark-red cherries on the stem**, resting on
the surface front-left, ~20 mm each so the scale against an 85 mm tin is
believable. It ties to the hero product and stays in the collection's palette.

Optionally three loose coffee beans near the Espresso Martini tin. That is the
ceiling — nothing more.

**Not** an espresso martini glass: a coupe is roughly ten times the visual mass
of a tin, so it stops being a supporting element and becomes the subject.

## Prompt

> Professional studio product photograph of five scented candles in sardine-style
> tins, shot together as one collection. Seamless pure white studio background,
> white acrylic surface with soft realistic reflections beneath each tin.
>
> Reproduce the five candles exactly as shown in the reference images — same tins,
> same gold rolled rims, same upright peeled-open aluminium lids with pull rings,
> same printed label bands and wax fills. Do not redesign, restyle, recolour or
> invent any candle, label or typography.
>
> Arrangement: two tins in the back row, three in the front row, each rotated a
> few degrees differently so every cream label panel faces the camera and remains
> readable, front row staggered slightly in depth, small gaps between all five, no
> tin overlapping another's label. Comfortable negative space around the group.
>
> One pair of fresh dark-red cherries on the stem resting on the surface at the
> front left, true to life at about 20 mm across against the 85 mm tins.
>
> 100 mm macro lens look, f/9, camera slightly above table height, large soft
> key light from the upper right at 45 degrees, white fill opposite, short soft
> natural shadows. Accurate materials: brushed aluminium lids, brass-gold rims,
> matte printed paper labels, soft matte soy wax. Wicks unlit and trimmed.
> High-end commercial product photography, photorealistic, tack sharp, clean and
> minimal. Square 1:1.

**Negative / exclude:** hands, fingers, arms, matches, lit flames, smoke, extra
or duplicate candles, sixth candle, invented scents, altered labels, garbled
text, bowls of fruit, flowers, cocktail glasses, cutlery, linen, wood boards,
props, coloured backgrounds, gradients, vignettes, harsh shadows, studio
equipment in frame.

The hands-and-match exclusion matters: **every one of the five references has a
hand lighting a match in it**, and a reference-following model will happily give
you five hands.

## Reviewing the output

Reject and re-run unless all of these hold:

1. Exactly five tins — no sixth, no duplicate scent.
2. `55° candles` and `250G | 30H | SOY WAX` legible and correctly spelled on
   every label; the name in bold italic serif.
3. Gold rim on all five; lids bare silver, upright, pull ring present.
4. Two wicks per candle.
5. Wax fills match the table above (no strawberries in the cherry tin).
6. Cherries in believable proportion — they should look small next to a tin.
7. No hands, no flames.

Expect the small label text to be the failure point. The reliable fix is to
generate the scene and then **composite the real label crops back in** from the
mains in Photoshop — or, since the products are in hand, shoot it for real: one
white acrylic sheet, one window, a bounce card, and this staging plan gets a
better result than any generation.
