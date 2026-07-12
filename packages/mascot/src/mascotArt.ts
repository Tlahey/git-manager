/**
 * mascotArt — the single source of truth for the Git Manager octopus mascot.
 *
 * Framework-agnostic: exports the SVG markup + scoped CSS as strings so the
 * exact same artwork and "natural movement" animations can be rendered by the
 * Web Component (`<git-mascot>`, used by the landing page) and the React
 * wrapper (`<OctopusMascot>`, used by the desktop app). Nothing here imports
 * React or touches the DOM — see `GitMascotElement.ts` and `OctopusMascot.tsx`
 * for the two thin adapters, and `behaviors.ts` for the JS-driven movements.
 *
 * ── How the artwork is built ──────────────────────────────────────────────
 * The octopus is assembled from the brand sprite sheet: a faceless head,
 * eight individual tentacles (t8 is the darker back one, for depth) and
 * reusable face parts (one pupil sprite for both eyes, one eyelid curve used
 * for blinking and as the mouth). Parts are laid out on a 1000×1000 stage as
 * SVG `<image>` elements; every limb's root is tucked under the head, which
 * is painted after the limbs.
 *
 * The editable sources live in `assets/` (sprites.png + layout.json, the
 * Storybook Layout editor's export); `pnpm generate` turns them into the
 * committed `src/generated/` modules imported here — placements, paint
 * order, pivots and animation params all come from there. This file owns
 * what generation can't: the face math, the markup/CSS assembly, and the
 * animation system.
 *
 * Because every limb is its own sprite, each one animates independently — a
 * gentle rotation around its root anchor (`--gm-px/--gm-py`), with per-limb
 * amplitude (`--gm-amp`, in degrees), duration and phase. Blinking swaps the
 * pupils for eyelid curves via opacity keyframes.
 *
 * Rotations use an explicit translate→rotate→translate pattern instead of
 * `transform-origin` (inconsistent for SVG across engines), and every
 * keyframe repeats the full transform list with the same pivot values —
 * interpolating from `none` would drift the content toward the pivot
 * mid-transition instead of deforming in place.
 */

import { SPRITES, type SpriteDef } from './generated/sprites'
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
 * Limbs in paint order (back → front) and the head, straight from the
 * generated layout (assets/layout.json → src/generated/layout.ts). The
 * depth order recorded there was measured off the filled-color reference:
 * connected-component analysis of its isolated "spiral hole" per tentacle
 * tip showed the outer pair's holes fully intact while the middle pair's
 * were partly covered — the reference itself paints middle behind outer,
 * inner pair frontmost (forming the bottom "heart" gap), upper arms
 * backmost. t8 is drawn pre-mirrored vs t5 (same silhouette, recolored
 * darker) so it's placed unflipped; the darker recolor is its depth cue.
 * Zone naming gotcha: t6 is the *left* inner arm and t7 the right one —
 * each roots near the center line and drifts outward as it descends,
 * which forms the heart gap without the limbs crossing.
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

/**
 * Eye/mouth placement, measured (not guessed) off the brand's filled-color
 * companion reference (same character family as the sprite sheet, and a much
 * closer analog to it than the line-art reference used previously — solid
 * fill + a distinct white sclera, same as what we render here) and
 * transferred onto this head sprite's own geometry:
 *   - analyzed at the reference's native 2048px: connected-component
 *     labeling of near-white pixels (excluding the component touching the
 *     image border, which is the page background) isolated the eye whites
 *     as two ~123px-diameter blobs at (901.5,859.5) and (1146.5,859.0) —
 *     symmetric around the head's own center axis (x=1024, confirmed below)
 *     to within 0.4px. The same technique on near-navy pixels found the
 *     pupils as ~82px-diameter solid discs (not rings — there's no separate
 *     outline stroke on the whites) centered inside them, and the mouth as
 *     an isolated blob 121×40 at (1023.5,960);
 *   - the reference head's crown sits at y=383, and its own max half-width
 *     (needed because unlike the line-art reference this one is solid-fill,
 *     so the edge is found by ray-casting outward from the center axis
 *     until the first *background* pixel, not the first ink pixel) is 627,
 *     found around y=690–740, comfortably above where the eyes start
 *     interfering with the ray;
 *   - dividing this head sprite's actual width (339, from its own alpha
 *     bbox) by that reference max width gives a transfer scale (≈0.541).
 * Each eye = authored white ball (flat, no outline — the reference has none
 * either) + the pupil sprite scaled down inside it, same 0.666 diameter
 * ratio as measured.
 */
