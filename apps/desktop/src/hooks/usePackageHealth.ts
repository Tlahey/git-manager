import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import {
  apiCheckOutdatedPackages,
  apiGetPackageChangelog,
  apiHasPackageManifest,
  apiRunPackageHealthCheck,
  apiUpdatePackages,
} from '../api/packageHealth.api'

/** Whether the repo has a root `package.json`, so the Tools menu can gate the entry. */
export function useHasPackageManifest(repoPath: string | null) {
  return useSWR(
    repoPath ? ['has-package-manifest', repoPath] : null,
    () => apiHasPackageManifest(repoPath as string),
    { revalidateOnFocus: false }
  )
}

/** The offline report. Cheap enough to load as soon as the panel opens. */
export function usePackageHealth(repoPath: string | null) {
  return useSWR(
    repoPath ? ['package-health', repoPath] : null,
    () => apiRunPackageHealthCheck(repoPath as string),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
}

/**
 * The registry-backed "is anything out of date?" pass, run as soon as the updates
 * page opens.
 *
 * A query rather than a mutation so the cache decides whether it has already run:
 * the first mount fetches, and `revalidateIfStale: false` means leaving the page
 * and coming back reuses the answer instead of shelling out to pnpm again. It is
 * still slow and still hits the network, so nothing else revalidates it — not
 * focus, not reconnect — and a refresh is an explicit `mutate()`.
 */
export function useOutdatedPackages(repoPath: string | null, packageManager: string | undefined) {
  return useSWR(
    repoPath && packageManager ? ['outdated-packages', repoPath, packageManager] : null,
    () => apiCheckOutdatedPackages(repoPath as string, packageManager as string),
    { revalidateOnFocus: false, revalidateIfStale: false, revalidateOnReconnect: false }
  )
}

/**
 * Release notes for one package's pending update. A query rather than a mutation:
 * it opens on demand (the row has to be expanded) and its answer is worth caching
 * per version pair, since the user will collapse and reopen while deciding.
 */
export function usePackageChangelog(
  repoPath: string | null,
  name: string | null,
  from: string,
  to: string,
  token?: string
) {
  return useSWR(
    repoPath && name ? ['package-changelog', repoPath, name, from, to] : null,
    () => apiGetPackageChangelog(repoPath as string, name as string, from, to, token),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
}

/**
 * Runs the update. A mutation because it changes the repo — never on mount, never
 * on revalidation, only from a click.
 */
export function useUpdatePackages(repoPath: string | null, packageManager: string | undefined) {
  return useSWRMutation(
    repoPath && packageManager ? ['update-packages', repoPath, packageManager] : null,
    (_key: unknown, { arg }: { arg: { names: string[]; toLatest: boolean } }) =>
      apiUpdatePackages(repoPath as string, packageManager as string, arg.names, arg.toLatest),
    { throwOnError: false }
  )
}
