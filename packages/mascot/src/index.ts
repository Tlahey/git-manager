export { OctopusMascot } from './OctopusMascot';
export type { OctopusMascotProps } from './OctopusMascot';
export { GitMascotElement, defineGitMascot } from './GitMascotElement';
export { attachEyeTracking } from './behaviors';
export { MASCOT_MARKUP, MASCOT_STYLES, MASCOT_VIEWBOX, MASCOT_SELECTORS } from './mascotArt';

// Registering the custom element on import keeps consumers to a single
// `import '@git-manager/mascot'` — both the landing page and the desktop app.
import { defineGitMascot } from './GitMascotElement';
defineGitMascot();
