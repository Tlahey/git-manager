/**
 * React-free entry point. Registers the `<git-mascot>` custom element and
 * re-exports the framework-agnostic pieces. Consumers that don't use React
 * (e.g. the static landing page) import this instead of the package root, so
 * they never pull the React wrapper (and thus `react`) into their bundle.
 */
export { GitMascotElement, defineGitMascot } from './GitMascotElement'
export { MASCOT_MARKUP, MASCOT_STYLES, MASCOT_VIEWBOX, MASCOT_SELECTORS } from './mascotArt'

import { defineGitMascot } from './GitMascotElement'
defineGitMascot()
