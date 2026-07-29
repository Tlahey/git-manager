/**
 * Opens a URL in the user's real browser rather than inside the Tauri webview.
 *
 * The webview has no tabs and no chrome, so navigating it to an external page
 * strands the user inside the app. Falls back to `window.open` so the helper still
 * works under jsdom and in a plain browser context (tests, Storybook).
 */
export async function openUrl(url: string) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch {
    window.open(url, '_blank')
  }
}
