import { SidePanelOverlay } from '@git-manager/components'
import { DialogTitle } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { IssueViewPanel } from './IssueViewPanel'
import type { MockIssue } from '../../../lib/github/types'

interface IssueSidePanelProps {
  issue: MockIssue
  onClose: () => void
  onChanged?: () => void
}

/**
 * The Launchpad issue view mounted as a right-hand overlay on top of the list — the issue-side twin
 * of {@link PrSidePanel}. It takes the shared default width; the PR one is wider because it can
 * show a files list, which is the only thing that ever justified two components here.
 *
 * No ✕, for the same reason as its twin: `IssueDetailCenter` owns the top-right corner and offers
 * its own Back button.
 */
export function IssueSidePanel({ issue, onClose, onChanged }: IssueSidePanelProps) {
  const { t } = useTranslation('launchpad')

  return (
    <SidePanelOverlay open onClose={onClose} testIdPrefix="launchpad-issue" showCloseButton={false}>
      {/* The visible heading is `IssueDetailCenter`'s own; this names the modal for a screen reader. */}
      <DialogTitle className="sr-only">{t('git:issue.view.title')}</DialogTitle>
      <IssueViewPanel issue={issue} onClose={onClose} onChanged={onChanged} />
    </SidePanelOverlay>
  )
}
