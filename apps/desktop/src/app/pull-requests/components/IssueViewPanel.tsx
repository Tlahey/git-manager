import { useMemo } from 'react'
import { RepoGitHubOverrideContext } from '../../../hooks/useRepoGitHub'
import { IssueDetailCenter } from '../../../components/git-graph/issue/IssueDetailCenter'
import type { MockIssue } from '../types'

interface IssueViewPanelProps {
  issue: MockIssue
  onClose: () => void
  onChanged?: () => void
}

/**
 * The in-app issue view for a Launchpad issue — mirrors {@link PrViewPanel}. The issue's GitHub
 * `owner/repo` (from `fullName`) is provided via {@link RepoGitHubOverrideContext} so the detail +
 * comment hooks resolve it without the repo being cloned locally; `repoPath` is that `owner/repo`
 * string, used only as a stable cache discriminator.
 */
export function IssueViewPanel({ issue, onClose, onChanged }: IssueViewPanelProps) {
  const ownerRepo = useMemo(() => {
    const [owner, repo] = (issue.fullName ?? '').split('/')
    return owner && repo ? { owner, repo } : null
  }, [issue.fullName])

  return (
    <RepoGitHubOverrideContext.Provider value={ownerRepo}>
      <IssueDetailCenter
        repoPath={issue.fullName ?? ''}
        issueNumber={issue.number}
        issue={issue}
        onClose={onClose}
        onChanged={onChanged}
      />
    </RepoGitHubOverrideContext.Provider>
  )
}
