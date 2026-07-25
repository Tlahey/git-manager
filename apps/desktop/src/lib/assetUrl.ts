import { convertFileSrc } from '@tauri-apps/api/core'

/**
 * Turns an absolute filesystem path into a URL the webview can load (`asset://…`).
 *
 * The backend only grants the asset protocol the directories of repositories the user has opened
 * (see `allow_repo_assets` in `commands/repo.rs`), so this resolving succeeding doesn't mean the
 * file will load — an image outside those directories is refused by the scope.
 *
 * `convertFileSrc` reads Tauri's injected internals, which don't exist outside the webview (unit
 * tests, any non-Tauri context): the `file://` fallback keeps callers from throwing there.
 */
export function toAssetUrl(absolutePath: string): string {
  try {
    return convertFileSrc(absolutePath)
  } catch {
    return `file://${absolutePath}`
  }
}

/** Joins a repository path and a repo-relative path into an absolute one, tolerating a trailing slash. */
export function joinRepoPath(repoPath: string, relativePath: string): string {
  return `${repoPath.replace(/\/+$/, '')}/${relativePath.replace(/^\.?\//, '')}`
}
