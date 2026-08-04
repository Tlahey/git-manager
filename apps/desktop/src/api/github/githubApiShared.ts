// Shared kernel reused by every github/*.api.ts domain file: GitHub's own `user`/`label` shapes
// plus the low-level REST/GraphQL request plumbing (auth headers, error extraction, generic
// fetch/request/graphql wrappers) that every domain below — pulls, issues, reviews, checks,
// labels, releases, contributions, auth — builds its typed calls on top of. Split out of the
// former monolithic github.api.ts (2026-08) precisely because these cut across every domain;
// extracting a domain file without this kernel would mean duplicating ghFetch/ghRequest/ghGraphQL
// in each one. None of this was ever exported from github.api.ts itself (these helpers were
// private to the monolith), so it stays out of the `github.api.ts` barrel too — domain files
// import it directly from here, the same way `git/*.api.ts` files import `gitApiShared.ts`.

export interface GhUser {
  login: string
  avatar_url: string
}

export interface GhLabel {
  name: string
  /** 6-hex (no leading #) — GitHub's label color. */
  color?: string
  description?: string | null
}

export interface GhSearchResult<T> {
  items: T[]
}

export function ghHeaders(token?: string, accept = 'application/vnd.github.v3+json'): HeadersInit {
  const h: HeadersInit = { Accept: accept }
  if (token) (h as Record<string, string>)['Authorization'] = `token ${token}`
  return h
}

export interface GhRequestOptions {
  method?: string
  body?: unknown
  token?: string
  /** Override the `Accept` media type (e.g. a preview flag). Defaults to `v3+json`. */
  accept?: string
}

/**
 * Low-level GitHub REST call with shared auth headers + error handling.
 * Backs both reads (`ghFetch`) and writes (create PR, comment, review, merge).
 */
export async function ghRequest<T>(url: string, opts: GhRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, accept } = opts
  const headers = ghHeaders(token, accept)
  if (body !== undefined) {
    ;(headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, {
    method,
    headers,
    // GitHub's REST API sends `Cache-Control: max-age=60` on GETs (e.g. a PR's own detail
    // endpoint), so the webview's HTTP cache can silently serve a pre-merge response for up to a
    // minute even when SWR asks us to revalidate right after a merge/comment/review — the fetch()
    // call never reaches the network. Force every call through.
    cache: 'no-store',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    // Surface GitHub's own error detail (e.g. "Validation Failed: No commits between main and x",
    // "A pull request already exists") instead of a bare status — vital for debugging PR creation.
    const detail = await extractGitHubError(res)
    throw new Error(`GitHub API ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res.json()
}

/** Best-effort extraction of a human-readable message from a GitHub error response body. */
async function extractGitHubError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as {
      message?: string
      errors?: Array<{ message?: string; field?: string; code?: string }>
    }
    const parts: string[] = []
    if (data.message) parts.push(data.message)
    for (const e of data.errors ?? []) {
      if (e.message) parts.push(e.message)
      else if (e.field && e.code) parts.push(`${e.field}: ${e.code}`)
    }
    return parts.join(' — ')
  } catch {
    return ''
  }
}

export async function ghFetch<T>(url: string, token?: string, accept?: string): Promise<T> {
  return ghRequest<T>(url, { token, accept })
}

/** GitHub GraphQL v4 call — for the operations REST can't do (draft toggle, `mergeStateStatus`,
 * per-check `isRequired`). `accept` lets callers opt into a preview media type when needed. */
export async function ghGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
  accept = 'application/json'
): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: accept,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    throw new Error(`GitHub GraphQL ${res.status}`)
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> }
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL: ${json.errors.map((e) => e.message).join(' — ')}`)
  }
  return json.data as T
}
