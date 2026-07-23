import { createContext, useContext } from 'react'
import type { MockIssue } from './types'

/**
 * Lets an `IssueRow` open its issue in the Launchpad's in-app issue panel instead of jumping to
 * GitHub. Provided by `PullRequestsPage`; `null` (the default) means "no in-app view available",
 * in which case a row falls back to opening the issue on GitHub. Mirrors {@link OpenPrContext}.
 */
export const OpenIssueContext = createContext<((issue: MockIssue) => void) | null>(null)

export function useOpenIssue(): ((issue: MockIssue) => void) | null {
  return useContext(OpenIssueContext)
}
