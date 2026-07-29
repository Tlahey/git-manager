import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import LandingPage from './components/LandingPage.vue'
import './custom.css'

// The default theme, restyled through CSS variables only (see custom.css) — no
// component overrides, so VitePress upgrades stay uneventful.
//
// The one addition is <LandingPage />, used by `index.md` (which sets
// `layout: false`, so the theme's own chrome stays out of its way). Registering
// it globally is what lets a Markdown file mount it.
const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LandingPage', LandingPage)
  },
}

export default theme
