/**
 * mascotArt — the single source of truth for the Git Manager octopus mascot.
 *
 * Framework-agnostic: exports the SVG markup + scoped CSS as strings so the
 * exact same artwork and "natural movement" animations can be rendered by the
 * Web Component (`<git-mascot>`, used by the landing page) and the React
 * wrapper (`<OctopusMascot>`, used by the desktop app). Nothing here imports
 * React or touches the DOM — see `GitMascotElement.ts` and `OctopusMascot.tsx`
 * for the two thin adapters, and `behaviors.ts` for the JS-driven eye tracking.
 *
 * ── How the artwork is built ──────────────────────────────────────────────
 * The octopus is assembled from the brand sprite sheet: a head (mouth and eye
 * whites/pupils baked into the art by the artist) and eight individual
 * tentacles. Parts are laid out on a 1000×1000 stage as SVG `<image>`
 * elements; every limb's root is tucked under the head, which is painted
 * after the limbs.
 *
 * The baked-in pupils can't move on their own, so each eye gets a thin code-
 * drawn overlay on top of the head: a flat circle in the eye-white's own
 * color masks the baked pupil, then a redrawn pupil + highlight (same size,
 * same rest position) sits on top of that mask — free to be pushed around by
 * `behaviors.ts`'s `attachEyeTracking` or the idle CSS glance animation
 * without ever uncovering the original baked pupil. A blink cross-fades that
 * pupil group with a drawn eyelid curve. The eye geometry (centers, radii,
 * highlight offset) below was measured directly off the head sprite via
 * connected-component analysis of its near-white/near-navy pixels (see the
 * `EYES`/`PUPIL_R`/etc. constants) — re-measure and update if the head
 * artwork is ever regenerated with a different face.
 *
 * The editable sources live in `assets/` (sprites.png + layout.json, the
 * Storybook Layout editor's export); `pnpm generate` turns them into the
 * committed `src/generated/` modules imported here — placements, paint
 * order, pivots and animation params all come from there. This file owns
 * what generation can't: the eye math, the markup/CSS assembly, and the
 * animation system.
 *
 * Because every limb is its own sprite, each one animates independently — a
 * gentle rotation around its root anchor (`--gm-px/--gm-py`), with per-limb
 * amplitude (`--gm-amp`, in degrees), duration and phase. Blinking cross-
 * fades the pupil overlay with the eyelid curve via opacity keyframes.
 *
 * Rotations use an explicit translate→rotate→translate pattern instead of
 * `transform-origin` (inconsistent for SVG across engines), and every
 * keyframe repeats the full transform list with the same pivot values —
 * interpolating from `none` would drift the content toward the pivot
 * mid-transition instead of deforming in place.
 */

import type { SpriteDef } from './generated/sprites'
import { PLACEMENTS } from './generated/layout'

export const MASCOT_VIEWBOX = { minX: 30, minY: 40, width: 940, height: 900 } as const

/** Class names / selectors shared between the markup and the behavior helpers. */
export const MASCOT_SELECTORS = {
  root: 'gm-svg',
  pupil: 'gm-pupil',
} as const

export interface LimbSpec {
  sprite: SpriteDef
  /** Stage position of the sprite's top-left corner, and its static pose. */
  x: number
  y: number
  scale: number
  rot: number
  /** Mirror horizontally around the vertical line through `x` — the flipped
   * sprite occupies [x−w·scale, x]. For reusing one drawn tentacle shape on
   * both sides when no true mirror asset exists. */
  flip?: boolean
  /** Root anchor (under the head) the limb sways around. */
  px: number
  py: number
  /** Sway amplitude in degrees, cycle duration in s, phase delay in s. */
  amp: number
  dur: number
  delay: number
}

/**
 * Limbs keyed by zone, straight from the generated layout
 * (assets/layout.json → src/generated/layout.ts). All eight tentacles are
 * individually drawn (no flips); their placements were derived by
 * outline-matching each sprite against the brand reference (each was drawn
 * 1:1 over it). The paint order — including where the head sits in it —
 * comes from PLACEMENTS: the markup renders that array as-is, so layers can
 * be freely reordered in the Storybook Layout editor (currently the upper
 * arms are painted *over* the head).
 * Zone naming gotcha (ids ≠ position): t1 is the upper *right* arm and t4
 * the upper left; t2/t3 the mid left/right; t5/t8 the outer left/right;
 * t6/t7 the inner left/right.
 */