const HEAD_REF_MAX_WIDTH = 627
const HEAD_REF_SCALE = HEAD.sprite.w / HEAD_REF_MAX_WIDTH
const EYES = [
  { cx: HEAD.x + 169.5 - 122.5 * HEAD_REF_SCALE, cy: HEAD.y + 476.25 * HEAD_REF_SCALE },
  { cx: HEAD.x + 169.5 + 122.5 * HEAD_REF_SCALE, cy: HEAD.y + 476.25 * HEAD_REF_SCALE },
] as const
const EYE_WHITE_R = 61.4 * HEAD_REF_SCALE
const PUPIL_SCALE = (EYE_WHITE_R * 2 * 0.666) / SPRITES.eye.w
const LID_SCALE = (EYE_WHITE_R * 2) / SPRITES.eyelid.w
const MOUTH = {
  cx: HEAD.x + 169.5,
  cy: HEAD.y + 577 * HEAD_REF_SCALE,
  scale: ((121 * HEAD_REF_SCALE) / SPRITES.eyelid.w + (40 * HEAD_REF_SCALE) / SPRITES.eyelid.h) / 2,
}

/**
 * The full rig, exposed for the package's Storybook (parts gallery, rig
 * debugger, reference-alignment overlays, layout editor). Not part of the
 * consumer-facing API — apps should only use `<git-mascot>`/`OctopusMascot`.
 *
 * `reference` describes the brand illustration the face/depth measurements
 * were taken from (its native pixel space): the head-crown point and the
 * head's max width, which together define the affine mapping between
 * reference pixels and stage units (see the placement comments above).
 */
export const MASCOT_LAYOUT = {
  stage: { width: 1000, height: 1000 },
  viewBox: MASCOT_VIEWBOX,
  head: HEAD,
  limbs: LIMBS,
  eyes: EYES,
  eyeWhiteR: EYE_WHITE_R,
  pupilScale: PUPIL_SCALE,
  lidScale: LID_SCALE,
  mouth: MOUTH,
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

function centered(s: SpriteDef, cx: number, cy: number, scale: number): string {
  return image(s, cx - (s.w * scale) / 2, cy - (s.h * scale) / 2, scale)
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
      ${Object.keys(LIMBS).map(limb).join('')}

      <!-- Head painted last so every limb root tucks under the skirt -->
      ${image(HEAD.sprite, HEAD.x, HEAD.y, HEAD.scale)}

      <!-- ══ FACE — authored eye whites; pupils (eye-tracking) swap with eyelids while blinking ══ -->
      <g class="gm-eye-whites">
        ${EYES.map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${EYE_WHITE_R}" fill="#fdfefe"/>`).join('')}
      </g>
      <g class="gm-pupils">
        ${EYES.map(
          (e) => `<g class="${MASCOT_SELECTORS.pupil}" data-cx="${e.cx}" data-cy="${e.cy}">
          ${centered(SPRITES.eye, e.cx, e.cy, PUPIL_SCALE)}
        </g>`
        ).join('')}
      </g>
      <g class="gm-lids">
        ${EYES.map((e) => centered(SPRITES.eyelid, e.cx, e.cy, LID_SCALE)).join('')}
      </g>
      ${centered(SPRITES.eyelid, MOUTH.cx, MOUTH.cy, MOUTH.scale)}
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
/* Blink: pupils and eyelid curves cross-fade briefly. */
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
