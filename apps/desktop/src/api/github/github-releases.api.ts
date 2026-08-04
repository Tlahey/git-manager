import { ghHeaders } from './githubApiShared'

/** GitHub release page URL for a tag if a release exists, else null (a 404 = no release). */
export async function fetchReleaseUrlForTag(
  owner: string,
  repo: string,
  tag: string,
  token?: string
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    { headers: ghHeaders(token) }
  )
  if (!res.ok) return null
  const data = await res.json()
  return typeof data.html_url === 'string' ? data.html_url : null
}

/** URL to open for a tag: its GitHub release page when one exists, otherwise the tag page. */
export async function resolveTagOrReleaseUrl(
  owner: string,
  repo: string,
  tag: string,
  token?: string
): Promise<string> {
  const releaseUrl = await fetchReleaseUrlForTag(owner, repo, tag, token)
  return releaseUrl ?? `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tag)}`
}