const LIMBS: Record<string, LimbSpec> = Object.fromEntries(
  PLACEMENTS.filter((p) => p.role !== 'head').map((p) => [
    p.zone,
    {
      sprite: p.sprite,
      x: p.x,
      y: p.y,
      scale: p.scale,
      rot: p.rot,
      flip: p.flip || undefined,
      px: p.pivot.x,
      py: p.pivot.y,
      amp: p.anim.amp,
      dur: p.anim.dur,
      delay: p.anim.delay,
    },
  ])
)

const headPlacement = PLACEMENTS.find((p) => p.role === 'head')
if (!headPlacement) throw new Error('generated layout has no head placement')
const HEAD = {
  sprite: headPlacement.sprite,
  x: headPlacement.x,
  y: headPlacement.y,
  scale: headPlacement.scale,
}

/** The brand reference illustration's native pixel geometry, used only to
 * align the Storybook ghost overlay onto this head sprite (see
 * `stories/rigUtils.tsx`'s `referenceFrame`) — the head crown point and the
 * head's max width together define the affine mapping between reference
 * pixels and stage units. */
const HEAD_REF_MAX_WIDTH = 627

/**
 * Eye overlay geometry, measured directly off this head sprite's own pixels
 * (633×729 at generation time) rather than an external reference: connected-
 * component labeling of its near-white pixels isolated the two eye whites as
 * ~131px-diameter blobs centered at (193,474) and (439,474) — symmetric
 * around the head's horizontal center (316.5) to within 1px — plus two small
 * ~20px "shine" blobs at consistent offsets inside them. The same technique
 * on near-navy pixels found the baked pupils as ~65px-diameter solid discs
 * dead-centered in each white. Converted to stage units via this head
 * placement's own `x/y/scale` (no external transfer scale needed, since the
 * measurement was taken on the exact deployed asset).
 */
const EYE_HALF_SPACING_LOCAL = 123 // px, from head sprite's horizontal center
const EYE_CY_LOCAL = 474.4 // px
const PUPIL_R_LOCAL = 32.5 // px, baked pupil radius
const EYE_COVER_R_LOCAL = 36 // px, just past the baked pupil + its shine highlight
const HIGHLIGHT_R_LOCAL = 10 // px
const HIGHLIGHT_OFFSET_LOCAL = { dx: 12.2, dy: -16 } // px, from pupil center

const EYES = [
  {
    cx: HEAD.x + (HEAD.sprite.w / 2 - EYE_HALF_SPACING_LOCAL) * HEAD.scale,
    cy: HEAD.y + EYE_CY_LOCAL * HEAD.scale,
  },
  {
    cx: HEAD.x + (HEAD.sprite.w / 2 + EYE_HALF_SPACING_LOCAL) * HEAD.scale,
    cy: HEAD.y + EYE_CY_LOCAL * HEAD.scale,
  },
] as const
const PUPIL_R = PUPIL_R_LOCAL * HEAD.scale
const EYE_COVER_R = EYE_COVER_R_LOCAL * HEAD.scale
const HIGHLIGHT_R = HIGHLIGHT_R_LOCAL * HEAD.scale
const HIGHLIGHT_OFFSET = {
  dx: HIGHLIGHT_OFFSET_LOCAL.dx * HEAD.scale,
  dy: HIGHLIGHT_OFFSET_LOCAL.dy * HEAD.scale,
}
/** Flat fill colors sampled off the head sprite (eye white, baked-pupil ink, shine). */
const EYE_COVER_FILL = '#fefefe'
const PUPIL_FILL = '#141937'
const HIGHLIGHT_FILL = '#ffffff'

/**
 * The full rig, exposed for the package's Storybook (parts gallery, rig
 * debugger, reference-alignment overlays, layout editor). Not part of the
 * consumer-facing API — apps should only use `<git-mascot>`/`OctopusMascot`.
 */
export const MASCOT_LAYOUT = {
  stage: { width: 1000, height: 1000 },
  viewBox: MASCOT_VIEWBOX,
  head: HEAD,
  limbs: LIMBS,
  /** Zones in paint order (first = furthest back), head included. */
  order: PLACEMENTS.map((p) => p.zone),
  eyes: EYES,
  pupilR: PUPIL_R,
  eyeCoverR: EYE_COVER_R,
  reference: {
    size: 2048,
    crown: { x: 1024, y: 383 },
    headMaxWidth: HEAD_REF_MAX_WIDTH,
  },
} as const

