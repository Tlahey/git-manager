/**
 * Git Manager Landing Page — standalone entry point.
 *
 * The behaviour itself lives in landing.js, which the documentation site imports
 * too (it renders this page as its home). Everything here is what only the
 * standalone app needs: registering the mascot custom element and kicking the
 * behaviour off against the whole document.
 *
 * The octopus mascot is the shared <git-mascot> web component. Importing it here
 * registers the custom element; it renders its own artwork, idle animations and
 * pointer-following eyes internally (in Shadow DOM).
 */
import '@git-manager/mascot/element';
import { initLanding } from './landing.js';

initLanding(document);
