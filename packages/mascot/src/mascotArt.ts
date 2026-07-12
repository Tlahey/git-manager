/**
 * mascotArt — the single source of truth for the Git Manager octopus mascot.
 *
 * Framework-agnostic: exports the SVG markup + scoped CSS as strings so the
 * exact same artwork and "natural movement" animations can be rendered by the
 * Web Component (`<git-mascot>`, used by the landing page) and the React
 * wrapper (`<OctopusMascot>`, used by the desktop app). Nothing here imports
 * React or touches the DOM — see `GitMascotElement.ts` and `OctopusMascot.tsx`
 * for the two thin adapters.
 *
 * ── How the artwork is built ──────────────────────────────────────────────
 * The octopus is assembled from the brand sprite sheet: a head (face baked
 * into the art — eyes and mouth are drawn by the artist, not composed here)
 * and eight individual tentacles. Parts are laid out on a 1000×1000 stage as
 * SVG `<image>` elements; every limb's root is tucked under the head, which
 * is painted after the limbs.
 *
 * The editable sources live in `assets/` (sprites.png + layout.json, the
 * Storybook Layout editor's export); `pnpm generate` turns them into the
 * committed `src/generated/` modules imported here — placements, paint
 * order, pivots and animation params all come from there. This file owns
 * what generation can't: the markup/CSS assembly and the animation system.
 *
 * Because every limb is its own sprite, each one animates independently — a
 * gentle rotation around its root anchor (`--gm-px/--gm-py`), with per-limb
 * amplitude (`--gm-amp`, in degrees), duration and phase.
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

/** Class names / selectors shared between the markup and consumers. */
export const MASCOT_SELECTORS = {
  root: 'gm-svg',
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
      <!-- Parts strictly in the generated paint order; the head (face baked
           into the art) sits wherever the layout put it in that order -->
      ${PLACEMENTS.map((p) =>
        p.role === 'head' ? `
      ${image(HEAD.sprite, HEAD.x, HEAD.y, HEAD.scale)}` : limb(p.zone)
      ).join('')}
    </g>
  </g>
</svg>`

/**
 * Scoped CSS for the mascot's natural movements. Written for a Shadow DOM (Web
 * Component). All continuous motion is gated behind
 * `prefers-reduced-motion: no-preference`.
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

@media (prefers-reduced-motion: no-preference) {
  .gm-float   { animation: gm-float 6s ease-in-out infinite; }
  .gm-breathe { animation: gm-breathe 4.5s ease-in-out infinite; }
  .gm-shadow  { animation: gm-shadow 6s ease-in-out infinite; }

  ${Object.entries(LIMBS)
    .map(
      ([name, l]) =>
        `.gm-arm--${name} { --gm-px: ${l.px}px; --gm-py: ${l.py}px; --gm-amp: ${l.amp}; animation: gm-wave ${l.dur}s ease-in-out infinite ${l.delay}s; }`
    )
    .join('\n  ')}
}

/* Static mode (animated="false"): kill every continuous animation. */
.${MASCOT_SELECTORS.root}[data-static] * { animation: none !important; }

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
}`
