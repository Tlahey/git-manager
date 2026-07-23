import { createContext, useContext } from 'react'
import type { MockPR } from './types'

/**
 * Lets a `PRRow` open its pull request in the Launchpad's in-app PR view instead of jumping to
 * GitHub. Provided by `PullRequestsPage`; `null` (the default) means "no in-app view available",
 * in which case a row falls back to opening the PR on GitHub. A context keeps the wiring out of
 * every intermediate tab's props (the rows live several components deep across four tabs).
 */
export const OpenPrContext = createContext<((pr: MockPR) => void) | null>(null)

export function useOpenPr(): ((pr: MockPR) => void) | null {
  return useContext(OpenPrContext)
}