/**
 * `flip` mirrors the sprite horizontally in place — i.e. around its own
 * vertical centerline, not the stage origin — by rotating first (`rot`,
 * around x,y, same as the non-flipped case) and then reflecting that result
 * around the vertical line through x (`translate(2x,0) scale(-1,1)`, applied
 * outermost so it acts on the already-rotated shape). SVG transform lists
 * compose right-to-left onto the point, so the rightmost entry (`rotate`) is
 * the one applied first.
 */
function image(s: SpriteDef, x: number, y: number, scale: number, rot = 0, flip = false): string {
  const rotate = rot ? `rotate(${rot} ${x} ${y})` : ''
  const transform = flip ? `translate(${2 * x} 0) scale(-1 1) ${rotate}` : rotate
  const t = transform ? ` transform="${transform}"` : ''
  return `<image href="${s.uri}" x="${x}" y="${y}" width="${s.w * scale}" height="${s.h * scale}"${t}/>`
}

function limb(name: string): string {
  const l = LIMBS[name]
  return `
      <g class="gm-arm gm-arm--${name}">
        ${image(l.sprite, l.x, l.y, l.scale, l.rot, l.flip)}
      </g>`
}

/**
 * The movable eye overlay: an opaque cover (hides the baked pupil), a
 * redrawn pupil + highlight on top of it (tracked by `attachEyeTracking`/the
 * idle glance animation), and a blink lid curve that cross-fades with the
 * pupil. Rendered right after the head image so it shares the head's paint-
 * order slot — any limb painted over the head in `PLACEMENTS` still occludes
 * the eyes along with it.
 */
function eyesOverlay(): string {
  const covers = EYES.map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${EYE_COVER_R}" fill="${EYE_COVER_FILL}"/>`).join('')
  const pupils = EYES.map(
    (e) => `<g class="${MASCOT_SELECTORS.pupil}" data-cx="${e.cx}" data-cy="${e.cy}">
          <circle cx="${e.cx}" cy="${e.cy}" r="${PUPIL_R}" fill="${PUPIL_FILL}"/>
          <circle cx="${e.cx + HIGHLIGHT_OFFSET.dx}" cy="${e.cy + HIGHLIGHT_OFFSET.dy}" r="${HIGHLIGHT_R}" fill="${HIGHLIGHT_FILL}"/>
        </g>`
  ).join('')
  const lidHalfWidth = EYE_COVER_R * 0.85
  const lidBow = EYE_COVER_R * 0.55
  const lidStroke = EYE_COVER_R * 0.28
  const lids = EYES.map(
    (e) =>
      `<path d="M ${e.cx - lidHalfWidth} ${e.cy} Q ${e.cx} ${e.cy + lidBow} ${e.cx + lidHalfWidth} ${e.cy}" stroke="${PUPIL_FILL}" stroke-width="${lidStroke}" stroke-linecap="round" fill="none"/>`
  ).join('')
  return `
      <g class="gm-eye-cover">${covers}</g>
      <g class="gm-pupils">${pupils}</g>
      <g class="gm-lids">${lids}</g>`
}

export const MASCOT_MARKUP = /* html */ `
<svg class="${MASCOT_SELECTORS.root}" viewBox="${MASCOT_VIEWBOX.minX} ${MASCOT_VIEWBOX.minY} ${MASCOT_VIEWBOX.width} ${MASCOT_VIEWBOX.height}" xmlns="http://www.w3.org/2000/svg" role="img">
  <defs>
    <radialGradient id="gm-shadow-grad" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#12305f" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#12305f" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <ellipse class="gm-shadow" cx="500" cy="888" rx="240" ry="20" fill="url(#gm-shadow-grad)"/>

  <g class="gm-float">
    <g class="gm-breathe">
      <!-- Parts strictly in the generated paint order; the head (mouth baked
           into the art, eyes overlaid on top) sits wherever the layout put
           it in that order -->
      ${PLACEMENTS.map((p) =>
        p.role === 'head' ? `
      ${image(HEAD.sprite, HEAD.x, HEAD.y, HEAD.scale)}
      ${eyesOverlay()}` : limb(p.zone)
      ).join('')}
    </g>
  </g>
</svg>`

/**
 * Scoped CSS for the mascot's natural movements. Written for a Shadow DOM (Web
 * Component). All continuous motion is gated behind
 * `prefers-reduced-motion: no-preference`. When `data-tracking` is present the
 * idle pupil glances are disabled so the JS eye-tracking can take over.
 */
