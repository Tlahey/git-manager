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
    style.textContent =
      '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }'
    document.head.appendChild(style)
  })
}
