import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { GitBranch, FolderTree, GitPullRequest } from 'lucide-react'

interface BoardCardBranchSectionProps {
  linkedBranch?: string
  onCreateBranch: () => Promise<unknown>
  onCheckoutBranch: () => Promise<unknown>
  onUnlinkBranch: () => Promise<unknown>
  /** Opens the PR-create view for the linked branch. Synchronous — it only points the app at the
   * view, unlike the other actions here, which write. Omitted where the repository has no
   * connected GitHub account to open a PR against. */
  onCreatePr?: () => void
  /** Worktree section is only offered once a branch is linked — a worktree without the branch that
   * owns it isn't a state this card can represent (see `BoardCard.linkedWorktreePath`). Omit these
   * three together to hide the worktree section entirely (e.g. remote/GitHub-issue boards, which
   * have no worktree concept). */
  linkedWorktreePath?: string
  onCreateWorktree?: () => Promise<unknown>
  onUnlinkWorktree?: () => Promise<unknown>
  disabled?: boolean
}

/** The one capability neither GitHub Projects nor plain git-bug can offer on their own — create (or
 * check out) a branch for this card directly from the board, since that requires being inside an
 * actual git client. Reuses `apiCreateAndCheckoutBranch`, wired in by `BoardPage`. The worktree
 * sub-section below it is the same idea one level further: an isolated checkout to hand off to a
 * coding agent, without leaving the board. */
export function BoardCardBranchSection({
  linkedBranch,
  onCreateBranch,
  onCheckoutBranch,
  onUnlinkBranch,
  onCreatePr,
  linkedWorktreePath,
  onCreateWorktree,
  onUnlinkWorktree,
  disabled,
}: BoardCardBranchSectionProps) {
  const { t } = useTranslation('board')
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setPending(true)
    try {
      await action()
    } finally {
      setPending(false)
    }
  }

  return (
    // Stacked rather than one row: this now lives in a 230px sidebar, where a label and a button
    // side by side overflowed. The label takes the first line, the actions wrap under it.
    <div
      className="flex flex-col gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-2 text-xs"
      data-testid="board-card-branch-section"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {linkedBranch ? (
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {linkedBranch}
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-muted-foreground">{t('card.branch.none')}</span>
        )}
      </span>

      <div className="flex flex-wrap gap-1.5">
        {linkedBranch ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px]"
              disabled={disabled || pending}
              onClick={() => void run(onCheckoutBranch)}
              data-testid="board-card-checkout-branch"
            >
              {t('card.branch.checkout')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] text-destructive hover:text-destructive"
              disabled={disabled || pending}
              onClick={() => void run(onUnlinkBranch)}
              data-testid="board-card-unlink-branch"
            >
              {t('card.branch.unlink')}
            </Button>
            {onCreatePr && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 text-[11px]"
                disabled={disabled}
                onClick={onCreatePr}
                data-testid="board-card-create-pr"
              >
                <GitPullRequest className="h-3 w-3" />
                {t('card.branch.createPr')}
              </Button>
            )}
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-6 w-full gap-1 text-[11px]"
            disabled={disabled || pending}
            onClick={() => void run(onCreateBranch)}
            data-testid="board-card-create-branch"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('card.branch.create')}
          </Button>
        )}
      </div>

      {linkedBranch && (onCreateWorktree || onUnlinkWorktree) && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-1.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <FolderTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {linkedWorktreePath ? (
              <span
                className="min-w-0 flex-1 truncate font-medium text-foreground"
                title={linkedWorktreePath}
              >
                {linkedWorktreePath}
              </span>
            ) : (
              <span className="min-w-0 flex-1 text-muted-foreground">
                {t('card.worktree.none')}
              </span>
            )}
          </span>

          <div className="flex flex-wrap gap-1.5">
            {linkedWorktreePath
              ? onUnlinkWorktree && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-destructive hover:text-destructive"
                    disabled={disabled || pending}
                    onClick={() => void run(onUnlinkWorktree)}
                    data-testid="board-card-unlink-worktree"
                  >
                    {t('card.worktree.unlink')}
                  </Button>
                )
              : onCreateWorktree && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-full gap-1 text-[11px]"
                    disabled={disabled || pending}
                    onClick={() => void run(onCreateWorktree)}
                    data-testid="board-card-create-worktree"
                  >
                    {pending && <Spinner className="h-3 w-3" />}
                    {t('card.worktree.create')}
                  </Button>
                )}
          </div>
        </div>
      )}
    </div>
  )
}
