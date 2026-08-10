import { SidePanelOverlay } from '@git-manager/components'
import { DialogTitle } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { PrViewPanel } from './PrViewPanel'
import type { MockPR } from '../../../lib/github/types'

interface PrSidePanelProps {
  pr: MockPR
  onClose: () => void
}

/**
 * The Launchpad PR view mounted as a right-hand overlay on top of the list.
 *
 * Wider than the shared default (65% rather than 60%) because this panel can show the files list
 * beside the conversation, which the issue panel has no equivalent of. That was the one real
 * difference between this and {@link IssueSidePanel}, which were otherwise the same forty lines
 * of hand-rolled overlay twice — and neither trapped focus or closed on Escape.
 *
 * No ✕: `PrDetailCenter` fills the top-right corner with its own toolbar, and its Back button on
 * the left already closes the panel. Escape and the backdrop still work.
 */
export function PrSidePanel({ pr, onClose }: PrSidePanelProps) {
  const { t } = useTranslation('launchpad')

  return (
    <SidePanelOverlay
      open
      onClose={onClose}
      testIdPrefix="launchpad-pr"
      widthRatios={{ initial: 0.65, min: 0.5, max: 0.95 }}
      showCloseButton={false}
    >
      {/* The visible heading is `PrDetailCenter`'s own; this names the modal for a screen reader. */}
      <DialogTitle className="sr-only">{t('git:pr.view.title')}</DialogTitle>
      <PrViewPanel pr={pr} onClose={onClose} />
    </SidePanelOverlay>
  )
}
