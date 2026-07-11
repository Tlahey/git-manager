import { createElement, useEffect, type CSSProperties } from 'react';
import { defineGitMascot } from './GitMascotElement';

export interface OctopusMascotProps {
  /** Rendered width in px (height is derived from the artwork ratio). Default 320. */
  size?: number;
  /** Enable the idle "natural movement" animations. Default true. */
  animated?: boolean;
  /** Let the eyes follow the pointer. Default true (ignored when not animated). */
  eyeTracking?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible label for the SVG. */
  label?: string;
}

/**
 * OctopusMascot — React wrapper around the framework-agnostic `<git-mascot>`
 * Web Component, so the desktop app renders the exact same artwork and
 * animations as the landing page (single source of truth in `mascotArt`).
 *
 * This package only owns display + natural movement; app-specific behavior
 * (e.g. a Clippy-style assistant in the desktop app) is layered on top by the
 * consumer, not here.
 */
export function OctopusMascot({
  size = 320,
  animated = true,
  eyeTracking = true,
  className,
  style,
  label = 'Git Manager octopus mascot',
}: OctopusMascotProps) {
  useEffect(() => {
    defineGitMascot();
  }, []);

  return createElement('git-mascot', {
    size,
    animated: animated ? undefined : 'false',
    'eye-tracking': eyeTracking ? undefined : 'false',
    label,
    // React doesn't rewrite `className` to the `class` attribute for custom (hyphenated) elements
    // the way it does for built-in DOM tags — passing `className` through as-is would silently
    // set a nonsensical `classname` attribute instead of applying any CSS class.
    class: className,
    style,
  });
}
