import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { showNativeMenu } from '../../../api/nativeMenu.api'
import { apiCreateAndCheckoutBranch } from '../../../api/git.api'
import { buildIssueMenuSpec } from '../../../lib/issueContextMenus'
import { branchMatchesIssue, issueBranchName } from '../../../lib/github/issueBranch'
import { openUrl } from '../../../lib/openUrl'
import { useBranches } from '../../../hooks/useBranches'
import type { MockIssue } from '../../../lib/github/types'

/**
 * The action menu behind a right-click on an issue row in the sidebar.
 *
 * Unlike the Launchpad's {@link useIssueActions}, which has to *find* the issue's local checkout
 * among the added repos, the sidebar already is one repository — so the branch lookup reuses the
 * branch list the sidebar has loaded anyway (`useBranches` is react-query, keyed on the repo, so
 * this costs no extra request) rather than resolving an owner/repo map. The naming rule itself
 * (`issueBranchName` / `branchMatchesIssue`) stays shared with the Launchpad: the two must agree on
 * what "the branch for issue N" is, or one would offer to create what the other already sees.
 */
export function useSidebarIssueMenu(repoPath: string) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { data: branches } = useBranches(repoPath)

  const openIssueMenu = useCallback(
    (e: React.MouseEvent, issue: MockIssue) => {
      e.preventDefault()
      e.stopPropagation()

      const hasBranch = (branches ?? []).some(
        (b) => !b.isRemote && branchMatchesIssue(b.shortName, issue.number)
      )

      async function createBranch() {
        const name = issueBranchName(issue)
        try {
          await apiCreateAndCheckoutBranch(repoPath, name, 'HEAD')
          queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
          toast.success(t('launchpad:issue.branchCreated', { branch: name }))
        } catch (err) {
          toast.error(t('launchpad:issue.branchFailed'), { description: String(err) })
        }
      }

      // Not `copyWithToast`: this reuses the graph's existing "Link copied" confirmation, which is
      // more specific than the generic "<kind> copied to clipboard" that helper produces.
      async function copyLink() {
        try {
          await navigator.clipboard.writeText(issue.url)
          toast.success(t('gitTree.contextMenu.linkCopied'))
        } catch (err) {
          toast.error(String(err))
        }
      }

      void showNativeMenu(
        buildIssueMenuSpec(
          { number: issue.number, hasBranch },
          {
            onCreateBranch: () => void createBranch(),
            onViewOnGitHub: () => void openUrl(issue.url),
            onCopyLink: () => void copyLink(),
          },
          t
        )
      ).catch(console.error)
    },
    [branches, repoPath, queryClient, t]
  )

  return openIssueMenu
}
