import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { useRoute } from 'vitepress'
import { nextTick, onMounted, watch } from 'vue'
import mediumZoom from 'medium-zoom'
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
  setup() {
    // Click-to-zoom on every content image (the generated feature screenshots,
    // mainly). Scoped to `.vp-doc img` — the default theme's markdown-content
    // wrapper — so it never touches the landing page, which renders with
    // `layout: false` and isn't wrapped in `.vp-doc` at all.
    //
    // Re-run on every route change (VitePress is an SPA, so images swap in
    // without a full reload) and deferred one tick so the new page's images are
    // actually in the DOM before `medium-zoom` scans for them.
    const route = useRoute()
    const zoom = () => {
      mediumZoom('.vp-doc img:not(.medium-zoom-image)', { background: 'var(--vp-c-bg)' })
    }
    onMounted(zoom)
    watch(
      () => route.path,
      () => nextTick(zoom)
    )
  },
}

export default theme
