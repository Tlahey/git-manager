import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { GitBranch } from 'lucide-react'

interface BoardCardBranchSectionProps {
  linkedBranch?: string
  onCreateBranch: () => Promise<unknown>
  onCheckoutBranch: () => Promise<unknown>
  onUnlinkBranch: () => Promise<unknown>
  disabled?: boolean
}

/** The one capability neither GitHub Projects nor plain git-bug can offer on their own — create (or
 * check out) a branch for this card directly from the board, since that requires being inside an
 * actual git client. Reuses `apiCreateAndCheckoutBranch`, wired in by `BoardPage`. */
export function BoardCardBranchSection({
  linkedBranch,
  onCreateBranch,
  onCheckoutBranch,
  onUnlinkBranch,
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
    </div>
  )
}
