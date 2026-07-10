/**
 * behaviors — JS-driven "natural movements" for the mascot that can't be done
 * with CSS keyframes alone. Framework-agnostic: each helper takes the mascot's
 * root SVG element and returns a cleanup function. Shared by both the Web
 * Component and the React wrapper.
 */

import { MASCOT_SELECTORS } from './mascotArt';

/**
 * Largest distance (in SVG user units) a pupil drifts from its rest position.
 * Sized against mascotArt's reference-derived eye geometry (white r≈33.2,
 * pupil sprite r≈22.1) so the pupil never crosses the white's edge.
 */
const MAX_PUPIL_OFFSET = 9;

interface Pupil {
  el: SVGGraphicsElement;
  baseX: number;
  baseY: number;
}

function readPupils(svg: SVGSVGElement): Pupil[] {
  const els = svg.querySelectorAll<SVGGraphicsElement>(`.${MASCOT_SELECTORS.pupil}`);
  return Array.from(els).map((el) => ({
    el,
    baseX: Number(el.dataset.cx ?? el.getAttribute('cx') ?? 0),
    baseY: Number(el.dataset.cy ?? el.getAttribute('cy') ?? 0),
  }));
}

/** Map a client (viewport) point into the SVG's user coordinate space. */
function toSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * vb.width + vb.x,
    y: ((clientY - rect.top) / rect.height) * vb.height + vb.y,
  };
}

/**
 * Make the mascot's pupils follow the pointer. While active, sets `data-tracking`
 * on the SVG so the idle CSS glance animation stands down. Reverts to rest (and
 * hands back to the idle animation) when the pointer leaves the window.
 *
 * Respects `prefers-reduced-motion: reduce` by not attaching at all.
 */
export function attachEyeTracking(svg: SVGSVGElement): () => void {
  if (typeof window === 'undefined') return () => {};
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  const pupils = readPupils(svg);
  if (pupils.length === 0) return () => {};

  const rest = () => {
    svg.removeAttribute('data-tracking');
    for (const p of pupils) p.el.style.transform = '';
  };

  const onMove = (e: PointerEvent | MouseEvent) => {
    const pt = toSvgPoint(svg, e.clientX, e.clientY);
    if (!pt) return;
    svg.setAttribute('data-tracking', '');
    for (const p of pupils) {
      const dx = pt.x - p.baseX;
      const dy = pt.y - p.baseY;
      const dist = Math.hypot(dx, dy) || 1;
      const scale = Math.min(MAX_PUPIL_OFFSET / dist, 1);
      p.el.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    }
  };

  const onLeave = (e: PointerEvent | MouseEvent) => {
    // Only reset when the pointer actually leaves the window, not on child transitions.
    if ((e as MouseEvent).relatedTarget === null) rest();
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('mouseout', onLeave);
  window.addEventListener('blur', rest);

  return () => {
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('mouseout', onLeave);
    window.removeEventListener('blur', rest);
    rest();
  };
}
