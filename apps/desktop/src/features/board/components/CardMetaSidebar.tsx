import { useTranslation } from '@git-manager/i18n'
import type { BoardCard, BoardCardPatch, BoardTag } from '@git-manager/git-types'
import { CardTrackingSection } from './CardTrackingSection'
import { CardSidebarPanel } from './CardSidebarPanel'
import { CardPinnedPanel } from './CardPinnedPanel'
import { CardDetailsPanel } from './CardDetailsPanel'

interface CardMetaSidebarProps {
  card: BoardCard
  tags: BoardTag[]
  repoPath: string
  onPatch: (patch: BoardCardPatch) => Promise<unknown>
  /** Adds a tag to the board's palette from here — see `CardTagPicker`. */
  onCreateTag?: (name: string) => Promise<BoardTag | null>
  onCreateBranch?: () => Promise<unknown>
  onCheckoutBranch?: () => Promise<unknown>
  onUnlinkBranch?: () => Promise<unknown>
  /** Severs the link to a tracked GitHub issue — see `CardTrackingSection`. */
  onUntrack?: () => Promise<unknown>
  readOnly?: boolean
}

/**
 * The card's metadata column: named panels of label-and-value rows.
 *
 * Every row saves on its own; there is no draft here and no Save button. That is what a card is — a
 * living record adjusted one field at a time, not a form filled and submitted. This file only
 * decides which panels there are and in what order; each owns its own fields and its own editing
 * state.
 */
export function CardMetaSidebar({
  card,
  tags,
  repoPath,
  onPatch,
  onCreateTag,
  onCreateBranch,
  onCheckoutBranch,
  onUnlinkBranch,
  onUntrack,
  readOnly,
}: CardMetaSidebarProps) {
  const { t } = useTranslation('board')

  return (
    <div data-testid="card-meta-sidebar" className="space-y-3 p-3">
      {/* First, above the fields it governs: on a tracked card those fields belong to the issue. */}
      {card.sourceIssue && onUntrack && (
        <CardSidebarPanel
          title={t('card.tracking.label')}
          sectionKey="card-tracking"
          testId="card-meta-tracking"
        >
          <div className="px-3">
            <CardTrackingSection card={card} onUntrack={onUntrack} readOnly={readOnly} />
          </div>
        </CardSidebarPanel>
      )}

      <CardPinnedPanel card={card} repoPath={repoPath} onPatch={onPatch} readOnly={readOnly} />

      <CardDetailsPanel
        card={card}
        tags={tags}
        onPatch={onPatch}
        onCreateTag={onCreateTag}
        onCreateBranch={onCreateBranch}
        onCheckoutBranch={onCheckoutBranch}
        onUnlinkBranch={onUnlinkBranch}
        readOnly={readOnly}
      />

      {/*
        Not a field, and so not in a panel: when the card was last written is context for everything
        above it rather than one more thing about it.

        Last-updated **only**. `BoardCard` records no creation time — the local backend's history has
        it (every card change is a commit, see `git_board.rs`) and a GitHub issue has `created_at`,
        but neither reaches the shared card shape, and inventing one from `updatedAt` would print a
        date that is simply wrong on every card ever edited.
      */}
      <p data-testid="card-meta-timestamps" className="px-3 text-[10px] text-muted-foreground">
        {t('card.meta.updatedAt', { date: new Date(card.updatedAt).toLocaleString() })}
      </p>
    </div>
  )
}
