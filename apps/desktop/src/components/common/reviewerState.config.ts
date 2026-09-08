// How one reviewer's standing on a pull request is shown: an icon, a colour and a label key, per
// state of `PrReviewer`. Shared because two surfaces render the same list — the sidebar's PR hover
// card and the PR detail panel's Reviewers section — and a reviewer who is "Approved" in one and
// something else in the other would be a bug nobody would think to look for.

import { Check, Clock, MessageSquare, X, type LucideIcon } from 'lucide-react'
import type { PrReviewer } from '../../api/github.api'

export interface ReviewerStateStyle {
  Icon: LucideIcon
  className: string
  /** i18n key (namespace `git`). */
  labelKey: string
}

export const REVIEWER_STATE_STYLES: Record<PrReviewer['state'], ReviewerStateStyle> = {
  APPROVED: {
    Icon: Check,
    className: 'text-green-400',
    labelKey: 'pr.reviewState.approved',
  },
  CHANGES_REQUESTED: {
    Icon: X,
    className: 'text-red-400',
    labelKey: 'pr.reviewState.changesRequested',
  },
  COMMENTED: {
    Icon: MessageSquare,
    className: 'text-muted-foreground',
    labelKey: 'pr.reviewState.commented',
  },
  PENDING: {
    Icon: Clock,
    className: 'text-amber-400',
    labelKey: 'pr.reviewState.pending',
  },
}
