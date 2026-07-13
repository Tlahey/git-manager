/** Parse a GitHub remote URL (HTTPS or SSH) into `{ owner, repo }`, or `null` when it isn't one. */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Matches https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git)
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (match) return { owner: match[1], repo: match[2] }
  return null
}

/** Returns the first GitHub `{ owner, repo }` found across the given remote URLs, or `null`. */
export function firstGitHubOwnerRepo(
  remoteUrls: string[]
): { owner: string; repo: string } | null {
  return remoteUrls.map(parseGitHubUrl).find((r) => r !== null) ?? null
}
