import useSWR from 'swr'
import { apiGetBisectState } from '../api/git.api'

/** SWR key for a repo's bisect state — exported so mutating actions can revalidate it. */
export const bisectStateKey = (repoPath: string | null) =>
  repoPath ? (['bisect-state', repoPath] as const) : null

/**
 * Current `git bisect` state for a repo. Revalidates on focus so a bisect started from an external
 * terminal is picked up; the in-app actions update the cache directly with the state they return.
 */
export function useBisectState(repoPath: string | null) {
  return useSWR(
    bisectStateKey(repoPath),
    () => apiGetBisectState(repoPath as string),
    {
      revalidateOnFocus: true,
      revalidateIfStale: true,
    }
  )
}
