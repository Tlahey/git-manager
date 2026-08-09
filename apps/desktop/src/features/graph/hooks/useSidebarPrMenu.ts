import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { PullRequest } from '@git-manager/git-types'
import { showNativeMenu } from '../../../api/nativeMenu.api'
import { apiCheckoutBranch } from '../../../api/git.api'
import { buildPullRequestMenuSpec } from '../../../lib/prContextMenus'
import { openUrl } from '../../../app/pull-requests/utils'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useAiEnabled } from '../../../hooks/useAiEnabled'
import { useBranches } from '../../../hooks/useBranches'

interface UseSidebarPrMenuParams {
  repoPath: string
  /** Filters the graph to a branch — the sidebar owns that selection, so it is passed in. */
  onSelectBranch: (name: string) => void
  /** Opens the worktree dialog seeded with the PR's head branch. */
  onCreateWorktree: (branch: string) => void
}

/**
 * The action menu behind a pull request row's "…" button (and its right-click).
 *
 * The branch-scoped entries are gated on the PR's head existing *locally*: the backend's checkout
 * resolves a local branch or a raw OID and nothing else, so offering to check out a head that has
 * never been fetched would only produce "Branch not found". The branch list is the one the sidebar
 * already loads (react-query, keyed on the repo), so the check costs no extra request.
 */
export function useSidebarPrMenu({
  repoPath,
  onSelectBranch,
  onCreateWorktree,
}: UseSidebarPrMenuParams) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const aiEnabled = useAiEnabled()
  const { data: branches } = useBranches(repoPath)
  const setAiPanelTarget = useRepoUIStore((s) => s.setAiPanelTarget)

  return useCallback(
    (e: React.MouseEvent, pr: PullRequest) => {
      e.preventDefault()
      e.stopPropagation()

      const hasLocalBranch = (branches ?? []).some((b) => !b.isRemote && b.shortName === pr.headRef)

      async function copyLink() {
        try {
          await navigator.clipboard.writeText(pr.url)
          toast.success(t('gitTree.contextMenu.linkCopied'))
        } catch (err) {
          toast.error(String(err))
        }
      }

      async function checkout() {
        try {
          await apiCheckoutBranch(repoPath, pr.headRef)
          queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
          toast.success(t('sidebar.prMenu.checkedOut', { branch: pr.headRef }))
        } catch (err) {
          toast.error(String(err))
        }
      }

      void showNativeMenu(
        buildPullRequestMenuSpec(
          { number: pr.number, hasLocalBranch, aiEnabled },
          {
            onViewOnGitHub: () => void openUrl(pr.url),
            onCopyLink: () => void copyLink(),
            // The review runs over the PR's range, so it is the same target the graph's
            // "review branch changes" produces — one panel, one shape of request.
            onReview: () =>
              setAiPanelTarget({
                kind: 'reviewBranch',
                branch: pr.headRef,
                baseRef: pr.baseRef,
              }),
            onGoToBranch: () => onSelectBranch(pr.headRef),
            onCheckout: () => void checkout(),
            onCreateWorktree: () => onCreateWorktree(pr.headRef),
          },
          t
        )
      ).catch(console.error)
    },
    [
      branches,
      repoPath,
      aiEnabled,
      queryClient,
      setAiPanelTarget,
      onSelectBranch,
      onCreateWorktree,
      t,
    ]
  )
}
