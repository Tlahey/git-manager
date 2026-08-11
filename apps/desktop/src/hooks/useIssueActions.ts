import { useMemo, useState } from 'react'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useOpenRepoTab } from './useOpenRepoTab'
import { apiCreateAndCheckoutBranch } from '../api/git.api'
import { setIssueState } from '../api/github.api'
import { issueBranchName } from '../lib/github/issueBranch'
import { openUrl } from '../lib/openUrl'
import { useIssueRepoLink } from './useIssueRepoLink'
import { useGithubAccount } from './useGithubAccount'
import type { MockIssue } from '../lib/github/types'

export interface IssueActions {
  /** Local path of the added repo, or `null` when the issue's repo isn't added. */
  repoPath: string | null
  /** A local branch already referencing the issue, or `null` (→ offer "Create a branch"). */
  branch: string | null
  /** Open the repo's local tab (added repos) or the repo page on GitHub. */
  viewRepo: () => void | Promise<void>
  /** Create + check out a local branch named from the issue. No-op without a local repo. */
  createBranch: () => Promise<void>
  creatingBranch: boolean
  /** Close the issue on GitHub, then revalidate the list. Needs a token + resolvable owner/repo. */
  close: () => Promise<void>
  closing: boolean
  /** Whether closing is possible (token present and owner/repo known). */
  canClose: boolean
}

/**
 * The imperative actions behind an `IssueRow` — View repo, Create a branch, Mark as close — kept out
 * of the presentational row. Reads the active GitHub token from settings, resolves the issue's local
 * repo via {@link useIssueRepoLink}, and surfaces failures through `toast`.
 */
export function useIssueActions(issue: MockIssue, onChanged?: () => void): IssueActions {
  const { t } = useTranslation('launchpad')
  const openRepoTab = useOpenRepoTab()
  const { repoPath, branch, refreshBranch } = useIssueRepoLink(issue)

  const { accountId } = useGithubAccount()
  const ownerRepo = useMemo(() => {
    const [owner, repo] = (issue.fullName ?? '').split('/')
    return owner && repo ? { owner, repo } : null
  }, [issue.fullName])

  const [creatingBranch, setCreatingBranch] = useState(false)
  const [closing, setClosing] = useState(false)

  const viewRepo = () => {
    if (repoPath) openRepoTab(repoPath)
    else return openUrl(issue.fullName ? `https://github.com/${issue.fullName}` : issue.url)
  }

  const createBranch = async () => {
    if (!repoPath || creatingBranch) return
    setCreatingBranch(true)
    try {
      const name = issueBranchName(issue)
      await apiCreateAndCheckoutBranch(repoPath, name, 'HEAD')
      refreshBranch()
      toast.success(t('issue.branchCreated', { branch: name }))
    } catch (e) {
      toast.error(t('issue.branchFailed'), { description: String(e) })
    } finally {
      setCreatingBranch(false)
    }
  }

  const close = async () => {
    if (!ownerRepo || !accountId || closing) return
    setClosing(true)
    try {
      await setIssueState(ownerRepo.owner, ownerRepo.repo, issue.number, 'closed', accountId)
      onChanged?.()
      toast.success(t('issue.closed', { number: issue.number }))
    } catch (e) {
      toast.error(t('issue.closeFailed'), { description: String(e) })
    } finally {
      setClosing(false)
    }
  }

  return {
    repoPath,
    branch,
    viewRepo,
    createBranch,
    creatingBranch,
    close,
    closing,
    canClose: !!ownerRepo && !!accountId,
  }
}
