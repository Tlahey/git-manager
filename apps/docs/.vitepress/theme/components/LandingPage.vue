<script setup lang="ts">
/**
 * The landing page, rendered as the home route of the documentation site.
 *
 * The markup is imported as a raw string from the landing page's own
 * `index.html` and injected with `v-html`, rather than transcribed into this
 * template. That keeps a single source of truth for ~460 lines of hand-tuned
 * marketing markup: a copy here would drift from the original the first time
 * either is edited, and nothing would fail to tell anyone. It also means the
 * whole page still lands in VitePress's pre-rendered HTML, so it stays
 * crawlable — `v-html` content is server-rendered like any other string.
 *
 * Behaviour and styles come from that same package (`landing.js`,
 * `style.css`), so the standalone app and this host cannot diverge either.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import landingDocument from '../../../../landing-page/index.html?raw'
import landingCss from '../../landing-css.json'

/**
 * Everything between <body> and </body>, minus the module script tag — that
 * entry point is the standalone app's, and its job is done here by onMounted.
 */
const markup = (landingDocument.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '').replace(
  /<script\b[\s\S]*?<\/script>/g,
  ''
)

const root = ref<HTMLElement | null>(null)
let teardown: (() => void) | null = null

/**
 * The landing stylesheet is deliberately not bundled with the site (it styles
 * generic class names like `.nav`, which VitePress's own sidebar markup uses —
 * see `copyLandingCss()`), so it is linked per page. `transformHtml` puts the
 * link in the pre-rendered head; this covers arriving here from a doc page,
 * where there is no fresh document to pre-render.
 */
const LANDING_CSS_ID = 'landing-stylesheet'

function mountStylesheet(): void {
  if (document.getElementById(LANDING_CSS_ID)) return
  const link = document.createElement('link')
  link.id = LANDING_CSS_ID
  link.rel = 'stylesheet'
  link.href = withBase(`/${landingCss.file}`)
  document.head.appendChild(link)
}

onMounted(async () => {
  mountStylesheet()
  // Both imports are client-only on purpose: registering a custom element needs
  // `customElements`, and the behaviour reads layout geometry — neither exists
  // during VitePress's static render.
  await import('@git-manager/mascot/element')
  const { initLanding } = await import('../../../../landing-page/landing.js')
  teardown = initLanding(root.value ?? document)
})

// Unlike the standalone page, this one can be navigated away from: the docs are
// a single-page app, so the observers, the bubble interval and the parallax
// animation frame have to be handed back or they run for the rest of the visit.
// The stylesheet goes with them — leaving it behind would restyle the docs.
onBeforeUnmount(() => {
  teardown?.()
  teardown = null
  document.getElementById(LANDING_CSS_ID)?.remove()
})
</script>

<template>
  <div ref="root" v-html="markup" />
</template>
