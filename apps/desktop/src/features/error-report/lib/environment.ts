/**
 * What the webview can honestly say about the machine — and, just as importantly, what it cannot.
 *
 * There is no OS plugin in this app (`@tauri-apps/plugin-os` is not a dependency, and adding a
 * plugin, a Rust crate and a capability entry to print one string is not a trade worth making), so
 * everything here comes from the user agent. That places a hard limit on the answer: WKWebView
 * reports `Intel Mac OS X 10_15_7` on every Mac made since 2020, Apple Silicon included, so the
 * macOS version and the CPU architecture are simply **not available** and are not guessed at. A
 * report that says "macOS 10.15" would be wrong on essentially every machine that files one.
 *
 * The WebKit build number is the part that does vary and does matter: several of this app's known
 * failure modes are WebKit-specific (the blank-screen `NotFoundError` the error boundary exists
 * for, Monaco's CSP breakage in packaged builds), and it moves with the OS, so it is the closest
 * thing to a version this layer can report truthfully.
 */

/** A one-line platform description for the report's Environment section. */
export function describePlatform(userAgent: string): string {
  const os = detectOs(userAgent)
  const webkit = /AppleWebKit\/([\d.]+)/.exec(userAgent)?.[1]
  // Named "WebKit build" rather than "version" because it is not the macOS version, and someone
  // reading the issue will otherwise try to use it as one.
  return webkit ? `${os} · WebKit build ${webkit}` : os
}

function detectOs(userAgent: string): string {
  if (userAgent.includes('Mac OS X') || userAgent.includes('Macintosh')) return 'macOS'
  if (userAgent.includes('Windows')) return 'Windows'
  if (userAgent.includes('Linux')) return 'Linux'
  return 'unknown OS'
}
