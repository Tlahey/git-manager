import { githubApiRequest } from '../../lib/tauri'

/**
 * GitHub release page URL for a tag if a release exists, else null (a 404 = no release).
 *
 * Goes to the transport directly rather than through `ghFetch`, because the 404 here is an *answer*
 * — "this tag was never released" — and `ghFetch` turns a non-2xx into a thrown error. Rust hands
 * back the status alongside the body precisely so a caller like this one can read it.
 */
export async function fetchReleaseUrlForTag(
  owner: string,
  repo: string,
  tag: string,
  accountId?: string | null
): Promise<string | null> {
  const res = await githubApiRequest({
    accountId,
    url: `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
  })
  if (!res.ok) return null
  try {
    const data = JSON.parse(res.body) as { html_url?: unknown }
    return typeof data.html_url === 'string' ? data.html_url : null
  } catch {
    return null
  }
}

/** URL to open for a tag: its GitHub release page when one exists, otherwise the tag page. */
export async function resolveTagOrReleaseUrl(
  owner: string,
  repo: string,
  tag: string,
  accountId?: string | null
): Promise<string> {
  const releaseUrl = await fetchReleaseUrlForTag(owner, repo, tag, accountId)
  return releaseUrl ?? `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tag)}`
}
