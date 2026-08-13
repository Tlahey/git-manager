import { useState, type ReactNode } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { AlertTriangle } from 'lucide-react'
import type { BoardCard, BoardCardKind, BoardCardPatch, BoardTag } from '@git-manager/git-types'
import { resolveCardTags } from '../lib/cardMeta'
import { CardChoiceList } from './CardChoiceList'
import { CardKindIcon } from './CardKindIcon'
import { CardTagPicker } from './CardTagPicker'
import { CardBlockedSection } from './CardBlockedSection'
import { BoardCardBranchSection } from './BoardCardBranchSection'
import { CardSidebarPanel } from './CardSidebarPanel'
import { CardFieldRow } from './CardFieldRow'

interface CardDetailsPanelProps {
  card: BoardCard
  tags: BoardTag[]
  onPatch: (patch: BoardCardPatch) => Promise<unknown>
  /** Adds a tag to the board's palette from here — see `CardTagPicker`. */
  onCreateTag?: (name: string) => Promise<BoardTag | null>
  onCreateBranch?: () => Promise<unknown>
  onCheckoutBranch?: () => Promise<unknown>
  onUnlinkBranch?: () => Promise<unknown>
  onCreatePr?: () => void
  onCreateWorktree?: () => Promise<unknown>
  onUnlinkWorktree?: () => Promise<unknown>
  readOnly?: boolean
}

type EditTarget = 'kind' | 'tags' | null

const KINDS: BoardCardKind[] = ['task', 'bug', 'epic']

/**
 * Everything about the card that isn't one of the three pinned fields: what sort of work it is, how
 * it is labelled, what is holding it up and which branch carries it.
 *
 * The last two are more than a value, so they keep their own components and sit at the end of the
 * panel, where a taller row costs nothing.
 */
export function CardDetailsPanel({
  card,
  tags,
  onPatch,
  onCreateTag,
  onCreateBranch,
  onCheckoutBranch,
  onUnlinkBranch,
  onCreatePr,
  onCreateWorktree,
  onUnlinkWorktree,
  readOnly,
}: CardDetailsPanelProps) {
  const { t } = useTranslation('board')
  const [editing, setEditing] = useState<EditTarget>(null)
  const cardTags = resolveCardTags({ tags }, card)

  /** Wires one field's choices to the panel's single open slot — one field open at a time. On a
   * closed sprint it hands back no editor at all, which is what leaves the row as plain text. */
  const editorFor = (target: Exclude<EditTarget, null>, editor: ReactNode) =>
    readOnly
      ? {}
      : {
          editor,
          open: editing === target,
          onOpenChange: (next: boolean) => setEditing(next ? target : null),
        }

  return (
    <CardSidebarPanel
      title={t('card.panel.details')}
      sectionKey="card-details"
      testId="card-panel-details"
    >
      {/* A kind is picked at creation, but a task that turns out to be a bug is the normal course
        of events — so it stays editable rather than being frozen at the one moment the user knew
        least about the work. */}
      <CardFieldRow
        label={t('card.meta.kind')}
        testId="card-meta-kind"
        editTitle={t('card.meta.editKind')}
        {...editorFor(
          'kind',
          <CardChoiceList
            ariaLabel={t('card.meta.kind')}
            value={card.kind}
            options={KINDS.map((value) => ({
              value,
              label: t(`card.kind.${value}`),
              icon: <CardKindIcon kind={value} />,
            }))}
            onSelect={(next) => {
              void onPatch({ kind: next })
              setEditing(null)
            }}
            testIdPrefix="card-kind-option"
          />
        )}
      >
        <CardKindIcon kind={card.kind} withLabel />
      </CardFieldRow>

      <CardFieldRow
        label={t('card.tags.label')}
        testId="card-meta-tags"
        editTitle={t('card.meta.editTags')}
        addLabel={t('card.meta.addTags')}
        filled={cardTags.length > 0}
        {...editorFor(
          'tags',
          <CardTagPicker
            tags={tags}
            selectedIds={card.tagIds}
            onToggle={(tagId) =>
              void onPatch({
                tagIds: card.tagIds.includes(tagId)
                  ? card.tagIds.filter((id) => id !== tagId)
                  : [...card.tagIds, tagId],
              })
            }
            onCreate={onCreateTag ?? (() => Promise.resolve(null))}
            onClose={() => setEditing(null)}
          />
        )}
      >
        <ul className="flex flex-wrap gap-1">
          {cardTags.map((tag) => (
            <li
              key={tag.id}
              data-testid={`card-meta-tag-${tag.id}`}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
              style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
              {tag.name}
            </li>
          ))}
        </ul>
      </CardFieldRow>

      <div data-testid="card-meta-blocked" className="px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">{t('card.blocked.label')}</span>
        <div className="mt-1">
          {readOnly ? (
            card.blockedReason ? (
              <p className="flex items-start gap-1 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {card.blockedReason}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                {t('card.meta.notBlocked')}
              </p>
            )
          ) : (
            <CardBlockedInlineEditor reason={card.blockedReason ?? ''} onPatch={onPatch} />
          )}
        </div>
      </div>

      {onCreateBranch && onCheckoutBranch && onUnlinkBranch && (
        <div data-testid="card-meta-branch" className="px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground">{t('card.branch.label')}</span>
          <div className="mt-1">
            <BoardCardBranchSection
              linkedBranch={card.linkedBranch}
              onCreateBranch={onCreateBranch}
              onCheckoutBranch={onCheckoutBranch}
              onUnlinkBranch={onUnlinkBranch}
              onCreatePr={onCreatePr}
              linkedWorktreePath={card.linkedWorktreePath}
              onCreateWorktree={onCreateWorktree}
              onUnlinkWorktree={onUnlinkWorktree}
              disabled={readOnly}
            />
          </div>
        </div>
      )}
    </CardSidebarPanel>
  )
}

/** Wraps `CardBlockedSection` so its toggle-and-reason pair commits on blur instead of waiting for a
 * dialog-wide Save that no longer exists. */
function CardBlockedInlineEditor({
  reason,
  onPatch,
}: {
  reason: string
  onPatch: (patch: BoardCardPatch) => Promise<unknown>
}) {
  const [draft, setDraft] = useState(reason)
  const [blocked, setBlocked] = useState(Boolean(reason))

  function commit(nextBlocked: boolean, nextReason: string) {
    const value = nextBlocked ? nextReason.trim() || null : null
    if ((value ?? '') === reason) return
    void onPatch({ blockedReason: value })
  }

  return (
    <div onBlur={() => commit(blocked, draft)}>
      <CardBlockedSection
        reason={draft}
        onChange={setDraft}
        blocked={blocked}
        onBlockedChange={(next) => {
          setBlocked(next)
          // Turning it off is unambiguous, so it saves at once; turning it on waits for a reason,
          // since a card cannot be blocked without one.
          if (!next) commit(false, '')
        }}
      />
    </div>
  )
}
