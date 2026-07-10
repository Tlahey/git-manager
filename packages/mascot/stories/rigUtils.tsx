/**
 * rigUtils — shared helpers for the mascot's debug Storybook.
 *
 * Storybook-only: renders the rig data (`MASCOT_LAYOUT`) as plain HTML
 * `<img>`s so parts can be inspected, toggled and hovered individually —
 * something the production SVG string can't offer. The CSS transform math
 * mirrors `mascotArt.ts`'s `image()` exactly (see `partStyle`), so what these
 * stories show is what the component renders.
 */

import type { CSSProperties, ReactNode } from 'react';
import { MASCOT_LAYOUT } from '../src/mascotArt';
import referenceUrl from './assets/reference.png';

export { MASCOT_LAYOUT };
export { SPRITES } from '../src/generated/sprites';
export { referenceUrl };

export interface PartPlacement {
  x: number;
  y: number;
  scale: number;
  rot: number;
  flip?: boolean;
}

/**
 * CSS equivalent of mascotArt's SVG placement transform. With
 * `transform-origin: 0 0` and the element's top-left at (x,y), the CSS list
 * `scale(-1,1) rotate(r)` composes to the same matrix as the SVG
 * `translate(2x 0) scale(-1 1) rotate(r x y)` (both apply right-to-left onto
 * local points), so a flipped part occupies [x−w·s, x] on the stage exactly
 * like in the shipped markup.
 */
export function partStyle(p: PartPlacement, spriteW: number): CSSProperties {
  return {
    position: 'absolute',
    left: p.x,
    top: p.y,
    width: spriteW * p.scale,
    transformOrigin: '0 0',
    transform: `${p.flip ? 'scale(-1,1) ' : ''}rotate(${p.rot}deg)`,
  };
}

/**
 * Where the brand reference image must be drawn (in stage units) so that its
 * head aligns with the rig's head sprite: the mapping is defined by the two
 * measurements recorded in MASCOT_LAYOUT.reference — the crown point of the
 * reference head (pinned to the head sprite's own crown, i.e. the top-center
 * of its box) and the reference head's max width (setting the scale, since
 * the head sprite is drawn at scale 1).
 */
export function referenceFrame() {
  const { head, reference } = MASCOT_LAYOUT;
  const k = head.sprite.w / reference.headMaxWidth; // stage units per reference px
  const crownX = head.x + (head.sprite.w * head.scale) / 2;
  return {
    left: crownX - reference.crown.x * k,
    top: head.y - reference.crown.y * k,
    width: reference.size * k,
  };
}

/**
 * A fixed-size viewport that shows the 1000×1000 stage scaled to `width`px.
 * Children are laid out in raw stage units; the wrapper scales them all.
 */
export function Stage({
  width = 700,
  background = '#0a1830',
  children,
}: {
  width?: number;
  background?: string;
  children: ReactNode;
}) {
  const { width: sw, height: sh } = MASCOT_LAYOUT.stage;
  const k = width / sw;
  return (
    <div
      style={{
        position: 'relative',
        width,
        height: sh * k,
        background,
        overflow: 'hidden',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: sw,
          height: sh,
          transformOrigin: '0 0',
          transform: `scale(${k})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The brand reference ghost, aligned to the rig (see referenceFrame). */
export function ReferenceOverlay({
  opacity,
  blend = 'normal',
}: {
  opacity: number;
  /** 'multiply' hides the reference's white page background on light stages. */
  blend?: CSSProperties['mixBlendMode'];
}) {
  const f = referenceFrame();
  if (opacity <= 0) return null;
  return (
    <img
      src={referenceUrl}
      alt="brand reference"
      style={{
        position: 'absolute',
        left: f.left,
        top: f.top,
        width: f.width,
        opacity,
        pointerEvents: 'none',
        mixBlendMode: blend,
      }}
    />
  );
}
