import useSWR from 'swr'
import { apiGetRemotes } from '../api/git.api'
import { firstParsedRemote, type ParsedRemote } from '../lib/remoteOwner'

/**
 * The owner/organisation a repo belongs to, read from its remotes — the dashboard's owner column.
 *
 * `origin` wins when present, otherwise the first remote that parses; a repo with only local-path
 * remotes (or none) resolves to `null` and the column shows a placeholder. The SWR key is shared
 * with `useRepoGitHub` so a repo listed in several dashboard sections still fetches its remotes
 * once.
 */
export function useRepoOwner(path: string | null): {
  remote: ParsedRemote | null
  /** The remote URL `remote` was parsed from, for the column's tooltip. */
  url: string | null
  isLoading: boolean
} {
  const { data: remotes, isLoading } = useSWR(
    path ? ['repo-remotes', path] : null,
    () => apiGetRemotes(path as string),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  if (!remotes || remotes.length === 0) return { remote: null, url: null, isLoading }

  const origin = remotes.find((r) => r.name === 'origin')
  const ordered = origin ? [origin, ...remotes.filter((r) => r !== origin)] : remotes
  const remote = firstParsedRemote(ordered.map((r) => r.url))
  if (!remote) return { remote: null, url: null, isLoading }

  const url = ordered.find((r) => firstParsedRemote([r.url]) !== null)?.url ?? null
  return { remote, url, isLoading }
}
