/**
 * The fixed vocabularies the saved-filter editor offers: which PR statuses can be ticked, which
 * emoji a view can wear, and how each status chip is coloured.
 *
 * Labels are stored as i18n *keys* rather than strings — a module-level map cannot call `t()`.
 */

import type { FilterStatus } from '../stores/launchpad.store'

export const ALL_STATUSES: FilterStatus[] = [
  'open',
  'draft',
  'approved',
  'changes_requested',
  'merged',
  'closed',
]

/** A small hand-picked set rather than a full emoji picker: the point is a glanceable marker in a
 * 52px-wide rail, and fifteen recognisable ones beat every emoji ever encoded. */
export const EMOJI_OPTIONS = [
  '👀',
  '🐛',
  '✨',
  '🚀',
  '🔥',
  '🔒',
  '⚡',
  '📦',
  '🎯',
  '🛠',
  '📋',
  '🧪',
  '💡',
  '🔍',
  '⭐',
]

export const STATUS_CONFIG: Record<FilterStatus, { labelKey: string; className: string }> = {
  open: {
    labelKey: 'status.open',
    className: 'bg-green-500/15 text-green-400 border-green-500/30',
  },
  draft: { labelKey: 'status.draft', className: 'bg-muted text-muted-foreground border-border' },
  approved: {
    labelKey: 'status.approved',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  changes_requested: {
    labelKey: 'status.changes',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  merged: {
    labelKey: 'status.merged',
    className: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  closed: {
    labelKey: 'status.closed',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
}

/** The four free-text criteria, in the order the dialog lists them. Each maps to the `SavedFilter`
 * key it edits, so adding one is an entry here rather than another copy of the field markup. */
export const TEXT_CRITERIA = [
  {
    key: 'titleContains',
    labelKey: 'filterEditor.titleContains',
    placeholderKey: 'filterEditor.titlePlaceholder',
  },
  {
    key: 'authorContains',
    labelKey: 'filterEditor.authorContains',
    placeholderKey: 'filterEditor.authorPlaceholder',
  },
  {
    key: 'repo',
    labelKey: 'filterEditor.repository',
    placeholderKey: 'filterEditor.repoPlaceholder',
  },
  {
    key: 'labelContains',
    labelKey: 'filterEditor.labelContains',
    placeholderKey: 'filterEditor.labelPlaceholder',
  },
] as const
