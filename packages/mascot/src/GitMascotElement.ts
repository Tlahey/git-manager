/**
 * GitMascotElement — `<git-mascot>` custom element.
 *
 * The framework-agnostic host for the mascot: renders the shared SVG + CSS
 * (from `mascotArt`) into a Shadow DOM so its animations never leak into or
 * collide with the surrounding page, and wires up the JS behaviors
 * (`attachEyeTracking`). This is what the static landing page consumes; the
 * React `<OctopusMascot>` wrapper renders this same element.
 *
 * Attributes:
 *   size          number  — rendered width in px (height derived). Default 320.
 *   animated      boolean — "false" freezes all continuous motion. Default on.
 *   eye-tracking  boolean — "false" disables pointer-following eyes. Default on.
 *   label         string  — accessible label for the SVG.
 */

import { MASCOT_MARKUP, MASCOT_STYLES, MASCOT_SELECTORS } from './mascotArt';
import { attachEyeTracking } from './behaviors';

const TAG_NAME = 'git-mascot';
const DEFAULT_SIZE = 320;

export class GitMascotElement extends HTMLElement {
  static get observedAttributes() {
    return ['size', 'animated', 'eye-tracking', 'label'];
  }

  private svg: SVGSVGElement | null = null;
  private detachEyes: (() => void) | null = null;

  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = MASCOT_STYLES;
      root.appendChild(style);
      const tpl = document.createElement('template');
      tpl.innerHTML = MASCOT_MARKUP.trim();
      root.appendChild(tpl.content.cloneNode(true));
      this.svg = root.querySelector<SVGSVGElement>(`.${MASCOT_SELECTORS.root}`);
    }
    this.sync();
  }

  disconnectedCallback() {
    this.detachEyes?.();
    this.detachEyes = null;
  }

  attributeChangedCallback() {
    if (this.svg) this.sync();
  }

  private boolAttr(name: string, defaultOn: boolean): boolean {
    if (!this.hasAttribute(name)) return defaultOn;
    return this.getAttribute(name) !== 'false';
  }

  /** Apply the current attributes to the rendered SVG + behaviors. */
  private sync() {
    const svg = this.svg;
    if (!svg) return;

    const size = Number(this.getAttribute('size')) || DEFAULT_SIZE;
    this.style.setProperty('--gm-size', `${size}px`);

    const label = this.getAttribute('label') ?? 'Git Manager octopus mascot';
    svg.setAttribute('aria-label', label);

    const animated = this.boolAttr('animated', true);
    svg.toggleAttribute('data-static', !animated);

    const eyeTracking = animated && this.boolAttr('eye-tracking', true);
    if (eyeTracking && !this.detachEyes) {
      this.detachEyes = attachEyeTracking(svg);
    } else if (!eyeTracking && this.detachEyes) {
      this.detachEyes();
      this.detachEyes = null;
    }
  }
}

/** Register `<git-mascot>` once. Safe to call repeatedly / on the server (no-op). */
export function defineGitMascot(): void {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') return;
  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, GitMascotElement);
  }
}
