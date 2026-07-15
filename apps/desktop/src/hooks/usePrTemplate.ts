import useSWR from 'swr'
import type { PrTemplateDetection } from '@git-manager/git-types'
import { apiGetPrTemplate } from '../api/repo.api'

/** The repo's GitHub PR template(s) on disk, for pre-filling the PR composer. `undefined` while
 * loading; `{ kind: 'none' }` when the repo has no template. */
export function usePrTemplate(repoPath: string | null): {
  template: PrTemplateDetection | undefined
  isLoading: boolean
} {
  const { data, isLoading } = useSWR(
    repoPath ? ['pr-template', repoPath] : null,
    () => apiGetPrTemplate(repoPath as string),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
  return { template: data, isLoading }
}
