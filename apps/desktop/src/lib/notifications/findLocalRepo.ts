import { apiGetRemotes } from '../../api/git.api'
import { firstGitHubOwnerRepo } from '../githubRemote'

/** The part of an added repo this lookup needs — structurally satisfied by `SavedRepo`. */
export interface LocalRepoCandidate {
  path: string
  name: string
}

/**
 * The GitHub repository a notification is about, in the two forms the payload can carry it.
 * `fullName` is the one that identifies a repository; `name` alone is ambiguous (two owners can
 * both have a `docs`) and is only used as a last resort.
 */
export interface GitHubRepoRef {
  fullName?: string
  name: string
}

/**
 * Finds the added repo that is the local clone of `target`, or `null` when it isn't cloned.
 *
 * Matching is by the repo's own GitHub remote rather than by folder name — a checkout can live in
 * a directory called anything, and `git-manager-2` is a perfectly ordinary name for a second
 * worktree of the same project. The repo *name* is only consulted when no remote matched, which
 * covers the case where the notification came from mock data or a payload GitHub didn't qualify.
 *
 * Imperative on purpose: this runs from a click handler (an OS banner's, in the background), where
 * there is no component to hang `useIssueRepoLink`'s SWR equivalent off.
 */
export async function findLocalRepoPath(
  target: GitHubRepoRef,
  savedRepos: LocalRepoCandidate[]
): Promise<string | null> {
  const wanted = target.fullName?.toLowerCase()

  if (wanted) {
    for (const repo of savedRepos) {
      try {
        const remotes = await apiGetRemotes(repo.path)
        const ownerRepo = firstGitHubOwnerRepo(remotes.map((r) => r.url))
        if (ownerRepo && `${ownerRepo.owner}/${ownerRepo.repo}`.toLowerCase() === wanted) {
          return repo.path
        }
      } catch {
        // An added repo that can't be read (moved, unmounted drive) simply isn't the match.
      }
    }
  }

  return savedRepos.find((r) => r.name === target.name)?.path ?? null
}
