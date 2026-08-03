import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { useRoute } from 'vitepress'
import { h, nextTick, onMounted, watch } from 'vue'
import mediumZoom from 'medium-zoom'
import DocFeedback from './components/DocFeedback.vue'
import LandingPage from './components/LandingPage.vue'
import './custom.css'

// The "×" button shown while an image is zoomed. It closes the zoom by
// re-dispatching a click on medium-zoom's own overlay element rather than
// holding a reference to a zoom instance — `zoom()` below creates a new
// instance on every route change, so there's no single instance to call
// `.close()` on, but the overlay is always the element medium-zoom itself
// listens for a backdrop click on (see the z-index override in custom.css
// for why the overlay/close button need help standing out at all).
function createZoomCloseButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'doc-zoom-close'
  button.setAttribute('aria-label', 'Close zoomed image')
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>'
  button.addEventListener('click', () => {
    document
      .querySelector('.medium-zoom-overlay')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  return button
}

// The default theme, restyled through CSS variables only (see custom.css) — two
// component additions only, so VitePress upgrades stay uneventful.
//
// <LandingPage /> is used by `index.md` (which sets `layout: false`, so the
// theme's own chrome stays out of its way). Registering it globally is what
// lets a Markdown file mount it.
//
// <DocFeedback /> is injected into every *other* page via the `doc-after`
// layout slot rather than written into a page — it must show up on the
// hand-written `docs/index.md`/`docs/download.md` too, and survive
// `docs/features/*.md` being wiped and regenerated on every `pnpm generate`.
// `layout: false` pages (only the landing page) never render this Layout at
// all, so they're correctly skipped.
const theme: Theme = {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-after': () => h(DocFeedback),
    })
  },
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
    //
    // The overlay is forced fully opaque black (instead of the page
    // background) and, together with the zoomed image, given an explicit
    // z-index in custom.css: medium-zoom appends both as the last children
    // of <body>, which only ranks "on top" by DOM order, but VitePress's
    // sticky nav/sidebar set an explicit z-index of their own and paint
    // above anything relying on DOM order alone — without the override the
    // zoomed screenshot showed up behind the nav bar.
    const route = useRoute()
    const zoom = () => {
      // `margin` keeps the zoomed image off the viewport edges — medium-zoom
      // scales it to fill the viewport exactly (margin: 0) by default, which
      // reads as the image being cropped by the window rather than framed by it.
      mediumZoom('.vp-doc img:not(.medium-zoom-image)', { background: '#000', margin: 48 })
    }
    onMounted(() => {
      zoom()
      document.body.appendChild(createZoomCloseButton())
    })
    watch(
      () => route.path,
      () => nextTick(zoom)
    )
  },
}

export default theme
