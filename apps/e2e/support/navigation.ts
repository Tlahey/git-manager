import { browser } from '@wdio/globals'

/**
 * Navigates through WebDriver, then waits for the NEW document to actually be current before
 * returning — so the caller's next element command runs against a live page.
 *
 * The wait is not a nicety; it is where most of a full run's wall-clock used to go. The tauri
 * service runs an "ensure the active window is focused" probe before every `getTitle`/
 * `findElement`/`$`/click, and that probe is a `browser.tauri.execute` — an HTTP direct-eval into
 * the webview, outside the WebDriver protocol, with a 30-second timeout. Fire an element command
 * while the navigation is still swapping documents and the probe's script vanishes with the old
 * document: nothing is logged, nothing errors, the runner just sits the full 30s until the Rust
 * side gives up ("Failed to get window states"). One race per navigation, ~150 navigations per
 * run — a measured full run spent ~25 of its 31.8 minutes exactly here, as a wall of 30s/60s
 * "outside steps" entries in REPORT.md.
 *
 * Polling with `browser.execute` is what makes this safe: `executeScript` is NOT in the service's
 * probed-commands list, so these polls never trigger the probe — and by the time the marker is
 * visible, the new document is current and every later probe lands in a live page.
 *
 * @param url    Absolute URL to navigate to. Must contain `marker` (put a fresh stamp in the
 *               query string — the app ignores unknown params).
 * @param marker Substring of `url` absent from the OLD document's URL, so seeing it proves the
 *               swap committed.
 */
export async function navigateAndSettle(url: string, marker: string): Promise<void> {
  if (!url.includes(marker)) {
    throw new Error(`navigateAndSettle: the url "${url}" does not contain its marker "${marker}"`)
  }
  await browser.url(url)
  await browser.waitUntil(
    async () =>
      await browser
        .execute((m: string) => window.location.href.includes(m), marker)
        // The execute can race the document swap itself — just poll again.
        .catch(() => false),
    { timeout: 15000, timeoutMsg: `The navigation stamped "${marker}" never committed` }
  )
}