export const MASCOT_STYLES = /* css */ `
:host {
  display: inline-block;
  line-height: 0;
  /* Default footprint; the size attribute sets --gm-size, and outer-page CSS
     (e.g. .octopus { width: ... }) can still override the host width for
     responsive layouts since class selectors beat :host in the cascade. */
  width: var(--gm-size, 320px);
}
.${MASCOT_SELECTORS.root} {
  width: 100%;
  height: auto;
  overflow: visible;
  display: block;
}

.gm-lids { opacity: 0; }

@media (prefers-reduced-motion: no-preference) {
  .gm-float   { animation: gm-float 6s ease-in-out infinite; }
  .gm-breathe { animation: gm-breathe 4.5s ease-in-out infinite; }
  .gm-shadow  { animation: gm-shadow 6s ease-in-out infinite; }
  .gm-pupils  { animation: gm-pupils-blink 6.5s infinite; }
  .gm-lids    { animation: gm-lids-blink 6.5s infinite; }

  ${Object.entries(LIMBS)
    .map(
      ([name, l]) =>
        `.gm-arm--${name} { --gm-px: ${l.px}px; --gm-py: ${l.py}px; --gm-amp: ${l.amp}; animation: gm-wave ${l.dur}s ease-in-out infinite ${l.delay}s; }`
    )
    .join('\n  ')}

  .${MASCOT_SELECTORS.root}:not([data-tracking]) .${MASCOT_SELECTORS.pupil} {
    animation: gm-look 7s ease-in-out infinite;
  }
}

/* Static mode (animated="false"): kill every continuous animation. */
.${MASCOT_SELECTORS.root}[data-static] * { animation: none !important; }

.${MASCOT_SELECTORS.pupil} { transition: transform 0.12s ease-out; }

/* Every keyframe repeats the full pivot pattern (see module doc). */
@keyframes gm-wave {
  0%, 100% { transform: translate(var(--gm-px, 500px), var(--gm-py, 500px)) rotate(0deg) translate(calc(-1 * var(--gm-px, 500px)), calc(-1 * var(--gm-py, 500px))); }
  30% { transform: translate(var(--gm-px, 500px), var(--gm-py, 500px)) rotate(calc(var(--gm-amp, 2) * 1deg)) translate(calc(-1 * var(--gm-px, 500px)), calc(-1 * var(--gm-py, 500px))); }
  70% { transform: translate(var(--gm-px, 500px), var(--gm-py, 500px)) rotate(calc(var(--gm-amp, 2) * -0.7deg)) translate(calc(-1 * var(--gm-px, 500px)), calc(-1 * var(--gm-py, 500px))); }
}
@keyframes gm-float {
  0%, 100% { transform: translateY(0px) translate(500px,480px) rotate(0deg) translate(-500px,-480px); }
  30% { transform: translateY(-14px) translate(500px,480px) rotate(1.2deg) translate(-500px,-480px); }
  70% { transform: translateY(-8px) translate(500px,480px) rotate(-0.9deg) translate(-500px,-480px); }
}
@keyframes gm-breathe {
  0%, 100% { transform: translate(500px,830px) scale(1, 1) translate(-500px,-830px); }
  50% { transform: translate(500px,830px) scale(0.988, 1.018) translate(-500px,-830px); }
}
@keyframes gm-shadow {
  0%, 100% { transform: translateX(500px) scaleX(1) translateX(-500px);    opacity: 0.85; }
  30% { transform: translateX(500px) scaleX(0.84) translateX(-500px);      opacity: 0.45; }
  70% { transform: translateX(500px) scaleX(0.92) translateX(-500px);      opacity: 0.65; }
}
/* Blink: pupils and the eyelid curve cross-fade briefly. */
@keyframes gm-pupils-blink {
  0%, 91.5%, 98%, 100% { opacity: 1; }
  93%, 96.5% { opacity: 0; }
}
@keyframes gm-lids-blink {
  0%, 91.5%, 98%, 100% { opacity: 0; }
  93%, 96.5% { opacity: 1; }
}
/* Amplitudes kept under MAX_PUPIL_OFFSET's margin (behaviors.ts) so idle
   glances never carry the pupil past the white's edge. */
@keyframes gm-look {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(6px, -4px); }
  50% { transform: translate(-5px, 5px); }
  80% { transform: translate(4px, 3px); }
}`
