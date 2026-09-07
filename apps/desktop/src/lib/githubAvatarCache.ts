/**
 * The session's memory of which commit was written by whom, so a blame gutter asks GitHub once.
 *
 * A commit's author cannot change — the SHA is a hash of the authorship — so this is the rare case
 * where a cache never goes stale and needs no invalidation at all. What makes it worth having is the
 * shape of the caller: `useCommitAvatars` keys its SWR entry on the *joined list* of visible SHAs,
 * so scrolling a blame gutter by one line produces a brand-new key and, without this, a brand-new
 * fetch of two hundred commits that were already resolved a moment ago. With it, each request asks
 * only about the SHAs nobody has looked up yet, which is usually none.
 *
 * # A resolved absence is an answer
 *
 * A commit whose author matches no GitHub account resolves to nothing, and the UI falls back to
 * initials — correctly. That absence is stored as `null` rather than left out, because "we asked and
 * there is nobody" and "we never asked" are the same shape to a caller that only checks for a URL,
 * and conflating them means re-asking about the same unmatched author on every render forever.
 *
 * In memory for the session only. It is rebuildable by definition, and a blame gutter's authors are
 * not worth a file on disk.
 */

/**
 * Entries to keep. Blame across a working day touches a few thousand commits at most, and an entry
 * is a short URL — so this is a guard against unbounded growth in a long session, not a budget
 * anyone is expected to hit.
 */
const MAX_ENTRIES = 5000

/** `owner/repo@sha` → the author's avatar URL, or `null` for an author GitHub does not know. */
const cache = new Map<string, string | null>()

function key(owner: string, repo: string, sha: string): string {
  return `${owner}/${repo}@${sha}`
}

export interface CachedAvatars {
  /** `sha → avatar URL`, for the SHAs already resolved to a GitHub account. */
  known: Record<string, string>
  /** The SHAs nobody has asked about yet — the only ones worth a request. */
  missing: string[]
}

/** Splits a list of SHAs into what is already known and what still has to be fetched. */
export function cachedAvatars(owner: string, repo: string, shas: string[]): CachedAvatars {
  const known: Record<string, string> = {}
  const missing: string[] = []
  for (const sha of shas) {
    const entry = cache.get(key(owner, repo, sha))
    if (entry === undefined) missing.push(sha)
    else if (entry !== null) known[sha] = entry
  }
  return { known, missing }
}

/**
 * Records what a lookup found, including the SHAs it found nothing for.
 *
 * `asked` is passed alongside `resolved` precisely so the absences can be stored: the response only
 * names the commits that *have* a GitHub author, and the ones it stays silent about are exactly the
 * ones this must remember not to ask about again.
 */
export function rememberAvatars(
  owner: string,
  repo: string,
  asked: string[],
  resolved: Record<string, string>
): void {
  for (const sha of asked) {
    cache.set(key(owner, repo, sha), resolved[sha] ?? null)
  }
  // Oldest-first, which `Map` iteration gives for free. A commit's author never changes, so there is
  // no cleverer eviction to reach for — any entry is as valid as any other, and the only question is
  // which one is least likely to be asked for again.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

/** Empties the cache. For tests — nothing in the app has a reason to forget a commit's author. */
export function clearGithubAvatarCache(): void {
  cache.clear()
}
