import { browser } from '@wdio/globals'

/**
 * Prepare the page for a deterministic visual snapshot: wait for webfonts to settle and
 * force-disable CSS transitions/animations, so two renders of the same state don't drift by a
 * fraction of a percent from font hinting / antialiasing jitter alone. Both steps are
 * recommended by the upstream @wdio/visual-service guide. Call right before
 * `toMatchElementSnapshot` / `checkScreen`.
 *
 * NOTE on tolerance vs. volatile content: the snapshot tolerance that absorbs sub-pixel jitter
 * also silently absorbs small volatile text like short commit OIDs or timestamps (a few
 * characters are a tiny pixel fraction of a large element). Prefer snapshotting regions without
 * volatile content, or mask it with the visual service's `hideElements` / `removeElements`
 * options — don't rely on tolerance to hide a sha you actually care about.
 */
export async function stabiliseForSnapshot(): Promise<void> {
  await browser.execute(async () => {
    await document.fonts.ready
  })
  await browser.execute(() => {
    if (document.getElementById('wdio-vrt-stabilise')) return
    const style = document.createElement('style')
    style.id = 'wdio-vrt-stabilise'
    // The blinking cursor (random blink phase at capture time), the current-line highlight
    // (tracks wherever the last click/edit left it), and the custom scrollbars (fade in/out on
    // interaction, so a transition frozen mid-fade can leave one at a random opacity) are all
    // known non-deterministic Monaco chrome — packages/editor's own Playwright visual suite
    // already neutralizes exactly these three via its `e2e/screenshot.css` (not used by this
    // WebdriverIO suite, so mirrored here).
    style.textContent = `
      *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
      .monaco-editor .cursors-layer { display: none !important; }
      .monaco-editor .view-overlays .current-line,
      .monaco-editor .margin-view-overlays .current-line-margin { display: none !important; }
      .monaco-editor .scrollbar { opacity: 0 !important; }
    `
    document.head.appendChild(style)
  })
  // The gamification TrophyToast (fixed bottom-right, 4.5s auto-dismiss) can still be on screen
  // from an achievement unlocked earlier in the same run — every feature shares one app instance
  // (see merge.steps.ts's note on that), so e.g. a prior scenario's first commit bleeds a toast
  // into a totally unrelated feature's snapshot a few steps later. Its exact presence/timing isn't
  // deterministic (depends on scenario execution order), so baking it into a baseline would just
  // make that snapshot flaky the other way — yank it from the DOM instead of waiting out its own
  // close animation, since we're about to screenshot and don't need the app to observe the close.
  await browser.execute(() => {
    document.querySelector('[data-testid="trophy-toast"]')?.remove()
  })
}
