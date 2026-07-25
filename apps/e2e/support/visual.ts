import { browser, $ } from '@wdio/globals'

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
  // Two full-viewport covers have to be gone before anything is worth photographing. This matters
  // more than a single failed assertion: because `autoSaveBaseline` is on (there's no CI),
  // photographing one gets it **saved as the baseline**, and every later run then mismatches
  // against it forever — exactly how the merge-editor and autosquash-preview snapshots ended up
  // failing on every second run.
  //
  // `#app-splash` is the static startup splash index.html paints before React boots (mascot +
  // "Git Manager"), removed by hideAppSplash once the app is ready. Every step that navigates in
  // place — the merge editor's `?window=merge` route, the fixture-open reload — is a full document
  // load, so each one puts the splash back up.
  //
  // The splash is *waited* for and then, as a last resort, removed — unlike the scrim below, which
  // is only ever waited for. `main.tsx` drops it on the dedicated merge/rebase/fixup routes via
  // `requestAnimationFrame(hideAppSplash)`, and rAF is throttled or suspended while a window isn't
  // being painted (an occluded window, or a machine under load), so it can simply never fire even
  // though the route rendered fine — every caller has already waited for its own content by this
  // point. Waiting first still catches the case where the app really is mid-load.
  const splashGone = await $('#app-splash')
    .waitForExist({ timeout: 10000, reverse: true })
    .then(
      () => true,
      () => false
    )
  if (!splashGone) {
    await browser.execute(() => document.getElementById('app-splash')?.remove())
  }
  // LoadingOverlay: the global scrim (black/60 + blur, animated mascot centred) shown while a global
  // operation is in flight. It's driven by whatever is loading app-wide, not by the element being
  // snapshotted, so waiting for the target's own content doesn't rule it out.
  await $('[data-testid="loading-overlay"]').waitForExist({
    timeout: 30000,
    reverse: true,
    timeoutMsg: 'The global loading overlay was still up when trying to take a visual snapshot',
  })
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
  // Focus is a capture-time coin flip: a step that *clicks* the element it then snapshots (the
  // theme card) leaves it focused, and whether `:focus-visible` paints a ring depends on how the
  // driver's click was classified. On a small element one ring is a big share of the pixels —
  // enough alone to blow the 1% threshold (3.2% on the 330×186 theme card). Blur rather than
  // suppress focus rings in CSS: Tailwind's `ring-*` compiles to `box-shadow`, which is also how
  // the theme card draws its *selected* state, so a blanket `box-shadow: none` on `:focus` erases
  // real, meaningful chrome exactly when the element happens to be focused — flakier, not less.
  await browser.execute(() => {
    const active = document.activeElement as HTMLElement | null
    active?.blur?.()
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
