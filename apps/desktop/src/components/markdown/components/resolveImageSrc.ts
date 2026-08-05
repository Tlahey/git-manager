import { toAssetUrl, joinRepoPath } from '../../../lib/assetUrl'

// Kept out of `MarkdownImage.tsx` so that file exports components only — a module mixing a component
// with a plain helper loses Vite's Fast Refresh (`react/only-export-components`).

/**
 * Resolves a markdown image source to something the webview can load.
 *
 * Remote and inline sources are passed through untouched. A path relative to the document is
 * resolved against the repository it came from — that's how a README's `docs/logo.png` renders.
 *
 * An *absolute* path is deliberately not resolved: in a README it is virtually always a
 * repository-root reference (GitHub's own convention), not a path on this machine, and the
 * markdown here is as likely to come from a stranger's pull request as from the user's own repo —
 * `![](/Users/…/private.png)` shouldn't turn into a filesystem read just because it parses.
 */
export function resolveImageSrc(src?: string, repoPath?: string): string {
  if (!src) return ''
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('asset:')
  ) {
    return src
  }

  if (src.startsWith('/')) {
    return repoPath ? toAssetUrl(joinRepoPath(repoPath, src.slice(1))) : src
  }

  return repoPath ? toAssetUrl(joinRepoPath(repoPath, src)) : src
}
