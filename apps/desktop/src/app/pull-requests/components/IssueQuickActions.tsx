import { useState } from 'react'
import { Eye, CircleCheck, FolderGit2, ExternalLink, Link as LinkIcon } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@git-manager/ui'
import { SplitButton, type SplitButtonAction } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import type { MockIssue } from '../types'
import { openUrl } from '../utils'
import { useOpenIssue } from '../OpenIssueContext'

interface IssueQuickActionsProps {
  issue: MockIssue
  /** Open the repo's local tab (or GitHub) — from {@link useIssueActions}. */
  viewRepo: () => void
  /** Close the issue on GitHub — from {@link useIssueActions}. */
  close: () => Promise<void>
  closing: boolean
  /** Whether closing is possible (token present and owner/repo known). */
  canClose: boolean
}

/**
 * The per-row split button for an issue, mirroring {@link PrQuickActions}: a primary that opens the
 * issue (in-app panel when available, else GitHub), with the rest — Mark as closed (behind a
 * confirm dialog), View repo, Open on GitHub, Copy link — in its dropdown. Pin and snooze stay as
 * hover icons on the row's left edge.
 */
export function IssueQuickActions({ issue, viewRepo, close, closing, canClose }: IssueQuickActionsProps) {
  const { t } = useTranslation('launchpad')
  const openIssue = useOpenIssue()
  const [confirmClose, setConfirmClose] = useState(false)

  const openPanel = () => (openIssue ? openIssue(issue) : openUrl(issue.url))

  const rest: (SplitButtonAction | null)[] = [
    issue.status === 'open' && canClose
      ? {
          key: 'close',
          label: t('row.markClosed'),
          icon: <CircleCheck className="h-3.5 w-3.5" />,
          onSelect: () => setConfirmClose(true),
        }
      : null,
    {
      key: 'viewRepo',
      label: t('row.viewRepo'),
      icon: <FolderGit2 className="h-3.5 w-3.5" />,
      onSelect: viewRepo,
    },
    {
      key: 'openGitHub',
      label: t('row.openOnGitHub'),
      icon: <ExternalLink className="h-3.5 w-3.5" />,
      onSelect: () => openUrl(issue.url),
    },
    {
      key: 'copyLink',
      label: t('row.copyLink'),
      icon: <LinkIcon className="h-3.5 w-3.5" />,
      onSelect: () => navigator.clipboard.writeText(issue.url),
    },
  ]
  const actions = rest.filter((a): a is SplitButtonAction => a !== null)

  return (
    <>
      <SplitButton
        size="sm"
        variant="outline"
        label={t('row.view')}
        icon={<Eye className="h-3.5 w-3.5" />}
        onClick={openPanel}
        actions={actions}
        busy={closing}
        align="right"
        testIdPrefix={`issue-actions-${issue.id}`}
      />

      <Dialog open={confirmClose} onOpenChange={(open) => !open && setConfirmClose(false)}>
        <DialogContent className="w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <CircleCheck className="h-4 w-4 text-tone-success" />
              {t('issue.closeConfirmTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('issue.closeConfirmBody', { number: issue.number, title: issue.title })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={closing} onClick={() => setConfirmClose(false)}>
              {t('issue.closeConfirmCancel')}
            </Button>
            <Button
              size="sm"
              disabled={closing}
              onClick={async () => {
                await close()
                setConfirmClose(false)
              }}
            >
              {t('row.markClosed')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
