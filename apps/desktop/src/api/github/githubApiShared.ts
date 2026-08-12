// Shared kernel reused by every github/*.api.ts domain file: GitHub's own `user`/`label` shapes
// plus the low-level REST/GraphQL request plumbing (auth, error extraction, generic
// fetch/request/graphql wrappers) that every domain below — pulls, issues, reviews, checks,
// labels, releases, contributions, auth — builds its typed calls on top of. Split out of the
// former monolithic github.api.ts (2026-08) precisely because these cut across every domain;
// extracting a domain file without this kernel would mean duplicating ghFetch/ghRequest/ghGraphQL
// in each one. None of this was ever exported from github.api.ts itself (these helpers were
// private to the monolith), so it stays out of the `github.api.ts` barrel too — domain files
// import it directly from here, the same way `git/*.api.ts` files import `gitApiShared.ts`.
//
// ─── Why there is no `fetch` here any more ───────────────────────────────────────────────────────
//
// These helpers used to sign their own requests with a `token: string` the caller passed in, which
// is *why* GitHub tokens had to be persisted somewhere the webview could read — first localStorage,
// then `~/.git-manager/settings.json`. They now go through `githubApiRequest`, a Tauri command that
// looks the token up in the OS keychain by account id and attaches it in Rust. What travels from
// here is an **account id**, which is a login, not a secret.
//
// Two consequences worth knowing before changing anything below:
//   • Never reintroduce `fetch` for GitHub. It would not work — there is no token in the webview to
//     attach — and reaching for one is the exact regression this file exists to prevent.
//   • Rust returns the status *and* the body rather than throwing, because callers judge status
//     themselves: a 404 from the releases endpoint means "this tag has no release". That is why the
//     shape below still reads like a `Response` even though nothing here holds one.

import { githubApiRequest } from '../../lib/tauri'

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

export interface GhRequestOptions {
  method?: string
  body?: unknown
  /**
   * Which connected account to act as. Absent (or null) means an anonymous request — a handful of
   * reads work signed out, and those callers already treated the credential as optional.
   */
  accountId?: string | null
  /** Override the `Accept` media type (e.g. a preview flag). Defaults to `v3+json`. */
  accept?: string
}

/**
 * Low-level GitHub REST call: Rust performs it, having attached `accountId`'s token.
 *
 * Backs both reads (`ghFetch`) and writes (create PR, comment, review, merge). Throws on a non-2xx
 * status, carrying GitHub's own error detail — the one behaviour worth preserving verbatim from the
 * `fetch` version, because "Validation Failed: No commits between main and x" is the difference
 * between a debuggable failure and a bare 422.
 *
 * The webview's HTTP cache is no longer in the way, incidentally: GitHub sends
 * `Cache-Control: max-age=60` on GETs, which used to let a pre-merge response be replayed for up to
 * a minute even when SWR asked to revalidate right after a merge. Requests leave from Rust now, so
 * the `cache: 'no-store'` that used to force each one through has nothing left to force.
 */
export async function ghRequest<T>(url: string, opts: GhRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, accountId, accept } = opts
  const res = await githubApiRequest({ accountId, url, method, body, accept })
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}${describeError(res.body)}`)
  }
  return parseBody<T>(res.body)
}

/**
 * Parses a JSON body, tolerating an empty one.
 *
 * GitHub answers some writes with `204 No Content` (deleting a label, dismissing a review request),
 * and the callers of those declare `Promise<void>` — so an empty body is a successful result, not a
 * malformed one. `res.json()` used to reject on it; this returns `undefined` instead.
 */
function parseBody<T>(body: string): T {
  if (body.trim() === '') return undefined as T
  return JSON.parse(body) as T
}

/**
 * Best-effort extraction of a human-readable message from a GitHub error response body, already
 * formatted as the suffix of an error string (`": …"`, or empty when there is nothing to say).
 */
function describeError(body: string): string {
  try {
    const data = JSON.parse(body) as {
      message?: string
      errors?: Array<{ message?: string; field?: string; code?: string }>
    }
    const parts: string[] = []
    if (data.message) parts.push(data.message)
    for (const e of data.errors ?? []) {
      if (e.message) parts.push(e.message)
      else if (e.field && e.code) parts.push(`${e.field}: ${e.code}`)
    }
    const detail = parts.join(' — ')
    return detail ? `: ${detail}` : ''
  } catch {
    return ''
  }
}

export async function ghFetch<T>(
  url: string,
  accountId?: string | null,
  accept?: string
): Promise<T> {
  return ghRequest<T>(url, { accountId, accept })
}

/** GitHub GraphQL v4 call — for the operations REST can't do (draft toggle, `mergeStateStatus`,
 * per-check `isRequired`). `accept` lets callers opt into a preview media type when needed. */
export async function ghGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  accountId: string,
  accept = 'application/json'
): Promise<T> {
  const res = await githubApiRequest({
    accountId,
    url: 'https://api.github.com/graphql',
    method: 'POST',
    body: { query, variables },
    accept,
  })
  if (!res.ok) {
    throw new Error(`GitHub GraphQL ${res.status}`)
  }
  const json = JSON.parse(res.body) as { data?: T; errors?: Array<{ message?: string }> }
  // GraphQL reports failures inside a 200, so the status above is only half the check.
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL: ${json.errors.map((e) => e.message).join(' — ')}`)
  }
  return json.data as T
}
