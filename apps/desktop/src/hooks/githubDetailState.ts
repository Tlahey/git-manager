/**
 * The loading/error gate shared by `usePrDetail` and `useIssueDetail`.
 *
 * Both hooks build their SWR key from three things that resolve independently — the selected
 * number, the repo's `owner/repo` (itself an async remotes lookup) and the active account id — and
 * SWR treats a `null` key as "nothing to do": no request, `isLoading` false, `error` undefined.
 * A panel that renders a spinner on `isLoading || !data` therefore spins *forever* whenever any of
 * those three is missing, showing nothing and reporting nothing. That was a real bug twice over:
 * once for a repo whose remotes never resolved to a GitHub URL, and once for a connected-looking
 * account whose token had been orphaned by the credential-backend change, which left `accountId`
 * usable but every request failing.
 *
 * So the gate is computed here rather than inline: each way of having nothing to show is named,
 * and "we never even tried" can no longer be mistaken for "still loading".
 */

/** Why a detail panel has nothing to show, when that is not simply "still loading". */
export type GithubDetailFailure =
  | { reason: 'remotes'; cause: unknown }
  | { reason: 'no-github-remote' }
  | { reason: 'no-account' }
  | { reason: 'fetch'; cause: unknown }

export interface GithubDetailStateInput {
  /** False when nothing is selected — the panel is closed, so neither state applies. */
  enabled: boolean
  accountId: string | null
  ownerRepo: unknown
  isResolvingRemotes: boolean
  remotesError: unknown
  /** The detail fetch's own SWR state. */
  isFetching: boolean
  fetchError: unknown
}

export interface GithubDetailState {
  isLoading: boolean
  failure: GithubDetailFailure | undefined
}

export function resolveGithubDetailState({
  enabled,
  accountId,
  ownerRepo,
  isResolvingRemotes,
  remotesError,
  isFetching,
  fetchError,
}: GithubDetailStateInput): GithubDetailState {
  if (!enabled) return { isLoading: false, failure: undefined }

  if (remotesError) return { isLoading: false, failure: { reason: 'remotes', cause: remotesError } }

  // Still resolving `owner/repo`: genuinely loading, and not yet evidence of anything missing.
  if (isResolvingRemotes) return { isLoading: true, failure: undefined }

  if (!ownerRepo) return { isLoading: false, failure: { reason: 'no-github-remote' } }
  if (!accountId) return { isLoading: false, failure: { reason: 'no-account' } }

  if (fetchError) return { isLoading: false, failure: { reason: 'fetch', cause: fetchError } }
  return { isLoading: isFetching, failure: undefined }
}

/** The underlying error message, when there is one worth showing beside the headline. */
export function describeGithubDetailFailure(failure: GithubDetailFailure): string | undefined {
  if (failure.reason !== 'remotes' && failure.reason !== 'fetch') return undefined
  const { cause } = failure
  if (cause instanceof Error) return cause.message
  return typeof cause === 'string' && cause.trim() !== '' ? cause : undefined
}
